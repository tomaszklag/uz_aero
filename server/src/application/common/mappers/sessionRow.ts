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
 *
 * ── `claim_time` niesie DUTY START, nie czas zdarzenia `session_claim` ───────────
 * Kolumna nazywa się `claim_time` (migracja 2), a od pierwszej wersji zapisujemy do
 * niej `SessionState.dutyStart`, czyli czas MELDUNKU wpisany w `preflight_confirm`.
 * Konsekwencje, które trzeba znać, zanim ktoś zaufa nazwie:
 *
 *  • sesja z samym `session_claim` (pilot wziął samolot, nie dokończył preflightu)
 *    ma `claim_time = NULL`, choć claim NASTĄPIŁ — dlatego kolumna jest NULL-owalna,
 *    a kursor listy dni ma predykat trójgałęziowy;
 *  • meldunek bywa WCZEŚNIEJSZY niż przejęcie samolotu, więc to nie jest ta sama
 *    chwila pod dwiema nazwami;
 *  • `GET /aircraft/:id/state` wystawia tę wartość jako `claimSince` i telefon
 *    pokazuje ją jako „od kiedy zajęty" (`aircraftStateView.ts`).
 *
 * Panel administracyjny (`A01-pulpit.html`) pokazuje „claim 07:58 · duty 6:24", czyli
 * STEMPEL i UPŁYW służby — a upływ liczy się właśnie od duty startu, więc jedna
 * wartość obsługuje oba pola. Osobnej kolumny `duty_start` NIE dokładamy (migracja 11):
 * byłaby dokładnym duplikatem tej samej liczby. Gdyby panel kiedyś potrzebował czasu
 * zdarzenia `session_claim` jako osobnej wielkości, właściwym ruchem jest NOWA kolumna
 * na tę nową wartość i przemianowanie istniejącej na `duty_start` — nie ciche
 * przestawienie zawartości tej, którą czyta już telefon.
 */

import { projectSession, type Event } from '@uzaero/domain';

import type { SessionRow } from '../ports.ts';

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
    // Wymiary listy dni (migracja 11). Przepisujemy WARTOŚĆ POLICZONĄ przez projekcję
    // — razem z jej regułą „klient dziedziczony przez `drop`, gdy preflight go nie
    // podał". Sięgnięcie po `payload.operation` wprost byłoby drugą implementacją.
    operation: s.operation,
    client: s.client,
    mhStart: s.mh.start,
    mhEnd: s.closed ? s.mh.end : null,
    fuelStartL: s.fuel.startL,
    fuelEndL: s.closed ? s.fuel.endL : null,
    fuelLastL: s.fuel.lastReadingL,
    mhLast: s.mh.end ?? s.mh.start,
    blockMs: s.blockTimeMs,
    flightMs: s.flightTimeMs,
    flightsCount: s.flights.length,
    // Kolumny statystyk (migracja 18) — jak wyżej: przepisujemy WARTOŚCI POLICZONE
    // przez projekcję, razem z jej regułami. `mh.deltaH` i `fuel.consumedL` są `null`
    // do `day_close` (bilans istnieje dopiero z odczytem końcowym), a suma wysokości
    // zrzutów i licznik fixów jadą OSOBNO, bo średnich per sesja nie da się składać
    // w średnią zakresu (`DropSummary.altitudeSumFt` — uzasadnienie przy typie).
    takeoffCount: s.takeoffCount,
    landingCount: s.landingCount,
    mhDeltaH: s.mh.deltaH,
    fuelConsumedL: s.fuel.consumedL,
    dropCount: s.drops.count,
    jumpersTandem: s.drops.jumpers.tandem,
    jumpersAff: s.drops.jumpers.aff,
    jumpersSolo: s.drops.jumpers.solo,
    dropAltSumFt: s.drops.altitudeSumFt,
    dropAltCount: s.drops.altitudeFixCount,
  };
}
