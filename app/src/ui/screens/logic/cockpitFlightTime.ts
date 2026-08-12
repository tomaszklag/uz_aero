/**
 * UZ Aero — CZAS LOTU na przyrządzie kokpitu (mockup 05, kafelek „Flight time").
 *
 * Kafelek pokazuje czas lotu **całej sesji**, a nie bieżącego wyniesienia: sumę lotów
 * zamkniętych plus lot otwarty liczony na żywo. Sesja = jeden bieg silnika (model
 * 2026-08-10), więc to jednocześnie czas lotu tego cyklu — jedna liczba, ta sama,
 * którą zobaczy rozliczenie (10) i arkusz.
 *
 * DLACZEGO NIE „bieżące wyniesienie". Poprzednia wersja podstawiała w locie sam czas
 * od otwartego startu (`now − openTakeoffAt`), więc każdy poprzedni lot znikał
 * z przyrządu w chwili oderwania i wracał po przyziemieniu. Najbardziej bolało to
 * wpisy RĘCZNE (05f, 08): pilot dopisywał przegapiony lot, licznik nie drgał i wyglądało
 * to jak zgubiony zapis. Czas bieżącego lotu i tak stoi w logu cyklu — wiersz „In
 * flight… 00:53:14" — a kokpit nie powtarza tego, co już mówi (decyzja 2026-08-10).
 *
 * Sumujemy z PROJEKCJI, nie z wierszy logu: projekcja liczy tak samo start wykryty
 * przez GPS, wpisany ręcznie i przywieziony wpisem §3.8, a log jest tylko jej obrazem.
 */

export interface CockpitFlightTimeInput {
  /** Suma lotów ZAMKNIĘTYCH sesji (`projection.flightTimeMs`) — auto i ręcznych. */
  closedMs: number;
  /** Start lotu otwartego (`projection.openTakeoffAt`); `null` = nic nie leci. */
  openTakeoffAt: number | null;
  /** „Teraz" z tickera kokpitu. */
  now: number;
}

export function cockpitFlightTimeMs({
  closedMs,
  openTakeoffAt,
  now,
}: CockpitFlightTimeInput): number {
  // `Math.max(0, …)` jak w projekcji: czas zdarzenia bywa RETRO-DATOWANY i pochodzi
  // z innego zegara niż ticker (§5.1), więc różnica potrafi na moment wyjść ujemna —
  // przyrząd ma wtedy stanąć na zerze, nie odliczać wstecz.
  const openMs = openTakeoffAt == null ? 0 : Math.max(0, now - openTakeoffAt);
  return closedMs + openMs;
}
