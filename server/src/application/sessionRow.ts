/**
 * UZ Aero (serwer) — strumień zdarzeń → wiersz projekcji `sessions`.
 *
 * Jedyne mapowanie domena→magazyn w warstwie aplikacji, w jedną stronę (w drugą nie ma
 * potrzeby: projekcja jest zawsze odtwarzalna ze strumienia). Wydzielone z komendy
 * ingest, bo to czysta funkcja — testuje się na liczbach kanonicznego dnia bez bazy.
 *
 * `mhEnd`/`fuelEndL` wypełniamy WYŁĄCZNIE dla dnia zamkniętego: to odczyty z `day_close`,
 * czyli przekazanie (§4.5). `fuelLastL`/`mhLast` żyją też w trakcie dnia — z nich
 * `GET /aircraft/:id/state` podpowiada stan bieżący (np. po tankowaniu).
 */

import { projectSession, type Event } from '@uzaero/domain';

import type { SessionRow } from './ports.ts';

export function sessionRowFrom(sessionUuid: string, stream: Event[]): SessionRow {
  const s = projectSession(stream);
  return {
    sessionUuid,
    aircraftId: s.aircraftId ?? stream[0]!.aircraftId,
    picId: s.sessionPicId ?? stream[0]!.picId,
    dualId: s.dualId,
    status: s.closed ? 'closed' : 'active',
    claimTime: s.dutyStart,
    closeTime: s.closedAt,
    mhStart: s.mh.start,
    mhEnd: s.closed ? s.mh.end : null,
    fuelStartL: s.fuel.startL,
    fuelEndL: s.closed ? s.fuel.endL : null,
    fuelLastL: s.fuel.lastReadingL,
    mhLast: s.mh.end ?? s.mh.start,
    blockMs: s.blockTimeMs,
    flightMs: s.flightTimeMs,
    flightsCount: s.flights.length,
  };
}
