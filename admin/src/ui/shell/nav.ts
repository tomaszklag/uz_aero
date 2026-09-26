/**
 * Ninerdeck - panel: KANONICZNA nawigacja - pozycje kolumny bocznej.
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
 * == POZYCJA NALEŻY DO DOSTĘPU (wielofirmowość, issue #99 C6; issue #216) ==
 * Panel obsługuje DWA rodzaje sesji: klub i platformę. Kolumna nie jest więc stałą
 * listą - jest listą przefiltrowaną `navItemsFor`. Dostęp stoi PRZY POZYCJI, a nie
 * w warunku w `AppShell`, bo pozycja bez prawa wejścia i trasa bez prawa wejścia to
 * jedna decyzja: rozdzielone rozjeżdżają się przy dodaniu piątego modułu. Dlatego
 * `hasAccess` stąd czyta zarówno kolumna, jak i strażnik trasy (`RequireCapability`).
 *
 * == „PANEL DLA WSZYSTKICH" (issue #216, 2026-09-25) ==
 * Do panelu wchodzi KAŻDY aktywny członek klubu. Kalendarz ma każdy - jak w aplikacji -
 * więc jego pozycja nie pyta o zdolność, tylko o RODZAJ SESJI (`'club'`); dziennik,
 * pilotów i samoloty otwiera „Podgląd klubu" (`panel.access`). Członek z pustym
 * zakresem widzi w kolumnie sam Kalendarz i tam ląduje po zalogowaniu; Moje konto ma
 * z nazwiska w pasku, jak każdy.
 */

import type { Capability } from '../../api/dto';

export type NavIcon = 'logbook' | 'inbox' | 'people' | 'plane' | 'calendar' | 'bug' | 'building';

/** Rodzaj sesji panelu: klub (członkostwo) albo platforma (superadministrator bez klubu). */
export type SessionKind = 'org' | 'platform';

/**
 * Rodzaj sesji z jej kształtu: sesję platformową poznaje się po `org: null`
 * (`PanelSessionDto`). Jedna definicja dla strażnika trasy, przekierowań i ekranu
 * „Brak dostępu" - pięć kopii tego warunku rozjechałoby się przy pierwszej poprawce.
 * Brak sesji liczy się jako klub: bez sesji i tak nie ma czego rysować, a domyślny
 * ekran startowy jest ekranem klubu.
 */
export function kindOf(session: { org: unknown } | null | undefined): SessionKind {
  return session?.org == null ? (session == null ? 'org' : 'platform') : 'org';
}

/**
 * Warunek wejścia: zdolność z katalogu ALBO `'club'` = każda sesja klubu, bez pytania
 * o zbiór. Osobna wartość, a nie pseudo-zdolność: „bycia członkiem" nie da się nadać
 * ani odebrać w karcie członka, więc w katalogu nie ma dla niego miejsca.
 */
export type Access = Capability | 'club';

export interface NavItem {
  /** Ścieżka hasha (`#/piloci`) - po polsku, bo bywa wklejana w rozmowie. */
  to: string;
  label: string;
  icon: NavIcon;
  /** Bez tego dostępu pozycji NIE MA (nie jest wyszarzona - patrz `auth/can.ts`). */
  access: Access;
}

export const NAV_ITEMS: readonly NavItem[] = [
  // Dziennik jest PIERWSZY, bo ekran startowy ma być tym, po który się sięga:
  // konta i flotę zakłada się raz na sezon, dziennik ogląda się co tydzień.
  { to: '/dziennik', label: 'Dziennik', icon: 'logbook', access: 'panel.access' },
  // „Do sprawdzenia" DRUGIE (3.2.0, P-D; `docs/panel-3.2.md` §9, §17): jedno pytanie -
  // co wymaga mojej reakcji - z trzech źródeł. NIE jest ekranem startowym: pulpit jako
  // wejście kazałby czytać podsumowanie każdemu, kto przyszedł po jedną rzecz. Plakietkę
  // z liczbą (`.nav-count`) dokłada rama WYŁĄCZNIE tej pozycji i wyłącznie przy
  // niezerowej sumie (reguła SyncChipa, issue #12).
  { to: '/do-sprawdzenia', label: 'Do sprawdzenia', icon: 'inbox', access: 'panel.access' },
  // Kalendarz TRZECI (3.2.0, §17: Dziennik · Do sprawdzenia · Kalendarz · Statystyki ·
  // Piloci · Samoloty - Statystyki dochodzą z epikiem P-E). Kolejność nie jest kwestią
  // gustu: `homeFor` bierze PIERWSZĄ dostępną pozycję, więc rozstrzyga, gdzie ląduje
  // zalogowany. Dziennik zostaje ekranem startowym administratora; członek bez
  // „Podglądu klubu" ma tylko Kalendarz i ląduje właśnie tu.
  { to: '/kalendarz', label: 'Kalendarz', icon: 'calendar', access: 'club' },
  { to: '/piloci', label: 'Piloci', icon: 'people', access: 'panel.access' },
  { to: '/samoloty', label: 'Samoloty', icon: 'plane', access: 'panel.access' },
  // ── PLATFORMA ────────────────────────────────────────────────────────────────
  // Dwie pozycje niżej należą do sesji superadministratora i w kolumnie klubu NIE MA
  // ich wcale. Organizacje stoją PRZED Zgłoszeniami, bo `homeFor` bierze pierwszą
  // dostępną: kolejność w tej tablicy jest ekranem startowym obu rodzajów sesji.
  { to: '/organizacje', label: 'Organizacje', icon: 'building', access: 'platform.manage' },
  // Moduł NA CZAS TESTÓW z pilotami (issue #87) - ostatni, bo zniknie razem
  // z fazą testów, a kolejność pozycji ma opisywać produkt, nie bieżący sprint.
  // Od issue #99 (C6) należy do PLATFORMY: `bugs.triage` ma wyłącznie superadministrator,
  // więc w kolumnie klubu tej pozycji nie ma.
  { to: '/zgloszenia', label: 'Zgłoszenia', icon: 'bug', access: 'bugs.triage' },
];

/**
 * Czy TA sesja otwiera ten dostęp. Jedna odpowiedź dla kolumny bocznej i dla strażnika
 * trasy - to nie jest zabezpieczenie (egzekwuje serwer), tylko to, co widzi człowiek.
 */
export function hasAccess(
  capabilities: readonly Capability[] | undefined,
  kind: SessionKind,
  access: Access,
): boolean {
  if (access === 'club') return kind === 'org';
  return capabilities?.includes(access) ?? false;
}

/** Pozycje, na które zalogowany ma prawo wejść - w kolejności z `NAV_ITEMS`. */
export function navItemsFor(
  capabilities: readonly Capability[] | undefined,
  kind: SessionKind,
): NavItem[] {
  return NAV_ITEMS.filter((item) => hasAccess(capabilities, kind, item.access));
}

/**
 * Ekran startowy: PIERWSZA DOSTĘPNA pozycja, nie pierwsza z listy.
 *
 * Goły adres i „wróć do panelu" po marce lądują tutaj, więc stała `/dziennik`
 * odsyłałaby superadministratora na ekran, którego jego sesja nie otwiera - czyli
 * w pętlę przekierowań albo w pustą tabelę z błędem 401 pod spodem. Członek klubu
 * bez „Podglądu klubu" ląduje w Kalendarzu - jedynej pozycji, którą ma.
 *
 * Sesja bez ANI JEDNEJ pozycji (platforma bez roli platformowej - dziś nie istnieje,
 * ale model jej nie zabrania) dostaje `/dziennik`: adres musi być zawsze, a odmowę
 * powie ekran „Brak dostępu".
 */
export function homeFor(capabilities: readonly Capability[] | undefined, kind: SessionKind): string {
  return navItemsFor(capabilities, kind)[0]?.to ?? NAV_ITEMS[0]!.to;
}

/**
 * Ekran startowy sesji KLUBU - dla miejsc, które nie mają jeszcze zdolności pod ręką
 * (przekierowanie z ekranu logowania, gdy sesji jeszcze nie ma).
 */
export const HOME = NAV_ITEMS[0]!.to;

/**
 * Pozycja, przy której rama stawia LICZBĘ spraw (`.nav-count`). Jedna i nazwana tutaj,
 * a nie flagą na pozycji: liczba istnieje tylko dla jednego modułu, więc drugi taki
 * licznik byłby decyzją produktową, nie dopisaniem pola.
 */
export const COUNTED = '/do-sprawdzenia';

/**
 * MOJE KONTO (2.1.0, issue #134 D6) - jedyny ekran panelu, który jest O OSOBIE
 * PATRZĄCEJ, a nie o klubie.
 *
 * Dlatego NIE MA go w `NAV_ITEMS`: kolumna boczna wymienia moduły klubu, a konto
 * modułem nie jest - pozycja obok „Dziennika" obiecywałaby czwarty moduł. Wejście jest
 * z nazwiska w pasku górnym, jak w każdej aplikacji web, więc adres stoi tu, przy
 * kanonicznej liście tras, a nie w komponencie paska.
 */
export const ACCOUNT = '/konto';

/**
 * „Nie pamiętam hasła" (2.1.0, issue #134 D3) - ekran PRZED ramą, jak logowanie
 * i wybór klubu: sesji jeszcze nie ma, więc pasek i kolumna nie miałyby czego napisać.
 */
export const FORGOT_PASSWORD = '/logowanie/haslo';

/**
 * „Załóż konto" (issue #180) - trzeci ekran PRZED ramą, pod `/logowanie/`, bo jest
 * krokiem logowania: kończy się listem, a osoba powstaje dopiero na stronie z linku.
 */
export const SIGN_UP = '/logowanie/konto';
