/**
 * Ninerdeck - POZYCJE DOLNEGO PASKA (3.0.0, epik R-E).
 *
 * Osobno od `TabsNavigator.tsx`, bo to jest DEKLARACJA, nie widok - i jako deklaracja
 * daje się sprawdzić testem bez renderowania nawigatora. Sprawdzany jest jeden
 * niezmiennik, którego złamanie nie wywoła żadnego błędu, tylko po cichu zmieni produkt:
 *
 * ══ KOKPIT NIE MA ZAKŁADKI ══
 * Kokpit jest stanem modalnym (CLAUDE.md, issue #82): dopóki pilot trzyma samolot, z 04/05
 * nie prowadzi żadna droga bokiem. Zakładka wyprowadzająca z kokpitu nie byłaby zmianą
 * nawigacji, tylko skasowaniem modalności - a dopisanie jej tutaj to jedna linijka,
 * która wygląda niewinnie. Stąd test, a nie komentarz.
 *
 * Ikony są NAZWAMI ZNACZENIOWYMI z rejestru (`components/foundation/Icon`), nigdy
 * glifami - ta sama reguła, co w kolumnie bocznej panelu.
 */

import type { IconName } from '../components/foundation/Icon';

/** Trasy zakładek - ekran domowy aplikacji widziany na trzy sposoby. */
export type TabName = 'Dashboard' | 'Calendar' | 'History';

export interface TabItem {
  name: TabName;
  label: string;
  icon: IconName;
}

/**
 * Trzy pozycje i ani jednej więcej: każda odpowiada na inne pytanie W CZASIE - co mam
 * dziś, co jest zaplanowane, co już poleciałem.
 *
 * Kolejność JEST kolejnością na pasku, a pierwsza pozycja jest ekranem startowym
 * aplikacji - tak samo, jak kolejność `NAV_ITEMS` rozstrzyga ekran startowy panelu.
 */
export const TABS: readonly TabItem[] = [
  { name: 'Dashboard', label: 'Pulpit', icon: 'home' },
  { name: 'Calendar', label: 'Kalendarz', icon: 'calendar' },
  // Zegar, a nie `history` (strzałka cofająca się): tak rysuje to makieta `24`, a na
  // zakładce zegar znaczy CZAS MINIONY. `history` opisuje przeszłe wersje JEDNEJ danej
  // (arkusz 10I) i to jest inna rzecz.
  { name: 'History', label: 'Historia', icon: 'clock' },
];

/**
 * Trasy FLOW LOTU - żyją w stosie NAD zakładkami i żadna z nich nie ma prawa stać się
 * pozycją paska. Lista jest jawna, bo test ma pytać o KONKRETNE ekrany, a nie o to,
 * czego akurat nie ma w `TABS`.
 */
export const FLOW_ROUTES = [
  'Cockpit',
  'CockpitReadonly',
  'PreflightAircraft',
  'PreflightTask',
  'PreflightReadings',
  'Refuel',
  'CrewChange',
  'ReleaseAircraft',
  'ManualFlight',
  'Stats',
  'Track',
  'Settings',
] as const;
