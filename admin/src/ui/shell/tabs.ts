/**
 * UZ Aero - panel 2.0: KANONICZNA nawigacja.
 *
 * Moduł czysty - lista, nie komponent. Trasy w `routes.tsx` wynikają z TEJ listy,
 * a nie z drugiej obok niej: pozycja prowadząca w 404 jest awarią, której nikt nie
 * zauważa, bo klika się ją rzadko.
 *
 * == DLACZEGO PASEK GORNY, A NIE KOLUMNA ==
 * Kolumna boczna panelu 1.0 miała 236 px szerokości i jedenaście pozycji w czterech
 * grupach - w tym grupę z JEDNĄ pozycją. Przy dwóch modułach oddawałaby ćwierć okna
 * pod dwa słowa, a tabela samolotów ma siedem kolumn.
 *
 * Kolumna wraca, gdy modułów będzie cztery albo więcej - i wtedy jako PŁASKA lista,
 * bez grup. Grupy mają sens od siedmiu pozycji w górę; wcześniej są ozdobą, która
 * dokłada poziom do przeczytania.
 */

export interface Tab {
  /** Ścieżka hasha (`#/piloci`) - po polsku, bo bywa wklejana w rozmowie. */
  to: string;
  label: string;
}

export const TABS: readonly Tab[] = [
  // Dziennik jest PIERWSZY, bo ekran startowy ma być tym, po który się sięga:
  // konta i flotę zakłada się raz na sezon, dziennik ogląda się co tydzień.
  { to: '/dziennik', label: 'Dziennik' },
  { to: '/piloci', label: 'Piloci' },
  { to: '/samoloty', label: 'Samoloty' },
];

/** Pierwsza zakładka jest ekranem startowym panelu - goły adres ląduje właśnie tu. */
export const HOME = TABS[0]!.to;
