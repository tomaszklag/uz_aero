/**
 * UZ Aero — podpis pod kontrolką czasu: O ILE przesunięto zdarzenie.
 *
 * Osobny plik, bo to jedyna część `TimeStepper` sprawdzalna bez urządzenia, a treść
 * pisały wcześniej dwa arkusze osobno i każdy trochę inaczej („zmiana o +2 min względem
 * 09:01" kontra „Zmiana o +2 min względem odczytu GPS (09:01)").
 *
 * PRZY ZEROWEJ ZMIANIE PODPISU NIE MA (uwaga z urządzenia, 2026-08-14): „bez zmiany
 * względem wpisu (09:01)" mówiło o stanie, który pilot widzi w kontrolce nad nim —
 * godzina jest ta sama, którą arkusz otworzył. Miejsce na podpis kontrolka REZERWUJE
 * (`minHeight` w `TimeStepper`), więc pojawienie się zdania nie przesuwa niczego niżej.
 */

/** Znak przy liczbie minut — minus TYPOGRAFICZNY, ten sam co na przyciskach steppera. */
function signed(minutes: number): string {
  return minutes > 0 ? `+${minutes}` : `−${Math.abs(minutes)}`;
}

/**
 * „Zmiana o +2 min względem odczytu GPS (09:01)"; `null` = nic się nie zmieniło.
 *
 * @param value bieżąca wartość kontrolki (ms).
 * @param originalTime wartość sprzed edycji (ms) — punkt odniesienia.
 * @param format ta sama funkcja, którą kontrolka wypisuje godzinę.
 * @param origin skąd wzięła się wartość pierwotna („odczytu GPS", „wpisu"); pominięte —
 *   podpis mówi samą godzinę, bo pochodzenie nie zawsze jest znane.
 */
export function timeShiftHint(
  value: number,
  originalTime: number,
  format: (t: number) => string,
  origin?: string,
): string | null {
  const minutes = Math.round((value - originalTime) / 60_000);
  if (minutes === 0) return null;

  const from = origin == null ? format(originalTime) : `${origin} (${format(originalTime)})`;
  return `Zmiana o ${signed(minutes)} min względem ${from}`;
}
