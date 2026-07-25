/**
 * UZ Aero — ZAPYTANIA (strona odczytu).
 *
 * Strona zapisu to zdarzenia (`commands`), strona odczytu to projekcje — CQRS w wersji
 * dla tej aplikacji: **jedna baza, jeden strumień, dwa wejścia**. Świadomie NIE ma
 * osobnego magazynu read-model (§5.2: „przy kilkuset zdarzeniach dziennie tabele
 * agregujące są zbędne") — projekcja liczy się w pamięci przy każdym odczycie.
 *
 * Zapytania nigdy nie zapisują i nie sprawdzają reguł. Jeśli ekran potrzebuje danych,
 * bierze je stąd; jeśli chce coś zmienić — przez komendę.
 */

import {
  aircraftLimitsFrom,
  correctionWindow,
  projectSession,
  type AircraftLimits,
  type CorrectionWindow,
  type EpochMillis,
  type Event,
  type ReferenceAircraft,
  type ReferencePilot,
  type SessionState,
} from '../../domain';
import type { CurrentSession, EventsRepo } from '../eventsRepo';

/** Stan wysyłki do SyncChip (`SYNC` / `OFFLINE · n`, §4.3). */
export interface OutboxStatus {
  count: number;
  synced: boolean;
}

export class SessionQueries {
  constructor(private readonly repo: EventsRepo) {}

  /** Zdarzenia sesji w kolejności zapisu (materiał projekcji i podglądu logu). */
  sessionEvents(sessionUuid: string): Promise<Event[]> {
    return this.repo.getSessionEvents(sessionUuid);
  }

  /** Stan i statystyki dnia — projekcja ze strumienia (§3.7, §5.2). */
  async sessionState(sessionUuid: string): Promise<SessionState> {
    return projectSession(await this.repo.getSessionEvents(sessionUuid));
  }

  /** Ile zdarzeń czeka w outboxie — jedyne źródło wskaźnika łączności (§6). */
  async outboxStatus(): Promise<OutboxStatus> {
    const count = await this.repo.getOutboxCount();
    return { count, synced: count === 0 };
  }

  /** Okno 24 h na samodzielną korektę po zamknięciu dnia (decyzja 2026-07-23). */
  async correctionWindow(sessionUuid: string, now: EpochMillis): Promise<CorrectionWindow> {
    return correctionWindow(await this.sessionState(sessionUuid), now);
  }

  /** Konfiguracja samolotu przełożona na limity reguł (§5.4); brak cache = limity nieznane. */
  async aircraftLimits(aircraftId: string): Promise<AircraftLimits> {
    return aircraftLimitsFrom(await this.repo.getAircraftById(aircraftId));
  }

  aircraft(): Promise<ReferenceAircraft[]> {
    return this.repo.getAircraft();
  }

  aircraftById(id: string): Promise<ReferenceAircraft | null> {
    return this.repo.getAircraftById(id);
  }

  pilots(): Promise<ReferencePilot[]> {
    return this.repo.getPilots();
  }

  /** Sesja zapamiętana w `session_meta` — do wznowienia dnia po restarcie (§5.2). */
  currentSession(): Promise<CurrentSession | null> {
    return this.repo.getCurrentSession();
  }
}
