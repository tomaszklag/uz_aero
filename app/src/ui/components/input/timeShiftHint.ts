/**
 * UZ Aero — podpis pod kontrolką czasu: O ILE przesunięto zdarzenie.
 *
 * Osobny plik, bo to jedyna część `TimeStepper` sprawdzalna bez urządzenia, a treść
 * pisały wcześniej dwa arkusze osobno i każdy trochę inaczej („zmiana o +2 min względem
 * 09:01" kontra „Zmiana o +2 min względem odczytu GPS (09:01)").
 *
 * Podpis stoi TAKŻE przy zerowej zmianie i to jest celowe: pilot, który dwa razy tapnął
 * w przeciwne strony, musi widzieć, że wrócił do wartości pierwotnej — brak podpisu
 * wyglądałby tak samo jak jego brak przed pierwszym tapnięciem.
 */

/** Znak przy liczbie minut — minus TYPOGRAFICZNY, ten sam co na przyciskach steppera. */
function signed(minutes: number): string {
  return minutes > 0 ? `+${minutes}` : `−${Math.abs(minutes)}`;
}

/**
 * „Zmiana o +2 min względem odczytu GPS (09:01)".
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
): string {
  const from = origin == null ? format(originalTime) : `${origin} (${format(originalTime)})`;
  const minutes = Math.round((value - originalTime) / 60_000);

  return minutes === 0
    ? `Bez zmiany względem ${from}`
    : `Zmiana o ${signed(minutes)} min względem ${from}`;
}
