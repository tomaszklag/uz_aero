/**
 * UZ Aero — store sesji (Zustand) — CIENKA warstwa nad `application`.
 *
 * Store nie zna reguł ani bazy. Robi trzy rzeczy:
 *  1. trzyma tożsamość bieżącej sesji (`context`) i podaje ją komendom,
 *  2. woła komendę i po zapisie odświeża projekcję zapytaniami,
 *  3. wystawia UI to, co ekran ma narysować: `projection`, `outboxCount`, `warnings`, `lastError`.
 *
 * Cała walidacja siedzi w `domain/rules` i jest egzekwowana przez `SessionCommands` —
 * gdyby ekran wołał komendę z pominięciem store'u, reguły i tak obowiązują.
 *
 * Dane sesji są ZAWSZE świeże (źródłem prawdy jest telefon) — zero wariantów offline
 * w tej warstwie (§6 pkt 1). Wskaźnik łączności to wyłącznie `outboxCount`/`synced`
 * (SyncChip), liczony z outboxa.
 */

import { create } from 'zustand';

import {
  emptySessionState,
  type CrewChangePayload,
  type DayClosePayload,
  type DetectionMethod,
  type EngineStartPayload,
  type EngineStopPayload,
  type EpochMillis,
  type Event,
  type EventCorrectionPayload,
  type GpsPosition,
  type ManualLogEntryPayload,
  type PreflightConfirmPayload,
  type RefuelPayload,
  type RuleViolation,
  type SessionState,
} from '../../domain';
import {
  SessionCommands,
  SessionQueries,
  type ClaimInput,
  type CommandResult,
  type DropInput,
  type EventsRepo,
  type SessionContext,
} from '../../application';

export type { ClaimInput, SessionContext };

export interface SessionStore {
  /** Warstwa danych — potrzebna wyłącznie do księgowości outboxa (`markSynced`, §4.3). */
  repo: EventsRepo | null;
  commands: SessionCommands | null;
  queries: SessionQueries | null;

  /** Tożsamość bieżącej sesji (null przed claimem). */
  context: SessionContext | null;
  /** Strumień zdarzeń bieżącej sesji (kolejność zapisu). */
  events: Event[];
  /** Projekcja: stan i statystyki dnia. */
  projection: SessionState;
  /** Liczba zdarzeń w outboxie (zasila SyncChip). */
  outboxCount: number;
  /** true, gdy outbox pusty (SyncChip = SYNC). */
  synced: boolean;
  /** Miękkie flagi ostatniej udanej komendy (banner „zapisane, ale sprawdź"). */
  warnings: RuleViolation[];
  /** Komunikat ostatniego odrzucenia (twarda reguła) — null po udanej komendzie. */
  lastError: string | null;

  /** Podłącza gotowe warstwy (composition root aplikacji). */
  attach(deps: { repo: EventsRepo; commands: SessionCommands; queries: SessionQueries }): void;
  /** Skrót: buduje komendy i zapytania z repozytorium. */
  attachRepo(repo: EventsRepo): void;

  /** Rozpoczyna/przejmuje sesję: emituje `session_claim` i ustawia kontekst (§4.4). */
  claim(input: ClaimInput): Promise<CommandResult>;
  confirmPreflight(payload: PreflightConfirmPayload): Promise<CommandResult>;
  startEngine(payload?: EngineStartPayload): Promise<CommandResult>;
  stopEngine(payload?: EngineStopPayload): Promise<CommandResult>;
  /** Rozpoczęcie kołowania — bez okna „COFNIJ", zapis natychmiastowy. */
  taxi(
    method?: DetectionMethod,
    position?: GpsPosition | null,
    at?: EpochMillis,
  ): Promise<CommandResult>;
  /** `at` = rzeczywisty czas zdarzenia, gdy różni się od chwili zapisu (§5.1). */
  takeoff(
    method?: DetectionMethod,
    position?: GpsPosition | null,
    at?: EpochMillis,
  ): Promise<CommandResult>;
  landing(
    method?: DetectionMethod,
    position?: GpsPosition | null,
    at?: EpochMillis,
  ): Promise<CommandResult>;
  refuel(payload: RefuelPayload): Promise<CommandResult>;
  /** Korekta zdarzenia (04c) — zmiana czasu albo unieważnienie, zapis append-only. */
  correctEvent(payload: EventCorrectionPayload): Promise<CommandResult>;
  drop(input: DropInput): Promise<CommandResult>;
  crewChange(payload: CrewChangePayload): Promise<CommandResult>;
  manualLogEntry(payload: ManualLogEntryPayload): Promise<CommandResult>;
  dayClose(payload: DayClosePayload): Promise<CommandResult>;

  /** Wczytuje istniejącą sesję z bazy i odtwarza kontekst (np. po restarcie aplikacji). */
  loadSession(sessionUuid: string): Promise<void>;
  /** Oznacza zdarzenia jako wysłane i odświeża licznik outboxa (księgowość §4.3). */
  markSynced(uuids: string[]): Promise<void>;
  /** Przelicza projekcję i licznik outboxa (po cyklu synca). */
  refreshOutbox(): Promise<void>;
  /** Czyści stan w pamięci (wylogowanie / nowy dzień) — nie kasuje bazy. */
  reset(): void;
}

export const useSessionStore = create<SessionStore>((set, get) => {
  /** Brak podłączonych warstw to błąd programistyczny, nie stan runtime. */
  function requireCommands(): SessionCommands {
    const { commands } = get();
    if (!commands) throw new Error('SessionStore: warstwa komend nie podłączona (attachRepo).');
    return commands;
  }

  function requireQueries(): SessionQueries {
    const { queries } = get();
    if (!queries) throw new Error('SessionStore: warstwa zapytań nie podłączona (attachRepo).');
    return queries;
  }

  /** Akcje dnia wymagają wcześniejszego `claim`. */
  function requireContext(): SessionContext {
    const { context } = get();
    if (!context) throw new Error('SessionStore: brak sesji (najpierw claim).');
    return context;
  }

  /** Przelicza `events`/`projection`/`outboxCount` z warstwy danych. */
  async function refresh(): Promise<void> {
    const queries = requireQueries();
    const { context } = get();
    const events = context ? await queries.sessionEvents(context.sessionUuid) : [];
    const outbox = await queries.outboxStatus();
    set({
      events,
      projection: context ? await queries.sessionState(context.sessionUuid) : emptySessionState(),
      outboxCount: outbox.count,
      synced: outbox.synced,
    });
  }

  /**
   * Wspólna ścieżka: komenda → odświeżenie → zapamiętanie ostrzeżeń.
   * Twarde odrzucenie (`DomainRuleError`) zapisujemy w `lastError` DLA UI i rzucamy dalej,
   * żeby wołający (np. modal potwierdzenia) mógł zareagować — cichy błąd jest zakazany
   * (§6 pkt 3: „nigdy cichy błąd").
   */
  async function run(action: () => Promise<CommandResult>): Promise<CommandResult> {
    try {
      const result = await action();
      await refresh();
      set({ warnings: result.warnings, lastError: null });
      return result;
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  return {
    repo: null,
    commands: null,
    queries: null,
    context: null,
    events: [],
    projection: emptySessionState(),
    outboxCount: 0,
    synced: true,
    warnings: [],
    lastError: null,

    attach(deps) {
      set({ repo: deps.repo, commands: deps.commands, queries: deps.queries });
    },

    attachRepo(repo) {
      set({
        repo,
        commands: new SessionCommands(repo),
        queries: new SessionQueries(repo),
      });
    },

    claim(input) {
      const context: SessionContext = {
        sessionUuid: input.sessionUuid,
        aircraftId: input.aircraftId,
        picId: input.picId,
        dualId: input.dualId ?? null,
      };
      // Kontekst ustawiamy PRZED komendą, żeby `refresh()` po zapisie miał czego szukać.
      set({ context });
      return run(() => requireCommands().claim(input));
    },

    confirmPreflight(payload) {
      return run(() => requireCommands().confirmPreflight(requireContext(), payload));
    },

    startEngine(payload = {}) {
      return run(() => requireCommands().startEngine(requireContext(), payload));
    },

    stopEngine(payload = {}) {
      return run(() => requireCommands().stopEngine(requireContext(), payload));
    },

    taxi(method = 'manual', position = null, at) {
      return run(() => requireCommands().taxi(requireContext(), method, position, at));
    },

    takeoff(method = 'manual', position = null, at) {
      return run(() => requireCommands().takeoff(requireContext(), method, position, at));
    },

    landing(method = 'manual', position = null, at) {
      return run(() => requireCommands().landing(requireContext(), method, position, at));
    },

    refuel(payload) {
      return run(() => requireCommands().refuel(requireContext(), payload));
    },

    correctEvent(payload) {
      return run(() => requireCommands().correctEvent(requireContext(), payload));
    },

    drop(input) {
      return run(() => requireCommands().drop(requireContext(), input));
    },

    async crewChange(payload) {
      const ctx = requireContext();
      const result = await run(() => requireCommands().crewChange(ctx, payload));
      // Zmiana PIC jest odrzucana przez regułę (single-writer, §4.1 pkt 3), więc do
      // kontekstu może wejść wyłącznie nowy Dual — i dopiero po udanym zapisie.
      if (payload.role === 'dual') {
        set({ context: { ...ctx, dualId: payload.pilotInId ?? null } });
      }
      return result;
    },

    manualLogEntry(payload) {
      return run(() => requireCommands().manualLogEntry(requireContext(), payload));
    },

    dayClose(payload) {
      return run(() => requireCommands().dayClose(requireContext(), payload));
    },

    async loadSession(sessionUuid) {
      const queries = requireQueries();
      const events = await queries.sessionEvents(sessionUuid);
      const projection = await queries.sessionState(sessionUuid);
      const context: SessionContext | null =
        projection.sessionUuid && projection.aircraftId && projection.picId
          ? {
              sessionUuid: projection.sessionUuid,
              aircraftId: projection.aircraftId,
              picId: projection.picId,
              dualId: projection.dualId,
            }
          : null;
      const outbox = await queries.outboxStatus();
      set({
        context,
        events,
        projection,
        outboxCount: outbox.count,
        synced: outbox.synced,
        warnings: [],
        lastError: null,
      });
    },

    async markSynced(uuids) {
      const { repo } = get();
      if (!repo) throw new Error('SessionStore: repo nie podłączone (attachRepo).');
      await repo.markSynced(uuids);
      await refresh();
    },

    refreshOutbox() {
      return refresh();
    },

    reset() {
      set({
        context: null,
        events: [],
        projection: emptySessionState(),
        outboxCount: 0,
        synced: true,
        warnings: [],
        lastError: null,
      });
    },
  };
});
