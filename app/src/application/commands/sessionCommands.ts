/**
 * UZ Aero — KOMENDY dnia lotnego (przypadki użycia strony zapisu).
 *
 * Jedno miejsce, w którym intencja pilota („chcę wystartować", „tankuję 48 L") zamienia
 * się w zdarzenie. Każda komenda przechodzi tę samą, jedyną ścieżkę zapisu:
 *
 *   1. wczytaj strumień sesji z magazynu       (stan trwały, nie ekranowy)
 *   2. zbuduj projekcję `projectSession`       (co wiemy o dniu)
 *   3. ostempluj kandydata `repo.stampEvent`   (uuid + oba zegary)
 *   4. sprawdź inwarianty `checkAppend`        (domena — czysta funkcja)
 *   5. twarde naruszenie → wyjątek, NIC się nie zapisuje
 *   6. zapisz `repo.appendStamped` i zwróć miękkie ostrzeżenia
 *
 * DLACZEGO STAN CZYTAMY Z BAZY, a nie ze store'u: gwardia ma obowiązywać niezależnie od
 * tego, co akurat trzyma UI — po restarcie aplikacji, przy dwóch ekranach naraz i przy
 * zdarzeniu z autodetekcji GPS. Kilkaset zdarzeń dziennie (§5.2) sprawia, że koszt
 * przeliczenia jest nieistotny, a niezależność od pamięci UI — nie.
 *
 * KOMENDY SĄ BEZSTANOWE: kontekst sesji (`SessionContext`) przychodzi argumentem.
 * Dzięki temu test komendy to jedno wywołanie, bez ceremonii „najpierw zaloguj".
 */

import {
  aircraftLimitsFrom,
  assertNoErrors,
  checkAppend,
  projectSession,
  warningsOf,
  type AircraftLimits,
  type AppendEventInput,
  type CrewChangePayload,
  type DayClosePayload,
  type FuelMhReading,
  type DetectionMethod,
  type EngineStartPayload,
  type EngineStopPayload,
  type EpochMillis,
  type EventPayloadMap,
  type EventType,
  type GpsPosition,
  type JumperCounts,
  type ManualLogEntryPayload,
  type OperationType,
  type PreflightConfirmPayload,
  type EventCorrectionPayload,
  type RefuelPayload,
  type SessionClaimMode,
  type SessionState,
} from '../../domain';
import type { EventsRepo } from '../eventsRepo';
import { SESSION_META_KEYS } from '../ports';
import type { CommandResult } from './commandResult';

/** Tożsamość nagłówka zdarzeń (single-writer, §4.1 pkt 3). */
export interface SessionContext {
  sessionUuid: string;
  aircraftId: string;
  picId: string;
  dualId: string | null;
}

/** Wejście `claim` — rozpoczęcie lub przejęcie sesji (§4.4). */
export interface ClaimInput extends SessionContext {
  mode: SessionClaimMode;
  previousPicId?: string | null;
  /** Jawny czas GPS (`null` = brak fixa); pominięty → z zegara. */
  gpsTime?: EpochMillis | null;
}

/** Jeden lot wpisu ręcznego — para start → lądowanie wewnątrz biegu silnika. */
export interface ManualFlightLeg {
  takeoff: EpochMillis;
  landing: EpochMillis;
}

/** Zrzut wpisu ręcznego — czas + opcjonalny skład (null = „niepodany", nie zero). */
export interface ManualFlightDrop {
  at: EpochMillis;
  jumpers: JumperCounts | null;
  altitudeFt?: number | null;
}

/**
 * Dolewka wpisu ręcznego. Trójka before/added/after jest spójna z `RefuelPayload` —
 * `refuel` nie ma korekty `amend` właśnie dlatego, że niesie trójkę, więc wpis ręczny
 * też nie może jej rozłamać na osobne pola.
 */
export interface ManualFlightRefuel {
  at: EpochMillis;
  beforeL: number;
  addedL: number;
  afterL: number;
}

/**
 * Wejście `manualFlight` (ekrany 15 → 15C) — kompletna sesja wpisana po fakcie.
 *
 * PARITA Z LOTEM AUTOMATYCZNYM (przebudowa 2026-08-16): wpis po fakcie opisuje ten
 * sam lot, co zapis z kokpitu, więc niesie ten sam komplet — rodzaj operacji,
 * lotniska, klienta, Duala, DOWOLNIE WIELE lotów w jednym biegu, zrzuty i dolewki.
 * Poprzednia wersja wpisywała twardo `operation: 'inne'`, jedną parę start–lądowanie
 * i zgadywała odczyt początkowy z cache — lot szkolny gubił Duala, dzień skokowy
 * wymagał dziesięciu korekt po zapisaniu, a sesja z dolewką nie dawała się wpisać
 * w ogóle.
 */
export interface ManualFlightInput {
  sessionUuid: string;
  aircraftId: string;
  picId: string;
  dualId: string | null;
  operation: OperationType;
  departureIcao?: string | null;
  arrivalIcao?: string | null;
  client?: string | null;
  /** Bieg silnika — dokładnie jeden na sesję (SESSION_ALREADY_RAN). */
  engine: { start: EpochMillis; stop: EpochMillis };
  /** Loty wewnątrz biegu, w dowolnej kolejności — komenda sortuje po czasie. */
  flights: ManualFlightLeg[];
  drops?: ManualFlightDrop[];
  /**
   * Dolewki — wyłącznie PRZED uruchomieniem albo PO zatrzymaniu silnika: dolewa się
   * przy zatrzymanym śmigle (`REFUEL_ENGINE_RUNNING` jest twardym błędem). Dolewka
   * w środku biegu odbije się w próbie generalnej i wpis NIE zostanie zapisany.
   */
  refuels?: ManualFlightRefuel[];
  /**
   * Odczyt PRZED uruchomieniem — od 2026-08-16 wpisywany przez pilota (krok 4),
   * nie zgadywany z cache: pilot ma go na kartce, a zgadnięte ogniwo psuło łańcuch
   * MH następnemu pilotowi.
   */
  initialReading: FuelMhReading;
  /** Odczyt po locie — WYMAGANY, staje się przekazaniem (te same reguły co 09b). */
  finalReading: FuelMhReading;
  notes?: string | null;
}

/** Wejście `drop` — numer wyniesienia i klient dopełniane z projekcji. */
export interface DropInput {
  /** Skład z liczników arkusza 05e; suma 0 = „skład niepodany" (normalizacja niżej). */
  jumpers: JumperCounts;
  altitudeFt?: number | null;
  dropNumber?: number;
  position?: GpsPosition | null;
  /**
   * Kiedy zdarzenie NAPRAWDĘ zaszło, jeśli różni się od chwili zapisu (§5.1) — tak samo
   * jak przy starcie i lądowaniu. Potrzebne od issue #43: zdarzenia dopisywane po fakcie
   * w trybie edycji sesji muszą wylądować na osi tam, gdzie się wydarzyły, a nie tam,
   * gdzie pilot je sobie przypomniał.
   */
  at?: EpochMillis;
}

/** Wejście `boarding` (załadunek, issue #21 pkt 7) — te same liczniki co zrzut. */
export interface BoardingInput {
  jumpers: JumperCounts;
  /** Czas rzeczywisty zdarzenia — patrz `DropInput.at`. */
  at?: EpochMillis;
}

/**
 * Skład o sumie 0 zapisujemy jako `null` — „nie podano", nie „zero skoczków".
 * Arkusze nie mają pola „bez deklaracji": pilot po prostu nie rusza liczników, a znak
 * tej decyzji nie może zależeć od tego, który ekran zapisywał (zrzut i załadunek
 * normalizują identycznie).
 */
function declaredJumpers(jumpers: JumperCounts): JumperCounts | null {
  return jumpers.tandem + jumpers.aff + jumpers.solo > 0 ? jumpers : null;
}

export class SessionCommands {
  /**
   * Konfiguracje samolotów zmieniają się rzadko (§4.8 „wolnozmienne"), a czytamy je przy
   * każdej komendzie paliwowej — pamięć podręczna na czas życia obiektu wystarczy.
   */
  private readonly limitsCache = new Map<string, AircraftLimits>();

  constructor(private readonly repo: EventsRepo) {}

  // ── sesja i preflight ───────────────────────────────────────────────────────

  /**
   * Rozpoczyna lub przejmuje sesję (§4.4). Claim jest OPTYMISTYCZNY — lokalnie zawsze
   * można zostać PIC-em; konflikt dwóch telefonów wykrywa serwer (flaga `DOUBLE_CLAIM`).
   * Lokalna gwardia pilnuje tylko tego, co widać z telefonu: jedna sesja = jeden claim.
   */
  async claim(input: ClaimInput): Promise<CommandResult> {
    const result = await this.execute(input, 'session_claim', () => ({
      payload: { mode: input.mode, previousPicId: input.previousPicId ?? null },
      gpsTime: input.gpsTime,
    }));
    // Dopiero po udanym claimie zapamiętujemy sesję w `session_meta` — restart aplikacji
    // ma wrócić do dnia, który naprawdę się zaczął (§5.2).
    await this.repo.setCurrentSession({
      sessionUuid: input.sessionUuid,
      pilotId: input.picId,
      aircraftId: input.aircraftId,
    });
    // Osobny klucz dla usługi GPS w tle: writer headless przypisuje nim fixy po
    // śmierci procesu. Żyje dokładnie tak długo, jak pilot trzyma samolot — czyści go
    // `releaseAircraft` (zdanie maszyny), nie zamknięcie dnia: dzień pilota trwa dalej.
    await this.repo.setMeta(SESSION_META_KEYS.activeSessionUuid, input.sessionUuid);
    return result;
  }

  confirmPreflight(ctx: SessionContext, payload: PreflightConfirmPayload): Promise<CommandResult> {
    return this.execute(ctx, 'preflight_confirm', () => ({ payload }));
  }

  // ── cykl silnika i lot ──────────────────────────────────────────────────────

  startEngine(ctx: SessionContext, payload: EngineStartPayload = {}): Promise<CommandResult> {
    return this.execute(ctx, 'engine_start', () => ({ payload }));
  }

  stopEngine(ctx: SessionContext, payload: EngineStopPayload = {}): Promise<CommandResult> {
    return this.execute(ctx, 'engine_stop', () => ({ payload }));
  }

  /** Start: `auto` po upływie okna „Cofnij" w toaście, `manual` z przycisku korekty (§3.3). */
  /**
   * Rozpoczęcie kołowania — otwiera lot w logu cyklu (mockup 05).
   *
   * Nie ma okna „COFNIJ": kołowanie nie wpływa ani na czas blokowy, ani na czas lotu,
   * więc pomyłka kosztuje jeden wiersz w logu, a nie błędny wpis w dokumentach.
   */
  taxi(
    ctx: SessionContext,
    method: DetectionMethod = 'manual',
    position: GpsPosition | null = null,
    at?: EpochMillis,
  ): Promise<CommandResult> {
    return this.execute(ctx, 'taxi', () => ({
      payload: { method, position },
      ...(at !== undefined ? { gpsTime: at } : {}),
    }));
  }

  /**
   * `at` = kiedy zdarzenie NAPRAWDĘ zaszło, jeśli różni się od chwili zapisu (§5.1,
   * dwa zegary). Dwa realne przypadki:
   *  • autodetekcja — zdarzenie ma czas fixa GPS, nie czas wyjścia z okna „COFNIJ";
   *  • wpis ręczny (05f) — pilot cofa czas, bo zorientował się po fakcie.
   * Bez tego oba zapisywałyby się z opóźnieniem, o które nikt później nie zapyta.
   */
  takeoff(
    ctx: SessionContext,
    method: DetectionMethod = 'manual',
    position: GpsPosition | null = null,
    at?: EpochMillis,
  ): Promise<CommandResult> {
    return this.execute(ctx, 'takeoff', () => ({
      payload: { method, position },
      ...(at !== undefined ? { gpsTime: at } : {}),
    }));
  }

  landing(
    ctx: SessionContext,
    method: DetectionMethod = 'manual',
    position: GpsPosition | null = null,
    at?: EpochMillis,
  ): Promise<CommandResult> {
    return this.execute(ctx, 'landing', () => ({
      payload: { method, position },
      ...(at !== undefined ? { gpsTime: at } : {}),
    }));
  }

  // ── akcje ground i rozliczenie ──────────────────────────────────────────────

  /** `at` — tankowanie dopisane po fakcie (issue #43); domyślnie chwila zapisu. */
  refuel(ctx: SessionContext, payload: RefuelPayload, at?: EpochMillis): Promise<CommandResult> {
    return this.execute(ctx, 'refuel', () => ({
      payload,
      ...(at !== undefined ? { gpsTime: at } : {}),
    }));
  }

  /**
   * Korekta zdarzenia (04c): zmiana czasu albo unieważnienie — zawsze jako NOWE
   * zdarzenie, oryginał zostaje w rejestrze (append-only). Walidację celu i okna 24 h
   * po zamknięciu dnia robią reguły; tu tylko zapis.
   */
  correctEvent(ctx: SessionContext, payload: EventCorrectionPayload): Promise<CommandResult> {
    return this.execute(ctx, 'event_correction', () => ({ payload }));
  }

  /** Zrzut; `dropNumber` domyślnie kolejny, klient dziedziczony z preflightu (§5.1). */
  drop(ctx: SessionContext, input: DropInput): Promise<CommandResult> {
    return this.execute(ctx, 'drop', (state) => ({
      payload: {
        dropNumber: input.dropNumber ?? state.drops.count + 1,
        altitudeFt: input.altitudeFt ?? null,
        jumpers: declaredJumpers(input.jumpers),
        client: state.client,
        position: input.position ?? null,
      },
      ...(input.at !== undefined ? { gpsTime: input.at } : {}),
    }));
  }

  /** Załadunek skoczków (issue #21 pkt 7) — znacznik faktu, skład opcjonalny. */
  boarding(ctx: SessionContext, input: BoardingInput): Promise<CommandResult> {
    return this.execute(ctx, 'boarding', () => ({
      payload: { jumpers: declaredJumpers(input.jumpers) },
      ...(input.at !== undefined ? { gpsTime: input.at } : {}),
    }));
  }

  crewChange(ctx: SessionContext, payload: CrewChangePayload): Promise<CommandResult> {
    return this.execute(ctx, 'crew_change', () => ({ payload }));
  }

  /** Wpis ręczny (§3.8) — jedyny nośnik korekty historii, także po `day_close` (24 h). */
  manualLogEntry(ctx: SessionContext, payload: ManualLogEntryPayload): Promise<CommandResult> {
    return this.execute(ctx, 'manual_log_entry', () => ({ payload }));
  }

  // `closeLeg` (potwierdzenie wzlotu, ekran 09) żyło tu między 2026-08-06 a 2026-08-10
  // — usunięte razem z `leg_close`: sesję zatwierdza `releaseAircraft` (`day_close`).

  /**
   * ZDANIE SAMOLOTU (ekran 09B). Typ zdarzenia nazywa się historycznie `day_close`,
   * ale od 2026-08-06 **nie kończy dnia pilota** — kończy jego pracę z tą maszyną.
   * Kolejny samolot dopisze się do listy sesji tej samej doby (§3.6; klamra służby
   * i jej `dutyEnd` usunięte 2026-08-11 razem z issue #23).
   */
  async releaseAircraft(
    ctx: SessionContext,
    payload: DayClosePayload,
  ): Promise<CommandResult> {
    const result = await this.execute(ctx, 'day_close', () => ({ payload }));
    // Samolot zdany = usługa GPS w tle nie ma już do czego przypisywać fixów.
    // Czyścimy dopiero PO udanym zapisie — odrzucone zdanie zostawia klucz.
    await this.repo.deleteMeta(SESSION_META_KEYS.activeSessionUuid);
    return result;
  }

  // ── ręczny wpis CAŁEGO lotu (ekran 15, model 2026-08-10) ────────────────────

  /**
   * Tworzy KOMPLETNĄ sesję po fakcie: przejęcie → preflight → jeden bieg silnika
   * z jednym lotem → zdanie z odczytami. Dla lotów zapisanych poza telefonem
   * (papier, rozładowana bateria).
   *
   * Dwie rzeczy różnią tę ścieżkę od zwykłych komend:
   *  • **czasy pilota jadą w `gpsTime`** (eventTime = gpsTime ?? deviceTime, §5.1) —
   *    chwila zapisu zostaje w `deviceTime`, dokładnie jak przy wpisie ręcznym 05f.
   *    Wyjątkiem jest `day_close`: BEZ gpsTime, bo zatwierdzenie zapada TERAZ i od
   *    „teraz" ma biec okno korekty — wpis sprzed dwóch dni z kotwicą w przeszłości
   *    rodziłby się z oknem już wygasłym;
   *  • **próba generalna przed pierwszym zapisem**: strumień jest append-only i nie ma
   *    transakcji, więc odrzucone piąte zdarzenie zostawiłoby osieroconą, otwartą
   *    sesję. Wszystkie kandydaty przechodzą przez `checkAppend` na stanie liczonym
   *    w pamięci — zapis rusza dopiero, gdy przejdzie KOMPLET.
   *
   * Świadomie NIE dotykamy `session_meta` (bieżąca sesja, klucz usługi GPS): to wpis
   * historyczny — restart aplikacji nie ma prawa „wznowić" pilota w cudzej przeszłości.
   */
  async manualFlight(input: ManualFlightInput): Promise<CommandResult> {
    const ctx: SessionContext = {
      sessionUuid: input.sessionUuid,
      aircraftId: input.aircraftId,
      picId: input.picId,
      dualId: input.dualId,
    };

    type Draft = { type: EventType; payload: unknown; gpsTime?: EpochMillis };

    // ── zdarzenia biegu w porządku CZASU, nie formularza ─────────────────────
    // Loty i zrzuty przychodzą listami; scalamy je po `gpsTime`, żeby strumień
    // czytał się jak prawdziwy dzień. Przy równym stemplu zrzut stoi MIĘDZY startem
    // a lądowaniem swojej pary (rank), tak jak w `sessionAxis.ts`.
    // Dolewki dzielą się na PRZED biegiem i PO nim — w środku biegu dolewki nie ma,
    // bo dolewa się przy zatrzymanym śmigle (`REFUEL_ENGINE_RUNNING` to twardy błąd).
    // Dolewka z czasem ze ŚRODKA biegu świadomie wchodzi do sekwencji w swoim
    // miejscu czasowym, żeby próba generalna odrzuciła ją tym nazwanym błędem —
    // przesunięcie jej za wyłączenie ukrywałoby błąd w danych pilota.
    const refuelDraft = (r: ManualFlightRefuel): Draft => ({
      type: 'refuel',
      payload: { beforeL: r.beforeL, addedL: r.addedL, afterL: r.afterL },
      gpsTime: r.at,
    });
    const refuels = [...(input.refuels ?? [])].sort((a, b) => a.at - b.at);
    const refuelsBefore = refuels.filter((r) => r.at <= input.engine.start).map(refuelDraft);
    const refuelsAfter = refuels.filter((r) => r.at >= input.engine.stop).map(refuelDraft);
    const refuelsMidRun = refuels
      .filter((r) => r.at > input.engine.start && r.at < input.engine.stop)
      .map(refuelDraft);

    const RANK = { takeoff: 0, drop: 1, refuel: 1, landing: 2 } as const;
    const inRun: Draft[] = [
      ...input.flights.flatMap((f): Draft[] => [
        { type: 'takeoff', payload: { method: 'manual' }, gpsTime: f.takeoff },
        { type: 'landing', payload: { method: 'manual' }, gpsTime: f.landing },
      ]),
      ...(input.drops ?? []).map(
        (d, i): Draft => ({
          type: 'drop',
          payload: {
            dropNumber: i + 1,
            jumpers: d.jumpers,
            altitudeFt: d.altitudeFt ?? null,
            client: input.client ?? null,
          },
          gpsTime: d.at,
        }),
      ),
      ...refuelsMidRun,
    ].sort(
      (a, b) =>
        a.gpsTime! - b.gpsTime! ||
        RANK[a.type as keyof typeof RANK] - RANK[b.type as keyof typeof RANK],
    );

    const drafts: Draft[] = [
      {
        type: 'session_claim',
        // `manualEntry` — jawny znacznik wpisu po fakcie (plakietka „RĘCZNIE");
        // z metody zdarzeń nie da się go wywieść, bo `manual` niesie też zwykły
        // lot z ręcznymi przyciskami.
        payload: { mode: 'free', previousPicId: null, manualEntry: true },
        gpsTime: input.engine.start,
      },
      {
        type: 'preflight_confirm',
        // Ten sam komplet, co na 02E (parita z lotem automatycznym, 2026-08-16).
        // `dualId` w PAYLOADZIE, nie tylko w nagłówku — payload jest faktem
        // o składzie załogi i jego nośnikiem korekty (issue #43).
        payload: {
          operation: input.operation,
          departureIcao: input.departureIcao ?? null,
          arrivalIcao: input.arrivalIcao ?? null,
          client: input.client ?? null,
          dualId: input.dualId,
          reading: input.initialReading,
          notes: input.notes ?? null,
        },
        gpsTime: input.engine.start,
      },
      ...refuelsBefore,
      { type: 'engine_start', payload: {}, gpsTime: input.engine.start },
      ...inRun,
      { type: 'engine_stop', payload: {}, gpsTime: input.engine.stop },
      ...refuelsAfter,
      {
        type: 'day_close',
        payload: { finalReading: input.finalReading, noFlightReason: null },
      },
    ];

    const limits = await this.limitsFor(input.aircraftId);

    // Próba generalna: stemplujemy i sprawdzamy KAŻDE zdarzenie na stanie liczonym
    // w pamięci, zanim jakiekolwiek trafi do bazy.
    const stamped = [];
    let state = projectSession([]);
    const warnings = [];
    for (const draft of drafts) {
      const candidate = this.repo.stampEvent({
        sessionUuid: ctx.sessionUuid,
        aircraftId: ctx.aircraftId,
        picId: ctx.picId,
        dualId: ctx.dualId,
        type: draft.type,
        payload: draft.payload,
        ...(draft.gpsTime !== undefined ? { gpsTime: draft.gpsTime } : {}),
      } as AppendEventInput);
      const violations = checkAppend(state, candidate, limits);
      assertNoErrors(violations);
      warnings.push(...warningsOf(violations));
      stamped.push(candidate);
      state = projectSession([...stamped]);
    }

    let last = stamped[0]!;
    for (const candidate of stamped) {
      last = await this.repo.appendStamped(candidate);
    }
    return { event: last, warnings };
  }

  // ── wspólna ścieżka zapisu ──────────────────────────────────────────────────

  /**
   * Jedyna droga zdarzenia do bazy. Wszystkie komendy przechodzą tędy, więc nowa reguła
   * w `domain/rules` obowiązuje je automatycznie — nie ma „zapomnianej" ścieżki zapisu.
   */
  private async execute<K extends EventType>(
    ctx: SessionContext,
    type: K,
    build: (state: SessionState) => {
      payload: EventPayloadMap[K];
      gpsTime?: EpochMillis | null;
    },
  ): Promise<CommandResult> {
    const events = await this.repo.getSessionEvents(ctx.sessionUuid);
    const state = projectSession(events);
    const draft = build(state);

    // Jedyny rzut w warstwie komend: kompilator nie utrzymuje korelacji `type`↔`payload`
    // przy generyku K, choć w miejscu wywołania jest ona wymuszona (`EventPayloadMap[K]`).
    const input = {
      sessionUuid: ctx.sessionUuid,
      aircraftId: ctx.aircraftId,
      picId: ctx.picId,
      dualId: ctx.dualId,
      type,
      payload: draft.payload,
      ...(draft.gpsTime !== undefined ? { gpsTime: draft.gpsTime } : {}),
    } as AppendEventInput;

    const candidate = this.repo.stampEvent(input);
    const violations = checkAppend(state, candidate, await this.limitsFor(ctx.aircraftId));

    // Twarde naruszenie → wyjątek PRZED zapisem: strumień append-only nigdy nie zobaczy
    // zdarzenia, które nie mogło się wydarzyć.
    assertNoErrors(violations);

    const event = await this.repo.appendStamped(candidate);
    return { event, warnings: warningsOf(violations) };
  }

  /** Limity samolotu z cache referencyjnego; brak wpisu = limity nieznane (§4.8). */
  private async limitsFor(aircraftId: string): Promise<AircraftLimits> {
    const cached = this.limitsCache.get(aircraftId);
    if (cached) return cached;
    const limits = aircraftLimitsFrom(await this.repo.getAircraftById(aircraftId));
    this.limitsCache.set(aircraftId, limits);
    return limits;
  }
}
