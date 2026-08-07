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
 * ── `claim_time` niesie CZAS PRZEJĘCIA (decyzja 2026-08-07, migracja 21) ─────────
 * Kolumna nazywa się `claim_time` (migracja 2) i od migracji 21 wreszcie znaczy to,
 * co mówi jej nazwa: czas zdarzenia `session_claim` (`SessionState.claimedAt`).
 *
 * Do 2026-08-07 zapisywaliśmy tu `dutyStart`, czyli godzinę MELDUNKU z preflightu.
 * Rozjazd nazwy z zawartością był świadomy i opisany — do chwili, w której meldunek
 * stał się opcjonalny (§3.6a). Wtedy przestał być niuansem: kolumna byłaby `NULL`
 * w ZWYKŁYM przypadku, a opiera się na niej sortowanie listy dni, kursor keyset,
 * indeks `idx_sessions_day`, filtr zakresu dat i rozpoznanie sesji „bez daty".
 *
 * Co z tego wynika dzisiaj:
 *
 *  • sesja ma `claim_time` od PIERWSZEGO zdarzenia — również ta, w której pilot wziął
 *    samolot i nie dokończył preflightu (wcześniej takie sesje były bez daty);
 *  • `GET /aircraft/:id/state` wystawia tę wartość jako `claimSince`, a telefon pokazuje
 *    „od kiedy zajęty" — i teraz jest to prawda dosłowna, nie przybliżenie;
 *  • klamry służby w `sessions` NIE MA i nie ma jej tu być: należy do PILOTA, obejmuje
 *    kilka maszyn i liczy ją `projectDuty` per pilot per doba UTC (§3.6a). Deklaracja
 *    pilota zostaje w rejestrze zdarzeń, skąd bierze ją ta projekcja.
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
    claimTime: s.claimedAt,
    closeTime: s.closedAt,
    // Wymiary listy dni (migracja 11). Przepisujemy WARTOŚĆ POLICZONĄ przez projekcję
    // — razem z jej regułą „klient dziedziczony przez `drop`, gdy preflight go nie
    // podał". Sięgnięcie po `payload.operation` wprost byłoby drugą implementacją.
    operation: s.operation,
    client: s.client,
    // Notatka dnia (migracja 20) — jak wyżej: wartość POLICZONA przez projekcję,
    // razem z jej regułą („ostatni `preflight_confirm` wygrywa"). Payloadu nie
    // czytamy tu wprost, bo to byłaby druga implementacja tej samej reguły.
    notes: s.notes,
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
