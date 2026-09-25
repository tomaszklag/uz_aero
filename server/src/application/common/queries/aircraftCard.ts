/**
 * Ninerdeck (serwer) - KARTA MASZYNY, jej historia i lista obserwowanych (3.2.0,
 * issue #205; makiety `27`, `13c`, `konto`; `docs/obserwowanie-samolotu.md` §6, §7).
 *
 * Składane z TYCH SAMYCH klocków, co podgląd przy decyzji (`decisionPreview.ts`):
 * `aircraftWindow`, `pickHandover`, `clubDays` - plus `aircraftNow` i serie wykresów
 * z `domain/aircraftCard.ts`. Nowe pytania do istniejących wierszy: jedyna nowa tabela
 * to samo obserwowanie (`aircraft_watches`).
 *
 * ══ KTO MOŻE PATRZEĆ, ROZSTRZYGA TRASA ══
 * Zapytanie pyta o klub, maszynę i patrzącego (bit „obserwujesz"); o zdolność
 * `fleet.watch` pyta trasa, bo to ona zna aktora. Maszyna cudza albo nieznana oddaje
 * `null` - trasa mówi wtedy 404, nie 403 (epik C).
 *
 * ══ W `common/`, BO CZYTAJĄ OBIE POWIERZCHNIE ══
 * Kartę czyta telefon; LISTĘ obserwowanych (flota ze stanem „teraz") czyta telefon
 * (sekcja 13C) i panel (`#/konto`, decyzja 12) - druga kopia stanu maszyny po tamtej
 * stronie byłaby pierwszym miejscem, w którym „wolna" w ustawieniach i „w locie"
 * w panelu opisywałyby tę samą chwilę.
 *
 * ══ TANKOWANIA ZE STRUMIENI - ŚWIADOME DOŁOŻENIE WOŁAJĄCEGO `sessionStreams` ══
 * Projekcja niesie SUMĘ dolewek, nie ich chwile (`fuelAddedL`), a wykres paliwa bez
 * tankowań byłby linią spadającą przez cały sezon. Strumienie operacji z okna 90 dni
 * idą JEDNYM zapytaniem (`sessionStreams`, wzorzec analityki §7.7) i przez
 * `applyCorrections`, żeby unieważnione tankowanie nie stanęło na wykresie. To nie
 * jest lista odtwarzająca projekcję: czyta FAKTY, których projekcja nie ma - i dlatego
 * strażnik w `architecture.test.ts` ma tę pozycję wpisaną imiennie.
 */

import { applyCorrections, type EventOf, type ReferenceAircraft } from '@ninerdeck/domain';

import {
  aircraftNow,
  fuelSeries,
  HISTORY_PAGE_SIZE,
  mhSeries,
  SERIES_WINDOW_DAYS,
  type AircraftNow,
  type RefuelPoint,
  type SeriesPoint,
} from '../../../domain/aircraftCard.ts';
import { clubDays, safeZone, type ClubDay } from '../../../domain/clubTime.ts';
import {
  aircraftWindow,
  flew,
  FLYING_WINDOWS_DAYS,
  operationAt,
  UPCOMING_LIMIT,
  type AircraftLast30,
} from '../../../domain/decisionPreview.ts';
import { pickHandover, type HandoverPick } from '../aircraftStateView.ts';
import type {
  AircraftConfigPort,
  AircraftReadingsPort,
  AircraftSeed,
  AircraftWatchesPort,
  BookingRecord,
  BookingsPort,
  Clock,
  ClubSettingsPort,
  Database,
  EventsStorePort,
  OperationCursor,
  ReferencePort,
  SessionRow,
  SessionsProjectionPort,
} from '../ports.ts';
import { MAX_WINDOW_DAYS } from './bookings.ts';

const DAY_MS = 86_400_000;

export interface UpcomingTerm {
  booking: BookingRecord;
  /** Doba klubu początku terminu - telefon liczy godziny odejmowaniem (§6.1). */
  day: ClubDay;
}

export interface AircraftCard {
  timezone: string;
  aircraft: ReferenceAircraft;
  now: AircraftNow;
  /**
   * Chwila ostatniego zapisu tej maszyny, który DOTARŁ na serwer (§2.3): pod herosem
   * stoi „zapisy do 09:40", bo stan z rejestru jest stanem wg ostatniej paczki, a nie
   * „teraz". `null` = rejestr nie ma tej maszyny wcale.
   */
  lastRecordAt: number | null;
  /** Ostatni odczyt liczników ze ŹRÓDŁEM - ten sam `pickHandover`, co 02A i 26B. */
  counters: HandoverPick | null;
  lastFlightAt: number | null;
  last30: AircraftLast30;
  last90: AircraftLast30;
  upcoming: UpcomingTerm[];
  series: { mh: SeriesPoint[]; fuel: SeriesPoint[] };
  /** Czy PATRZĄCY obserwuje tę maszynę. */
  watching: boolean;
}

export interface OperationsPage {
  rows: SessionRow[];
  /** Kursor następnej strony; `null` = to była ostatnia. */
  next: OperationCursor | null;
}

export interface WatchListItem {
  aircraft: ReferenceAircraft;
  watching: boolean;
  now: AircraftNow;
}

export interface WatchList {
  timezone: string;
  items: WatchListItem[];
}

export class AircraftCardQueries {
  constructor(
    private readonly db: Database,
    private readonly sessions: SessionsProjectionPort,
    private readonly bookings: BookingsPort,
    private readonly reference: ReferencePort,
    private readonly readings: AircraftReadingsPort,
    private readonly clubs: ClubSettingsPort,
    private readonly events: EventsStorePort,
    private readonly aircraft: AircraftConfigPort,
    private readonly watches: AircraftWatchesPort,
    private readonly clock: Clock,
  ) {}

  /** `null` = klubu nie ma albo maszyna nie jest w jego flocie (także: jest w cudzej). */
  async card(orgId: string, aircraftId: string, viewerId: string): Promise<AircraftCard | null> {
    const settings = await this.clubs.calendar(this.db, orgId);
    if (settings == null) return null;
    const snapshot = await this.reference.snapshot(orgId);
    const aircraft = snapshot.aircraft.find((a) => a.id === aircraftId);
    if (aircraft == null) return null;

    const timezone = safeZone(settings.timezone);
    const now = this.clock.now().getTime();
    const since = now - SERIES_WINDOW_DAYS * DAY_MS;
    const [rows, override, plans, watching, lastRecord, readings] = await Promise.all([
      this.sessions.listByAircraft(this.db, orgId, aircraftId),
      this.readings.latest(this.db, orgId, aircraftId),
      this.bookings.list(this.db, orgId, { from: now, to: now + MAX_WINDOW_DAYS * DAY_MS, aircraftId }),
      this.watches.isWatching(this.db, orgId, aircraftId, viewerId),
      this.events.lastReceivedAt(this.db, orgId, aircraftId),
      this.readings.listSince(this.db, orgId, aircraftId, new Date(since)),
    ]);
    const seed: AircraftSeed | null = snapshot.initial.get(aircraftId) ?? null;
    const dayKeyOf = (at: number): string => dayKey(timezone, at);

    return {
      timezone,
      aircraft,
      now: aircraftNow({ serviceStatus: aircraft.serviceStatus, sessions: rows, bookings: plans, now }),
      lastRecordAt: lastRecord?.getTime() ?? null,
      counters: pickHandover(rows, seed, override),
      lastFlightAt: lastFlightAt(rows),
      last30: aircraftWindow(rows, now, FLYING_WINDOWS_DAYS.short, dayKeyOf),
      last90: aircraftWindow(rows, now, FLYING_WINDOWS_DAYS.long, dayKeyOf),
      upcoming: this.upcoming(timezone, plans, now),
      series: {
        mh: mhSeries(rows, readings, since),
        fuel: fuelSeries(rows, await this.refuels(orgId, rows, since), readings, since),
      },
      watching,
    };
  }

  /**
   * Historia operacji stronami. `null` = maszyny nie ma w tym klubie; pusta strona
   * to maszyna bez historii - dwie różne odpowiedzi (404 kontra pusta lista).
   */
  async operations(
    orgId: string,
    aircraftId: string,
    page: { before?: OperationCursor; limit?: number },
  ): Promise<OperationsPage | null> {
    if ((await this.aircraft.regOf(this.db, orgId, aircraftId)) == null) return null;
    const limit = page.limit ?? HISTORY_PAGE_SIZE;
    // Jeden wiersz ponad stronę mówi, czy jest następna - bez drugiego zapytania o liczbę.
    const rows = await this.sessions.listByAircraftPage(this.db, orgId, aircraftId, {
      before: page.before,
      limit: limit + 1,
    });
    const shown = rows.slice(0, limit);
    const last = shown[shown.length - 1];
    const more = rows.length > limit && last != null;
    const at = last == null ? null : operationAt(last);
    return {
      rows: shown,
      next: more && at != null ? { at, sessionUuid: last.sessionUuid } : null,
    };
  }

  /**
   * CAŁA flota klubu ze stanem „teraz" i bitem obserwowania - sekcja 13C w ustawieniach
   * i karta w `#/konto` (decyzja 12): do włączenia trzeba widzieć maszyny, których się
   * jeszcze nie obserwuje. `null` = klubu nie ma.
   */
  async watchList(orgId: string, viewerId: string): Promise<WatchList | null> {
    const settings = await this.clubs.calendar(this.db, orgId);
    if (settings == null) return null;
    const snapshot = await this.reference.snapshot(orgId);
    const now = this.clock.now().getTime();
    const [watched, plans] = await Promise.all([
      this.watches.watchedBy(this.db, orgId, viewerId),
      this.bookings.list(this.db, orgId, { from: now, to: now + MAX_WINDOW_DAYS * DAY_MS }),
    ]);

    const items: WatchListItem[] = [];
    for (const aircraft of snapshot.aircraft) {
      // Historia per maszyna - flota klubu to kilka do kilkunastu wierszy, a port
      // `listByAircraft` już istnieje i czyta to samo, co łańcuch MH.
      const rows = await this.sessions.listByAircraft(this.db, orgId, aircraft.id);
      items.push({
        aircraft,
        watching: watched.has(aircraft.id),
        now: aircraftNow({
          serviceStatus: aircraft.serviceStatus,
          sessions: rows,
          bookings: plans.filter((b) => b.aircraftId === aircraft.id),
          now,
        }),
      });
    }
    return { timezone: safeZone(settings.timezone), items };
  }

  /** Najbliższe terminy (razem z wyłączeniami z użytku), do sufitu, z dobą klubu. */
  private upcoming(timezone: string, plans: readonly BookingRecord[], now: number): UpcomingTerm[] {
    const out: UpcomingTerm[] = [];
    const rows = [...plans]
      .filter((b) => b.endsAt > now)
      .sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id))
      .slice(0, UPCOMING_LIMIT);
    for (const booking of rows) {
      const day = clubDays(timezone, booking.startsAt, booking.startsAt + 1, 1)[0];
      if (day != null) out.push({ booking, day });
    }
    return out;
  }

  /** Tankowania z operacji okna - PO korektach, żeby unieważnione nie stanęło na wykresie. */
  private async refuels(orgId: string, rows: readonly SessionRow[], since: number): Promise<RefuelPoint[]> {
    const uuids = rows
      .filter((s) => s.status !== 'voided' && (s.closeTime ?? s.claimTime ?? -Infinity) >= since)
      .map((s) => s.sessionUuid);
    if (uuids.length === 0) return [];
    const streams = await this.events.sessionStreams(this.db, orgId, uuids);
    const out: RefuelPoint[] = [];
    for (const [sessionUuid, stream] of streams) {
      for (const e of applyCorrections(stream)) {
        if (e.type !== 'refuel') continue;
        const refuel = e as EventOf<'refuel'>;
        out.push({
          at: refuel.gpsTime ?? refuel.deviceTime,
          afterL: refuel.payload.afterL,
          sessionUuid,
          pilotId: refuel.picId,
        });
      }
    }
    return out;
  }
}

/** Ostatnia operacja Z LOTEM - ta sama definicja, co w podglądzie 26B (`flew`). */
function lastFlightAt(rows: readonly SessionRow[]): number | null {
  let best: number | null = null;
  for (const row of rows) {
    const at = operationAt(row);
    if (at != null && flew(row) && (best == null || at > best)) best = at;
  }
  return best;
}

/** Klucz doby klubu dla chwili - „dni z lotami" liczy różne DOBY, nie różne daty UTC. */
function dayKey(timezone: string, at: number): string {
  return clubDays(timezone, at, at + 1, 1)[0]?.date ?? new Date(at).toISOString().slice(0, 10);
}
