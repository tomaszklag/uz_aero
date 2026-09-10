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
 *
 * == POZYCJA NALEŻY DO ZDOLNOŚCI (wielofirmowość, issue #99 C6) ==
 * Panel obsługuje odtąd DWA rodzaje sesji: klub (Dziennik, Piloci, Samoloty) i platformę
 * (Zgłoszenia, a od epiku E Organizacje). Kolumna nie jest więc stałą listą - jest
 * listą przefiltrowaną `navItemsFor`. Zdolność stoi PRZY POZYCJI, a nie w warunku
 * w `AppShell`, bo pozycja bez prawa wejścia i trasa bez prawa wejścia to jedna
 * decyzja: rozdzielone rozjeżdżają się przy dodaniu piątego modułu.
 */

import type { Capability } from '../../api/dto';

export type NavIcon = 'logbook' | 'people' | 'plane' | 'bug';

export interface NavItem {
  /** Ścieżka hasha (`#/piloci`) - po polsku, bo bywa wklejana w rozmowie. */
  to: string;
  label: string;
  icon: NavIcon;
  /** Bez tej zdolności pozycji NIE MA (nie jest wyszarzona - patrz `auth/can.ts`). */
  capability: Capability;
}

export const NAV_ITEMS: readonly NavItem[] = [
  // Dziennik jest PIERWSZY, bo ekran startowy ma być tym, po który się sięga:
  // konta i flotę zakłada się raz na sezon, dziennik ogląda się co tydzień.
  { to: '/dziennik', label: 'Dziennik', icon: 'logbook', capability: 'panel.access' },
  { to: '/piloci', label: 'Piloci', icon: 'people', capability: 'panel.access' },
  { to: '/samoloty', label: 'Samoloty', icon: 'plane', capability: 'panel.access' },
  // Moduł NA CZAS TESTÓW z pilotami (issue #87) - ostatni, bo zniknie razem
  // z fazą testów, a kolejność pozycji ma opisywać produkt, nie bieżący sprint.
  // Od issue #99 (C6) należy do PLATFORMY: `bugs.triage` ma wyłącznie superadministrator,
  // więc w kolumnie klubu tej pozycji nie ma.
  { to: '/zgloszenia', label: 'Zgłoszenia', icon: 'bug', capability: 'bugs.triage' },
];

/** Pozycje, na które zalogowany ma prawo wejść - w kolejności z `NAV_ITEMS`. */
export function navItemsFor(capabilities: readonly Capability[] | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => capabilities?.includes(item.capability) ?? false);
}

/**
 * Ekran startowy: PIERWSZA DOSTĘPNA pozycja, nie pierwsza z listy.
 *
 * Goły adres i „wróć do panelu" po marce lądują tutaj, więc stała `/dziennik`
 * odsyłałaby superadministratora na ekran, którego jego sesja nie otwiera - czyli
 * w pętlę przekierowań albo w pustą tabelę z błędem 401 pod spodem.
 *
 * Sesja bez ANI JEDNEJ pozycji (rola bez zdolności - dziś nie istnieje, ale model jej
 * nie zabrania) dostaje `/dziennik`: adres musi być zawsze, a odmowę powie serwer.
 */
export function homeFor(capabilities: readonly Capability[] | undefined): string {
  return navItemsFor(capabilities)[0]?.to ?? NAV_ITEMS[0]!.to;
}

/**
 * Ekran startowy sesji KLUBU - dla miejsc, które nie mają jeszcze zdolności pod ręką
 * (przekierowanie z ekranu logowania, gdy sesji jeszcze nie ma).
 */
export const HOME = NAV_ITEMS[0]!.to;
