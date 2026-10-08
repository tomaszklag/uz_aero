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
 * Do 3.2.0 kolumna była PŁASKĄ listą z ikonami, bez grup: grupy mają sens od siedmiu
 * pozycji w górę; wcześniej są ozdobą, która dokłada poziom do przeczytania.
 *
 * == TRZY GRUPY OD 4.0.0 (zlecenia, pkt 32-34; epik Z-D #248) ==
 * Zlecenia są siódmym modułem klubu, więc pozycje stoją w trzech grupach: Loty (Dziennik,
 * Do sprawdzenia, Statystyki), Planowanie (Kalendarz, Zlecenia), Klub (Piloci, Samoloty).
 * Statystyki liczą te same zamknięte operacje, co Dziennik, więc stoją w jego grupie -
 * przed Kalendarzem. Nagłówek grupy jest SAMYM PODPISEM (grupy się nie zwijają) i stoi
 * WYŁĄCZNIE przy co najmniej dwóch widocznych grupach: pilot z samym Kalendarzem
 * i Zleceniami ma listę płaską, tak samo rama superadministratora (`navSectionsFor`).
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
 * zakresem widzi w kolumnie Kalendarz i Zlecenia (od 4.0.0) i ląduje w Kalendarzu po
 * zalogowaniu; Moje konto ma z nazwiska w pasku, jak każdy.
 */

import type { Capability } from '../../api/dto';

export type NavIcon =
  | 'logbook'
  | 'inbox'
  | 'people'
  | 'plane'
  | 'calendar'
  | 'orders'
  | 'chart'
  | 'bug'
  | 'building';

/**
 * Grupa pozycji w kolumnie (4.0.0). Moduły platformy mają własną grupę: sesja platformowa
 * nie widzi żadnego modułu klubu, więc jej lista i tak zostaje płaska.
 */
export type NavGroup = 'flights' | 'planning' | 'club' | 'platform';

/** Podpisy grup - krój tekstowy w pisowni zdaniowej (styl lekki, issue #107). */
const GROUP_LABELS: Readonly<Record<NavGroup, string>> = {
  flights: 'Loty',
  planning: 'Planowanie',
  club: 'Klub',
  platform: 'Platforma',
};

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
  /** Grupa w kolumnie - pozycje jednej grupy stoją w `NAV_ITEMS` obok siebie. */
  group: NavGroup;
}

export const NAV_ITEMS: readonly NavItem[] = [
  // ── LOTY ─────────────────────────────────────────────────────────────────────
  // Dziennik jest PIERWSZY, bo ekran startowy ma być tym, po który się sięga:
  // konta i flotę zakłada się raz na sezon, dziennik ogląda się co tydzień.
  { to: '/dziennik', label: 'Dziennik', icon: 'logbook', access: 'panel.access', group: 'flights' },
  // „Do sprawdzenia" DRUGIE (3.2.0, P-D; `docs/panel-3.2.md` §9, §17): jedno pytanie -
  // co wymaga mojej reakcji - z trzech źródeł. NIE jest ekranem startowym: pulpit jako
  // wejście kazałby czytać podsumowanie każdemu, kto przyszedł po jedną rzecz. Plakietkę
  // z liczbą (`.nav-count`) dokłada rama WYŁĄCZNIE tej pozycji i wyłącznie przy
  // niezerowej sumie (reguła SyncChipa, issue #12).
  { to: '/do-sprawdzenia', label: 'Do sprawdzenia', icon: 'inbox', access: 'panel.access', group: 'flights' },
  // Statystyki TRZECIE (od 4.0.0 w grupie „Loty", pkt 32): jedno pytanie - „ile tego
  // było w tym sezonie" - na tej samej podstawie liczenia, co dziennik (§4.5). Na
  // „Podglądzie klubu", bo to te same operacje, oglądane sumami; analityka zużycia
  // pozycji NIE dostaje - jest własnością maszyny i mieszka w jej karcie (§8).
  { to: '/statystyki', label: 'Statystyki', icon: 'chart', access: 'panel.access', group: 'flights' },
  // ── PLANOWANIE ───────────────────────────────────────────────────────────────
  // Kolejność nie jest kwestią gustu: `homeFor` bierze PIERWSZĄ dostępną pozycję, więc
  // rozstrzyga, gdzie ląduje zalogowany. Dziennik zostaje ekranem startowym
  // administratora; członek bez „Podglądu klubu" ma Kalendarz i Zlecenia i ląduje
  // w Kalendarzu - dlatego Kalendarz stoi przed Zleceniami.
  { to: '/kalendarz', label: 'Kalendarz', icon: 'calendar', access: 'club', group: 'planning' },
  // Zlecenia (4.0.0, `docs/zlecenia.md` §15): zlecenie trafia do KAŻDEGO członka, więc
  // pozycję ma każda sesja klubu - jak Kalendarz. Bez plakietki z liczbą: `.nav-count`
  // należy wyłącznie do „Do sprawdzenia", a zlecenie czekające na odpowiedź budzi
  // adresata skrzynką i powiadomieniem.
  { to: '/zlecenia', label: 'Zlecenia', icon: 'orders', access: 'club', group: 'planning' },
  // ── KLUB ─────────────────────────────────────────────────────────────────────
  { to: '/piloci', label: 'Piloci', icon: 'people', access: 'panel.access', group: 'club' },
  { to: '/samoloty', label: 'Samoloty', icon: 'plane', access: 'panel.access', group: 'club' },
  // ── PLATFORMA ────────────────────────────────────────────────────────────────
  // Dwie pozycje niżej należą do sesji superadministratora i w kolumnie klubu NIE MA
  // ich wcale. Organizacje stoją PRZED Zgłoszeniami, bo `homeFor` bierze pierwszą
  // dostępną: kolejność w tej tablicy jest ekranem startowym obu rodzajów sesji.
  { to: '/organizacje', label: 'Organizacje', icon: 'building', access: 'platform.manage', group: 'platform' },
  // Moduł NA CZAS TESTÓW z pilotami (issue #87) - ostatni, bo zniknie razem
  // z fazą testów, a kolejność pozycji ma opisywać produkt, nie bieżący sprint.
  // Od issue #99 (C6) należy do PLATFORMY: `bugs.triage` ma wyłącznie superadministrator,
  // więc w kolumnie klubu tej pozycji nie ma.
  { to: '/zgloszenia', label: 'Zgłoszenia', icon: 'bug', access: 'bugs.triage', group: 'platform' },
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

/** Kawałek kolumny pod jednym podpisem; `label: null` = bez nagłówka. */
export interface NavSection {
  key: NavGroup;
  label: string | null;
  items: NavItem[];
}

/**
 * Kolumna w grupach (4.0.0, pkt 32-34): widoczne pozycje pocięte na grupy w kolejności
 * z `NAV_ITEMS`, a grupa bez widocznej pozycji znika w całości. Podpis stoi WYŁĄCZNIE
 * przy co najmniej dwóch widocznych grupach - przy jednej nagłówek nazywałby całą
 * kolumnę, czyli niczego by nie odróżniał.
 */
export function navSectionsFor(
  capabilities: readonly Capability[] | undefined,
  kind: SessionKind,
): NavSection[] {
  const sections: NavSection[] = [];
  for (const item of navItemsFor(capabilities, kind)) {
    const last = sections[sections.length - 1];
    if (last != null && last.key === item.group) last.items.push(item);
    else sections.push({ key: item.group, label: GROUP_LABELS[item.group], items: [item] });
  }
  if (sections.length < 2) return sections.map((section) => ({ ...section, label: null }));
  return sections;
}

/**
 * Ekran startowy: PIERWSZA DOSTĘPNA pozycja, nie pierwsza z listy.
 *
 * Goły adres i „wróć do panelu" po marce lądują tutaj, więc stała `/dziennik`
 * odsyłałaby superadministratora na ekran, którego jego sesja nie otwiera - czyli
 * w pętlę przekierowań albo w pustą tabelę z błędem 401 pod spodem. Członek klubu
 * bez „Podglądu klubu" ląduje w Kalendarzu - pierwszej z dwóch pozycji, które ma.
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
