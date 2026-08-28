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

/**
 * Przesunięcie jako „+2 min", „−1 h", „+3 h 25 min" — ze znakiem, minusem
 * TYPOGRAFICZNYM, tym samym co na przyciskach steppera.
 *
 * PONAD GODZINĘ LICZYMY W GODZINACH (issue #62 pkt 4). Wpis ręczny sprzed tygodnia
 * bywa poprawiany o pół dnia, a „+205 min" jest liczbą, którą trzeba samemu podzielić
 * przez sześćdziesiąt, żeby zobaczyć, czy pomyłka była o trzy godziny, czy o trzy
 * i pół. Kontrolka chodzi po minutach i nazwa kroku zostaje minutą — ale PODPIS mówi
 * o wielkości pomyłki, a tę mierzy się tak, jak się o niej myśli.
 *
 * Człon zerowy zjadamy („−1 h", nie „−1 h 0 min") — ta sama reguła, co w wieku
 * względnym flag w panelu.
 */
function signed(minutes: number): string {
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;

  if (hours === 0) return `${sign}${rest} min`;
  if (rest === 0) return `${sign}${hours} h`;
  return `${sign}${hours} h ${rest} min`;
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
  return `Zmiana o ${signed(minutes)} względem ${from}`;
}
