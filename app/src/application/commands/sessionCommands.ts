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
  type RefuelPayload,
  type SessionClaimMode,
  type SessionState,
} from '../../domain';
import type { EventsRepo } from '../eventsRepo';
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
  takeoff(
    ctx: SessionContext,
    method: DetectionMethod = 'manual',
    position: GpsPosition | null = null,
  ): Promise<CommandResult> {
    return this.execute(ctx, 'takeoff', () => ({ payload: { method, position } }));
  }

  landing(
    ctx: SessionContext,
    method: DetectionMethod = 'manual',
    position: GpsPosition | null = null,
  ): Promise<CommandResult> {
    return this.execute(ctx, 'landing', () => ({ payload: { method, position } }));
  }

  // ── akcje ground i rozliczenie ──────────────────────────────────────────────

  refuel(ctx: SessionContext, payload: RefuelPayload): Promise<CommandResult> {
    return this.execute(ctx, 'refuel', () => ({ payload }));
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

  dayClose(ctx: SessionContext, payload: DayClosePayload): Promise<CommandResult> {
    return this.execute(ctx, 'day_close', () => ({ payload }));
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
