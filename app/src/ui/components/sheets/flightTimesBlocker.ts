/**
 * UZ Aero — powód, dla którego arkusz czasów nie da się zapisać (issue #62 pkt 5).
 *
 * Arkusz `FlightTimesSheet` opisuje PARĘ godzin — bieg silnika (uruchomienie →
 * wyłączenie) albo lot (start → lądowanie) — i do issue #62 pozwalał zapisać parę
 * odwróconą. Odmowa padała dopiero przy „DALEJ" na dole kroku, czyli po zamknięciu
 * arkusza: pilot czytał „Wyłączenie silnika musi być po uruchomieniu" w miejscu,
 * w którym nie widział już ani jednej z tych godzin. Zgłoszenie z urządzenia brzmiało
 * wprost: „wykryj w tym popup i daj ostrzeżenie".
 *
 * ══ DLACZEGO POWÓD, A NIE BANER ══
 * Powód blokady stoi WEWNĄTRZ przycisku (issue #55): baner nad akcjami pojawiałby się
 * i znikał razem ze stanem, przesuwając rząd „ANULUJ / ZAPISZ" pod palcem. Blokada
 * mówi jednocześnie, że zapis nie przejdzie, i dlaczego — czyli robi obie rzeczy,
 * o które prosi zgłoszenie.
 *
 * ══ DLACZEGO ZDANIE IDZIE OD CZASU TRWANIA ══
 * Nazwy pól są w mianowniku („Uruchomienie", „Start"), a zdanie „X musi być po Y"
 * wymaga miejscownika, którego z mianownika nie da się wyprowadzić regułą. Zamiast
 * odmieniać, mówimy o SKUTKU — a ten arkusz i tak nazywa go w wierszu pod polami
 * („Blok", „Czas lotu"). Obie nazwy są rodzaju męskiego, więc „wychodzi ujemny"
 * zgadza się z każdą z nich.
 */

/** Pole arkusza w wersji potrzebnej blokadzie: nazwa i wartość (`null` = jeszcze brak). */
export interface FlightTimesPair {
  label: string;
  value: number | null;
}

/**
 * `null` = wolno zapisać. Kolejność sprawdzeń jest kolejnością pytań pilota: najpierw
 * „czy wpisałem wszystko", potem „czy w dobrą stronę".
 *
 * @param fields jedno albo dwa pola arkusza (para start–koniec).
 * @param durationLabel podpis wiersza czasu trwania — „Blok", „Czas lotu".
 */
export function flightTimesBlocker(
  fields: readonly FlightTimesPair[],
  durationLabel = 'Czas trwania',
): string | null {
  const missing = fields.filter((f) => f.value == null);
  if (missing.length > 0) {
    // Które pole jest puste, widać w kontrolce nad przyciskiem — placeholder stoi
    // w miejscu godziny. Powtarzanie nazwy dokładałoby zdanie, nie informację.
    return fields.length > 1 ? 'Wpisz obie godziny.' : 'Wpisz godzinę.';
  }

  if (fields.length < 2) return null;

  const span = fields[1]!.value! - fields[0]!.value!;
  if (span > 0) return null;
  return `Sprawdź kolejność godzin — ${durationLabel.toLowerCase()} wychodzi ${
    span < 0 ? 'ujemny' : 'zerowy'
  }.`;
}
