/**
 * UZ Aero — KIEDY KONTROLKA OTWIERA SIĘ OD RAZU DO WPISU (uwaga z urządzenia, 2026-08-29).
 *
 * Trzecia tura issue #62 kazała arkuszowi czasu otwierać się Z KLAWIATURĄ, bo „jest
 * formularzem o jednym pytaniu, więc pilot i tak tapie w wartość". To było prawdą dla
 * arkusza, który stawiał godzinę OD ZERA — i nieprawdą dla wszystkich pozostałych:
 *
 *   „jak mam «dodaj lot» gdzie mam już wpisane default wartości, to nie otwieraj
 *    tutaj klawiatury. Tutaj raczej będę korzystał z przycisków, którymi manipuluję
 *    godziną +/- 1 min. Tak samo jak otwieram popup, aby wyedytować godzinę."
 *
 * ══ REGUŁA ══
 * Klawiatura wchodzi sama WYŁĄCZNIE tam, gdzie nie ma czego przesuwać. Przy pustej
 * wartości przyciski ± są wygaszone (nie ma bazy, od której liczyć krok), więc wpis
 * z klawiatury jest JEDYNĄ drogą i czekanie na tapnięcie byłoby czystym kosztem.
 * Gdy wartość JEST — czy to godzina odziedziczona po biegu silnika przy „DODAJ LOT",
 * czy istniejący czas otwarty do korekty — pilot poprawia ją o minutę albo dwie,
 * a klawiatura zasłania przy tym pół arkusza razem z kontrolką obok.
 *
 * Reguła siedzi w KONTROLCE, nie w arkuszu, bo jest własnością `autoEdit` jako takiego:
 * każdy przyszły arkusz z tą flagą dostanie ją za darmo, zamiast odtwarzać ten rachunek
 * u siebie (i pomylić się tak samo).
 */

export function stepperOpensForTyping(
  autoEdit: boolean,
  editable: boolean,
  value: number | null,
): boolean {
  // `editable` = kontrolka w ogóle przyjmuje wpis (`StepperEdit`); bez tego nie ma
  // czego otwierać. `value == null` = nie ma czego przesuwać ± — patrz nota wyżej.
  return autoEdit && editable && value == null;
}
