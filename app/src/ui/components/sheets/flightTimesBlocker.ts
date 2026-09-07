/**
 * UZ Aero - powód, dla którego arkusz czasów nie da się zapisać (issue #62 pkt 5).
 *
 * Arkusz `FlightTimesSheet` opisuje PARĘ godzin - bieg silnika (uruchomienie →
 * wyłączenie) albo lot (start → lądowanie) - i do issue #62 pozwalał zapisać parę
 * odwróconą. Odmowa padała dopiero przy „DALEJ" na dole kroku, czyli po zamknięciu
 * arkusza: pilot czytał „Wyłączenie silnika musi być po uruchomieniu" w miejscu,
 * w którym nie widział już ani jednej z tych godzin. Zgłoszenie z urządzenia brzmiało
 * wprost: „wykryj w tym popup i daj ostrzeżenie".
 *
 * ══ DLACZEGO POWÓD, A NIE BANER ══
 * Powód blokady stoi WEWNĄTRZ przycisku (issue #55): baner nad akcjami pojawiałby się
 * i znikał razem ze stanem, przesuwając rząd „ANULUJ / ZAPISZ" pod palcem. Blokada
 * mówi jednocześnie, że zapis nie przejdzie, i dlaczego - czyli robi obie rzeczy,
 * o które prosi zgłoszenie.
 *
 * ══ DLACZEGO ZDANIE IDZIE OD CZASU TRWANIA ══
 * Nazwy pól są w mianowniku („Uruchomienie", „Start"), a zdanie „X musi być po Y"
 * wymaga miejscownika, którego z mianownika nie da się wyprowadzić regułą. Zamiast
 * odmieniać, mówimy o SKUTKU - a ten arkusz i tak nazywa go w wierszu pod polami
 * („Blok", „Czas lotu"). Obie nazwy są rodzaju męskiego, więc „wychodzi ujemny"
 * zgadza się z każdą z nich.
 */

/** Pole arkusza w wersji potrzebnej blokadzie: nazwa i wartość (`null` = jeszcze brak). */
export interface FlightTimesPair {
  label: string;
  value: number | null;
  /**
   * Pole KONTEKSTU, nie do wypełnienia (drugi koniec pary przy edycji jednego z nich).
   *
   * ROZRÓŻNIENIE JEST TU KONIECZNE (zgłoszenie z urządzenia, issue #62): bez niego
   * blokada żądała wartości także od pola, którego arkusz nawet nie pokazuje jako
   * kontrolki - a przy pierwszym wpisywaniu biegu silnika drugi koniec z definicji
   * jest jeszcze pusty. Efekt: „wpisz obie godziny" nie gasło NIGDY i nie dało się
   * zapisać nawet tej jednej godziny, którą pilot właśnie wpisał.
   *
   * Kontekst nadal WCHODZI do porównań (kolejność, granice) - ale tylko wtedy, gdy
   * ma wartość. Pusty kontekst znaczy „nie mam z czym porównać", a nie „brakuje danych".
   */
  readOnly?: boolean;
}

/**
 * Okno, w którym para MUSI się zmieścić - dla lotu jest nim bieg silnika.
 *
 * ISTNIEJE OD ISSUE #62 (trzecia tura z urządzenia): arkusz lotu przyjmował start
 * po wyłączeniu silnika bez słowa, a odmowa padała dopiero przy „DALEJ" na dole kroku.
 * Lot poza biegiem silnika nie jest niedokładnością do zaakceptowania - to sesja,
 * w której samolot leciał z zatrzymanym śmigłem.
 */
export interface FlightTimesBounds {
  from: number;
  to: number;
  /**
   * Nazwa okna w powodzie blokady, W MIEJSCOWNIKU - zdanie brzmi „muszą mieścić się
   * w …", a odmiany z mianownika nie da się wyprowadzić regułą (to samo ograniczenie,
   * przez które reguła kolejności mówi o skutku, a nie o nazwach pól). Dziś jedyną
   * wartością jest „biegu silnika".
   */
  label: string;
  /** Jak wypisać godzinę granicy (zwykle `timeUtc`). */
  format: (t: number) => string;
}

/**
 * `null` = wolno zapisać. Kolejność sprawdzeń jest kolejnością pytań pilota: najpierw
 * „czy wpisałem wszystko", potem „czy w dobrą stronę", na końcu „czy w ogóle tam pasuje".
 *
 * @param fields jedno albo dwa pola arkusza (para start–koniec). Przy edycji JEDNEGO
 *   końca drugi wchodzi tu jako pole tylko do odczytu - inaczej reguła kolejności
 *   nie miałaby czego porównać i dałoby się ustawić start po lądowaniu.
 * @param durationLabel podpis wiersza czasu trwania - „Blok", „Czas lotu".
 * @param bounds okno, w którym para ma się zmieścić; pominięte - nie sprawdzamy.
 */
export function flightTimesBlocker(
  fields: readonly FlightTimesPair[],
  durationLabel = 'Czas trwania',
  bounds?: FlightTimesBounds,
): string | null {
  /* Wypełnienia żądamy WYŁĄCZNIE od pól, które arkusz pokazuje jako kontrolki. Pole
     kontekstu bywa puste z definicji - przy pierwszym wpisywaniu biegu silnika drugi
     koniec jeszcze nie istnieje. */
  const editable = fields.filter((f) => f.readOnly !== true);
  if (editable.some((f) => f.value == null)) {
    // Które pole jest puste, widać w kontrolce nad przyciskiem - placeholder stoi
    // w miejscu godziny. Powtarzanie nazwy dokładałoby zdanie, nie informację.
    return editable.length > 1 ? 'Wpisz obie godziny.' : 'Wpisz godzinę.';
  }

  // Kolejność porównujemy dopiero, gdy OBA końce mają wartość - pusty kontekst znaczy
  // „nie mam z czym porównać", a nie „para jest odwrócona".
  const [first, second] = fields;
  if (fields.length >= 2 && first?.value != null && second?.value != null) {
    const span = second.value - first.value;
    if (span <= 0) {
      return `Sprawdź kolejność godzin - ${durationLabel.toLowerCase()} wychodzi ${
        span < 0 ? 'ujemny' : 'zerowy'
      }.`;
    }
  }

  if (bounds != null) {
    // Sprawdzamy KAŻDE pole z wartością, także kontekstowe: przy edycji jednego końca
    // drugi bywa już poza oknem (pilot skrócił bieg silnika po wpisaniu lotu), a arkusz
    // ma o tym powiedzieć, zamiast puszczać zapis w takim stanie.
    const outside = fields.some(
      (f) => f.value != null && (f.value < bounds.from || f.value > bounds.to),
    );
    if (outside) {
      return `Godziny muszą mieścić się w ${bounds.label} (${bounds.format(
        bounds.from,
      )} → ${bounds.format(bounds.to)}).`;
    }
  }

  return null;
}
