/**
 * UZ Aero — store sesji (Zustand) (docs/_main.md.txt §5.2, §6).
 *
 * Stan bieżącej sesji to PROJEKCJA liczona w pamięci ze strumienia zdarzeń (§5.2) —
 * store NIE trzyma „stanu" jako tabel agregujących. Każda akcja = `appendEvent` do
 * warstwy danych + przeliczenie projekcji (`projectSession`). To spina czyste funkcje
 * (`logic/projections`) z repozytorium (`db/eventsRepo`) w kontroler dnia lotnego.
 *
 * Dane sesji są ZAWSZE świeże (źródłem prawdy jest telefon) — zero wariantów offline
 * w tej warstwie (§6 pkt 1). Wskaźnik łączności to wyłącznie `outboxCount`/`synced`
 * (SyncChip), liczone z outboxa.
 *
 * Store działa w Node/Jest (zależy tylko od repo + czystych projekcji) — testowalny
 * na `InMemoryAdapter` bez natywnej bazy.
 */

import { create } from 'zustand';

import type { EpochMillis } from '../types/time';
import type {
  CrewChangePayload,
  DayClosePayload,
  DetectionMethod,
  EngineStartPayload,
  EngineStopPayload,
  Event,
  GpsPosition,
  JumperCounts,
  ManualLogEntryPayload,
  PreflightConfirmPayload,
  RefuelPayload,
  SessionClaimMode,
} from '../types/events';
import { EventsRepo } from '../db/eventsRepo';
import {
  emptySessionState,
  projectSession,
  type SessionState,
} from '../logic/projections';

/** Tożsamość używana do budowy nagłówków zdarzeń (single-writer, §4.1). */
export interface SessionContext {
  sessionUuid: string;
  aircraftId: string;
  picId: string;
  dualId: string | null;
}

export interface ClaimInput {
  sessionUuid: string;
  aircraftId: string;
  picId: string;
  dualId?: string | null;
  mode: SessionClaimMode;
  previousPicId?: string | null;
  gpsTime?: EpochMillis | null;
}

export interface SessionStore {
  /** Repozytorium warstwy danych (wstrzykiwane przez `attachRepo`). */
  repo: EventsRepo | null;
  /** Tożsamość bieżącej sesji (null przed claimem). */
  context: SessionContext | null;
  /** Strumień zdarzeń bieżącej sesji (kolejność chronologiczna). */
  events: Event[];
  /** Projekcja: stan i statystyki dnia. */
  projection: SessionState;
  /** Liczba zdarzeń w outboxie (zasila SyncChip). */
  outboxCount: number;
  /** true, gdy outbox pusty (SyncChip = SYNC). */
  synced: boolean;

  /** Podłącza repozytorium (raz, po inicjalizacji bazy). */
  attachRepo(repo: EventsRepo): void;

  /** Rozpoczyna/przejmuje sesję: emituje `session_claim` i ustawia kontekst (§4.4). */
  claim(input: ClaimInput): Promise<Event>;
  /** Emituje `preflight_confirm` (trasa, operacja, duty start, odczyt FOB+MH). */
  confirmPreflight(payload: PreflightConfirmPayload): Promise<Event>;
  startEngine(payload?: EngineStartPayload): Promise<Event>;
  stopEngine(payload?: EngineStopPayload): Promise<Event>;
  /** Zapisuje start (auto = po AutodetectToast, manual = ręcznie). */
  takeoff(method?: DetectionMethod, position?: GpsPosition | null): Promise<Event>;
  landing(method?: DetectionMethod, position?: GpsPosition | null): Promise<Event>;
  refuel(payload: RefuelPayload): Promise<Event>;
  /** Zrzut; `dropNumber` domyślnie kolejny z projekcji, klient dziedziczony z preflightu. */
  drop(input: {
    jumpers: JumperCounts;
    altitudeFt?: number | null;
    dropNumber?: number;
    position?: GpsPosition | null;
  }): Promise<Event>;
  crewChange(payload: CrewChangePayload): Promise<Event>;
  manualLogEntry(payload: ManualLogEntryPayload): Promise<Event>;
  dayClose(payload: DayClosePayload): Promise<Event>;

  /** Wczytuje istniejącą sesję z bazy i odtwarza kontekst (np. po restarcie aplikacji). */
  loadSession(sessionUuid: string): Promise<void>;
  /** Oznacza zdarzenia jako wysłane i odświeża licznik outboxa. */
  markSynced(uuids: string[]): Promise<void>;
  /** Przelicza licznik outboxa (po cyklu synca). */
  refreshOutbox(): Promise<void>;
  /** Czyści stan w pamięci (wylogowanie / nowy dzień) — nie kasuje bazy. */
  reset(): void;
}

export const useSessionStore = create<SessionStore>((set, get) => {
  /** Zwraca repo lub rzuca — brak repo to błąd programistyczny (nie stan runtime). */
  function requireRepo(): EventsRepo {
    const { repo } = get();
    if (!repo) throw new Error('SessionStore: repo nie podłączone (attachRepo).');
    return repo;
  }

  /** Zwraca kontekst lub rzuca — akcje dnia wymagają wcześniejszego `claim`. */
  function requireContext(): SessionContext {
    const { context } = get();
    if (!context) throw new Error('SessionStore: brak sesji (najpierw claim).');
    return context;
  }

  /** Przelicza `events`/`projection`/`outboxCount` z warstwy danych. */
  async function refresh(): Promise<void> {
    const repo = requireRepo();
    const { context } = get();
    const events = context ? await repo.getSessionEvents(context.sessionUuid) : [];
    const outboxCount = await repo.getOutboxCount();
    set({
      events,
      projection: projectSession(events),
      outboxCount,
      synced: outboxCount === 0,
    });
  }

  /** Wspólna ścieżka zapisu: append + przeliczenie projekcji. */
  async function emit(input: Parameters<EventsRepo['appendEvent']>[0]): Promise<Event> {
    const repo = requireRepo();
    const event = await repo.appendEvent(input);
    await refresh();
    return event;
  }

  return {
    repo: null,
    context: null,
    events: [],
    projection: emptySessionState(),
    outboxCount: 0,
    synced: true,

    attachRepo(repo) {
      set({ repo });
    },

    async claim(input) {
      const repo = requireRepo();
      const context: SessionContext = {
        sessionUuid: input.sessionUuid,
        aircraftId: input.aircraftId,
        picId: input.picId,
        dualId: input.dualId ?? null,
      };
      set({ context });
      await repo.setCurrentSession({
        sessionUuid: context.sessionUuid,
        pilotId: context.picId,
        aircraftId: context.aircraftId,
      });
      const event = await repo.appendEvent({
        ...identity(context),
        type: 'session_claim',
        payload: { mode: input.mode, previousPicId: input.previousPicId ?? null },
        gpsTime: input.gpsTime,
      });
      await refresh();
      return event;
    },

    confirmPreflight(payload) {
      return emit({ ...identity(requireContext()), type: 'preflight_confirm', payload });
    },

    startEngine(payload = {}) {
      return emit({ ...identity(requireContext()), type: 'engine_start', payload });
    },

    stopEngine(payload = {}) {
      return emit({ ...identity(requireContext()), type: 'engine_stop', payload });
    },

    takeoff(method = 'manual', position = null) {
      return emit({
        ...identity(requireContext()),
        type: 'takeoff',
        payload: { method, position },
      });
    },

    landing(method = 'manual', position = null) {
      return emit({
        ...identity(requireContext()),
        type: 'landing',
        payload: { method, position },
      });
    },

    refuel(payload) {
      return emit({ ...identity(requireContext()), type: 'refuel', payload });
    },

    drop(input) {
      const ctx = requireContext();
      const dropNumber = input.dropNumber ?? get().projection.drops.count + 1;
      return emit({
        ...identity(ctx),
        type: 'drop',
        payload: {
          dropNumber,
          altitudeFt: input.altitudeFt ?? null,
          jumpers: input.jumpers,
          client: get().projection.client,
          position: input.position ?? null,
        },
      });
    },

    async crewChange(payload) {
      const ctx = requireContext();
      // Zaktualizuj kontekst PRZED emisją, aby nagłówek zdarzenia niósł już nową załogę
      // (projekcja bierze bieżącą załogę z ostatniego zdarzenia).
      const nextContext: SessionContext =
        payload.role === 'dual'
          ? { ...ctx, dualId: payload.pilotInId ?? null }
          : { ...ctx, picId: payload.pilotInId ?? ctx.picId };
      set({ context: nextContext });
      return emit({ ...identity(nextContext), type: 'crew_change', payload });
    },

    manualLogEntry(payload) {
      return emit({ ...identity(requireContext()), type: 'manual_log_entry', payload });
    },

    dayClose(payload) {
      return emit({ ...identity(requireContext()), type: 'day_close', payload });
    },

    async loadSession(sessionUuid) {
      const repo = requireRepo();
      const events = await repo.getSessionEvents(sessionUuid);
      const projection = projectSession(events);
      const context: SessionContext | null =
        projection.sessionUuid && projection.aircraftId && projection.picId
          ? {
              sessionUuid: projection.sessionUuid,
              aircraftId: projection.aircraftId,
              picId: projection.picId,
              dualId: projection.dualId,
            }
          : null;
      const outboxCount = await repo.getOutboxCount();
      set({ context, events, projection, outboxCount, synced: outboxCount === 0 });
    },

    async markSynced(uuids) {
      await requireRepo().markSynced(uuids);
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
      });
    },
  };
});

/** Pola tożsamości nagłówka zdarzenia z kontekstu sesji. */
function identity(ctx: SessionContext): {
  sessionUuid: string;
  aircraftId: string;
  picId: string;
  dualId: string | null;
} {
  return {
    sessionUuid: ctx.sessionUuid,
    aircraftId: ctx.aircraftId,
    picId: ctx.picId,
    dualId: ctx.dualId,
  };
}
