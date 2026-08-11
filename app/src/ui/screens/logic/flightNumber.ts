/**
 * UZ Aero — numer lotu, do którego należą zdarzenia dziejące się TERAZ (issue #21 pkt 1).
 *
 * Projekcja dopisuje lot do `flights` już przy STARCIE (`landingAt: null` = lot
 * otwarty), więc W LOCIE bieżący numer to po prostu długość listy. Kokpit liczył
 * `flights.length + (inFlight ? 1 : 0)` — wzór z czasów, gdy lista miała zawierać
 * tylko loty ZAMKNIĘTE — i pierwszy lot przedstawiał się w arkuszu zrzutu jako „LOT 2".
 *
 * NA ZIEMI (kołowanie, załadunek między lotami) zdarzenia należą do lotu
 * NADCHODZĄCEGO — dopiero takeoff go otworzy, stąd +1. Ten sam wzór naprawia przy
 * okazji „Lot #0" na plakietce logu cyklu podczas pierwszego kołowania.
 */
export function currentFlightNumber(flightsCount: number, inFlight: boolean): number {
  // `inFlight` bez otwartego lotu nie powinno się zdarzyć (projekcja otwiera lot,
  // ustawiając flagę) — Math.max to pas bezpieczeństwa, nie druga ścieżka logiki.
  return inFlight ? Math.max(1, flightsCount) : flightsCount + 1;
}
