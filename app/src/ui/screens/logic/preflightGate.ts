/**
 * UZ Aero - bramka kroku liczników (02a): powód, dla którego ROZPOCZNIJ LOT stoi.
 *
 * Decyzja użytkownika (2026-08-27, issue #60): POMIAR OLEJU JEST KROKIEM WYMAGANYM
 * przy przejęciu - jak odczyty paliwa i motogodzin. Wymagalność jest stanem domyślnym
 * formularza (reguła z issue #42/#12: oznaczamy wyłącznie to, co opcjonalne), więc
 * sekcja oleju nie nosi żadnego tagu, a brak pomiaru mówi o sobie powodem W przycisku.
 *
 * Bramka mieszka tu, a nie w JSX ekranu, z tej samej lekcji co `myDayActions`
 * (issue #42): warunek w JSX przeżył dziurę bez jednego czerwonego testu.
 *
 * WYJĄTEK: wpis ręczny (ekran 15) oleju NIE wymaga - tam obowiązuje twardsza reguła
 * flow (`manualFlightStepBlocker`): „fakt lotu jest cenniejszy niż kompletność
 * formularza", a lot z kartki sprzed tygodnia może uczciwego pomiaru po prostu nie mieć.
 *
 * Powody padają POJEDYNCZO, w kolejności czynności przy maszynie: liczniki → bagnet →
 * wiarygodność licznika wobec przekazania.
 */

export interface PreflightGateInput {
  /** Odczyt paliwa ze szkicu (L); 0 = nie wpisano (przekazanie podstawia > 0). */
  fuelL: number;
  /** Odczyt licznika MH ze szkicu (godziny dziesiętne); 0 = nie wpisano. */
  mh: number;
  /** Pomiar oleju z bagnetu (L); `null` = jeszcze nie zmierzono. */
  oilL: number | null;
  /** MH z przekazania - do reguły cofniętego licznika; `null` = brak przekazania. */
  handoverMh: number | null;
}

/** Powód blokady ROZPOCZNIJ LOT; `null` = wolno lecieć. */
export function preflightBlocker(input: PreflightGateInput): string | null {
  // Koniunkcja ŚWIADOMIE (zachowanie sprzed issue #60): przekazanie zwykle podstawia
  // obie wartości, a wpisanie jednej znaczy, że pilot stoi przy licznikach.
  if (input.fuelL <= 0 && input.mh <= 0) {
    return 'Wprowadź odczyty paliwa i MH z liczników - rozpoczną nowe ogniwo łańcucha';
  }
  // Olej nie ma przekazania, które by go podstawiło - pomiar jest zawsze aktem pilota,
  // więc bramka pyta o sam fakt wpisu, nie o wartość.
  if (input.oilL == null) {
    return 'Zmierz olej i wpisz pomiar z bagnetu - odczyt przy przejęciu jest obowiązkowy';
  }
  if (input.handoverMh != null && input.mh - input.handoverMh < 0) {
    return 'Licznik motogodzin nie może być niższy niż przekazany - popraw odczyt';
  }
  return null;
}
