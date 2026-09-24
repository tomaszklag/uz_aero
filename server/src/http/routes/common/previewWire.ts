/**
 * Ninerdeck (serwer) - kształt na drucie PODGLĄDU PILOTA I SAMOLOTU (3.1.0, issue #206).
 *
 * JEDEN kształt dla telefonu i panelu, bo to jest cała treść zgłoszenia: ten sam
 * komplet faktów po obu stronach. Trasy różnią się WYŁĄCZNIE bramą (członkostwo
 * z tokenu telefonu kontra sesja panelu) i dlatego mapowanie stoi w `common/`,
 * a nie w dwóch kopiach - druga kopia byłaby pierwszym miejscem, w którym panel
 * pokazałby pole, którego telefon nie ma.
 *
 * ══ IDENTYFIKATORY, NIE NAZWY ══
 * Wiersze niosą `pilotId` i `aircraftId`; nazwiska i znaki rozwiązują obie
 * powierzchnie z własnego słownika klubu (cache floty w telefonie, listy w panelu) -
 * jak wszędzie indziej. Wyjątkiem jest BOHATER podglądu (nagłówek): kod i nazwisko
 * pilota oraz konfiguracja maszyny jadą z serwera, bo to o nim jest pytanie i bez
 * nich karta nie miałaby tytułu.
 *
 * ══ CZASY: OPERACJE W UTC, TERMINY Z DOBĄ KLUBU ══
 * Chwile operacji idą gołym stemplem - rejestr jest w UTC i tak go czyta cała
 * aplikacja. Terminy kalendarza niosą DOBĘ KLUBU (§6.1), bo tam godzina jest umową
 * między ludźmi, a telefon nie zna stref i liczy ją odejmowaniem od granic doby.
 */

import type {
  AircraftPreview,
  PilotPreview,
  UpcomingView,
} from '../../../application/common/queries/decisionPreview.ts';
import type { SessionRow } from '../../../application/common/ports.ts';

const iso = (at: number): string => new Date(at).toISOString();
const isoOrNull = (at: number | null): string | null => (at == null ? null : iso(at));

function upcomingWire(rows: readonly UpcomingView[]): Record<string, unknown>[] {
  return rows.map(({ booking, thisCase, overlaps, day }) => ({
    id: booking.id,
    aircraftId: booking.aircraftId,
    kind: booking.kind,
    status: booking.status,
    startsAt: iso(booking.startsAt),
    endsAt: iso(booking.endsAt),
    pilotId: booking.pilotId,
    // Powód wyłączenia z użytku NAZYWA zajętość bez właściciela („· przegląd 100 h")
    // - jedyne pole treści cudzego terminu, które tu jedzie; trasa, notatka i plan
    // lotu zostają za bramą `bookingWire` (przegląd W7).
    blockReason: booking.blockReason,
    thisCase,
    overlaps,
    day: { date: day.date, startsAt: iso(day.startsAt), endsAt: iso(day.endsAt) },
  }));
}

/** Wiersz „Ostatnie loty" - chwila, kto, czym, jakie zadanie, ile bloku. */
function recentWire(rows: readonly SessionRow[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    sessionUuid: row.sessionUuid,
    at: isoOrNull(row.engineStartAt ?? row.claimTime),
    aircraftId: row.aircraftId,
    pilotId: row.picId,
    dualId: row.dualId,
    operation: row.operation,
    blockMs: row.blockMs,
    flights: row.flightsCount,
  }));
}

export function pilotPreviewWire(view: PilotPreview): Record<string, unknown> {
  const { facts } = view;
  return {
    timezone: view.timezone,
    bookingId: view.booking.id,
    pilot: {
      id: view.pilot.id,
      code: view.pilot.code,
      name: view.pilot.name,
      memberSince: isoOrNull(view.pilot.memberSince),
    },
    lastFlightAt: isoOrNull(facts.lastFlightAt),
    onAircraft: {
      aircraftId: view.booking.aircraftId,
      operations: facts.onAircraft.operations,
      lastAt: isoOrNull(facts.onAircraft.lastAt),
      flights: facts.onAircraft.flights,
      blockMs: facts.onAircraft.blockMs,
      flightMs: facts.onAircraft.flightMs,
    },
    flying: { last30: facts.last30, last90: facts.last90, total: facts.total },
    recent: recentWire(facts.recent),
    upcoming: upcomingWire(view.upcoming),
  };
}

export function aircraftPreviewWire(view: AircraftPreview): Record<string, unknown> {
  const { facts, counters, aircraft } = view;
  const oil = counters?.handover.oil ?? null;
  return {
    timezone: view.timezone,
    bookingId: view.booking.id,
    aircraft: {
      id: aircraft.id,
      reg: aircraft.reg,
      type: aircraft.type,
      serviceStatus: aircraft.serviceStatus,
      capacityL: aircraft.capacityL,
      mhFormat: aircraft.mhFormat,
      oilMinL: aircraft.oilMinL ?? null,
    },
    lastFlightAt: isoOrNull(facts.lastFlightAt),
    counters:
      counters == null
        ? null
        : {
            mh: counters.handover.reading.mh,
            fuelL: counters.handover.reading.fuelL,
            // Suma „pomiar + dolewki po nim" liczy się TU, jak na karcie samolotu
            // w panelu (`readingOf`) - panel i telefon mają pokazać jedną liczbę.
            oilL: oil == null ? null : oil.levelL + oil.addedSinceL,
            at: iso(counters.handover.at),
            source: counters.source,
            byPilotId: counters.handover.byPilotId,
            enteredBy: counters.enteredBy,
          },
    last30: facts.last30,
    recent: recentWire(facts.recent),
    upcoming: upcomingWire(view.upcoming),
  };
}
