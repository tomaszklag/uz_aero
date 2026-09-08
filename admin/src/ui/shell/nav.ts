/**
 * UZ Aero - panel: KANONICZNA nawigacja - pozycje kolumny bocznej.
 *
 * Moduł czysty - lista, nie komponent. Trasy w `routes.tsx` wynikają z TEJ listy,
 * a nie z drugiej obok niej: pozycja prowadząca w 404 jest awarią, której nikt nie
 * zauważa, bo klika się ją rzadko.
 *
 * == KOLUMNA BOCZNA (styl lekki, issue #107, 2026-09-08) ==
 * Panel 2.0 miał pasek górny z zakładkami, bo „kolumna przy dwóch modułach oddaje
 * ćwierć okna pod dwa słowa". Modułów jest cztery, a nad nimi od wielofirmowości 2.0.0
 * stoi kontekst klubu - w pasku nie było na to miejsca, w kolumnie jest jego naturalne.
 * Kolumna jest PŁASKĄ listą z ikonami, bez grup: grupy mają sens od siedmiu pozycji
 * w górę; wcześniej są ozdobą, która dokłada poziom do przeczytania.
 *
 * Ikona jest KLUCZEM, nie komponentem: moduł ma zostać czysty (bez Reacta), więc
 * odwzorowanie klucza na SVG robi `AppShell`.
 */

export type NavIcon = 'logbook' | 'people' | 'plane' | 'bug';

export interface NavItem {
  /** Ścieżka hasha (`#/piloci`) - po polsku, bo bywa wklejana w rozmowie. */
  to: string;
  label: string;
  icon: NavIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  // Dziennik jest PIERWSZY, bo ekran startowy ma być tym, po który się sięga:
  // konta i flotę zakłada się raz na sezon, dziennik ogląda się co tydzień.
  { to: '/dziennik', label: 'Dziennik', icon: 'logbook' },
  { to: '/piloci', label: 'Piloci', icon: 'people' },
  { to: '/samoloty', label: 'Samoloty', icon: 'plane' },
  // Moduł NA CZAS TESTÓW z pilotami (issue #87) - ostatni, bo zniknie razem
  // z fazą testów, a kolejność pozycji ma opisywać produkt, nie bieżący sprint.
  { to: '/zgloszenia', label: 'Zgłoszenia', icon: 'bug' },
];

/** Pierwsza pozycja jest ekranem startowym panelu - goły adres ląduje właśnie tu. */
export const HOME = NAV_ITEMS[0]!.to;
