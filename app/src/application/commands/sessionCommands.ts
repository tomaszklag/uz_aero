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

/** Wejście `drop` — numer wyniesienia i klient dopełniane z projekcji. */
export interface DropInput {
  jumpers: JumperCounts;
  altitudeFt?: number | null;
  dropNumber?: number;
  position?: GpsPosition | null;
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

  refuel(ctx: SessionContext, payload: RefuelPayload): Promise<CommandResult> {
    return this.execute(ctx, 'refuel', () => ({ payload }));
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
        jumpers: input.jumpers,
        client: state.client,
        position: input.position ?? null,
      },
    }));
  }

  crewChange(ctx: SessionContext, payload: CrewChangePayload): Promise<CommandResult> {
    return this.execute(ctx, 'crew_change', () => ({ payload }));
  }

  /** Wpis ręczny (§3.8) — jedyny nośnik korekty historii, także po `day_close` (24 h). */
  manualLogEntry(ctx: SessionContext, payload: ManualLogEntryPayload): Promise<CommandResult> {
    return this.execute(ctx, 'manual_log_entry', () => ({ payload }));
  }

  /**
   * Potwierdzenie WZLOTU (ekran 09, §3.6) — jednostka potwierdzania danych.
   *
   * `legIndex` bierzemy z projekcji, nie od wołającego: numer musi wskazywać
   * NAJSTARSZY niepotwierdzony zamknięty wzlot, bo pilot mógł odłożyć potwierdzenie
   * wcześniejszego („Potwierdzę później") i wraca do kolejki od najstarszego.
   * Ekran nie ma powodu tego wiedzieć, a gdyby liczył sam, rozjechałby się po korekcie
   * unieważniającej cykl.
   *
   * `reading` jest OPCJONALNY — w serii skokowej nikt nie chodzi do licznika po każdym
   * wzlocie. Gdy jest, staje się pełnoprawnym ogniwem łańcucha (§4.1 pkt 5).
   */
  closeLeg(
    ctx: SessionContext,
    input: { reading?: FuelMhReading | null; notes?: string | null } = {},
  ): Promise<CommandResult> {
    return this.execute(ctx, 'leg_close', (state) => ({
      payload: {
        legIndex: state.legs.find((l) => l.stoppedAt != null && !l.confirmed)?.index ?? 1,
        reading: input.reading ?? null,
        notes: input.notes ?? null,
      },
    }));
  }

  /**
   * ZDANIE SAMOLOTU (ekran 09B). Typ zdarzenia nazywa się historycznie `day_close`,
   * ale od 2026-08-06 **nie kończy dnia pilota** — kończy jego pracę z tą maszyną.
   * Służba liczy się dalej, a kolejny samolot wejdzie do tej samej doby (§3.6).
   *
   * `dutyEnd` jest opcjonalny i domyślnie go NIE wysyłamy: klamrę domyka pilot na `01b`
   * albo domyka się sama na ostatnim wzlocie. Podajemy go tylko wtedy, gdy pilot
   * świadomie zadeklarował koniec służby przy zdawaniu maszyny.
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
