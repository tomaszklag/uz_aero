/**
 * Ninerdeck (serwer) - kształt na drucie STANU MASZYNY „TERAZ" i LISTY OBSERWOWANYCH
 * (3.2.0, issue #205; `docs/obserwowanie-samolotu.md` §6.3, §6.6, §7).
 *
 * JEDEN kształt dla telefonu (sekcja 13C, hero karty 27) i panelu (`#/konto`), bo obie
 * powierzchnie mają pokazać tę samą flotę w tym samym stanie - rozjazd znaczyłby
 * „wolna" w ustawieniach i „w locie" w panelu o tej samej chwili.
 *
 * Chwile stanu z rejestru (`since`) idą gołym stemplem UTC, jak cała historia operacji;
 * terminy (`startsAt`, `until`) też - dobę klubu telefon dostaje przy liście terminów
 * karty, a podpis „następny termin: dziś 14:00" liczy z niej odejmowaniem (§6.1).
 */

import type { ReferenceAircraft } from '@ninerdeck/domain';

import type { WatchList } from '../../../application/common/queries/aircraftCard.ts';
import type { AircraftNow } from '../../../domain/aircraftCard.ts';

const iso = (at: number): string => new Date(at).toISOString();
const isoOrNull = (at: number | null): string | null => (at == null ? null : iso(at));

export function aircraftNowWire(now: AircraftNow): Record<string, unknown> {
  switch (now.kind) {
    case 'retired':
      return { kind: 'retired' };
    case 'flying':
    case 'after_flight':
      return {
        kind: now.kind,
        sessionUuid: now.sessionUuid,
        pilotId: now.pilotId,
        dualId: now.dualId,
        operation: now.operation,
        departureIcao: now.departureIcao,
        since: iso(now.since),
      };
    case 'claimed':
      return {
        kind: 'claimed',
        sessionUuid: now.sessionUuid,
        pilotId: now.pilotId,
        dualId: now.dualId,
        operation: now.operation,
        departureIcao: now.departureIcao,
        since: isoOrNull(now.since),
      };
    case 'blocked':
      return { kind: 'blocked', bookingId: now.bookingId, reason: now.reason, until: iso(now.until) };
    case 'booked':
      return {
        kind: 'booked',
        bookingId: now.bookingId,
        pilotId: now.pilotId,
        startsAt: iso(now.startsAt),
        endsAt: iso(now.endsAt),
      };
    case 'free':
      return {
        kind: 'free',
        next:
          now.next == null
            ? null
            : { bookingId: now.next.bookingId, kind: now.next.kind, startsAt: iso(now.next.startsAt) },
      };
  }
}

/** Nagłówek wiersza listy: to, czym telefon i panel podpisują maszynę bez cache floty. */
export function fleetRowWire(aircraft: ReferenceAircraft): Record<string, unknown> {
  return { aircraftId: aircraft.id, reg: aircraft.reg, type: aircraft.type, serviceStatus: aircraft.serviceStatus };
}

export function watchListWire(view: WatchList): Record<string, unknown> {
  return {
    timezone: view.timezone,
    viewer: { watch: true },
    items: view.items.map((item) => ({
      ...fleetRowWire(item.aircraft),
      watching: item.watching,
      now: aircraftNowWire(item.now),
    })),
  };
}
