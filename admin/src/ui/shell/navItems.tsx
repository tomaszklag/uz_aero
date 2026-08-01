/**
 * UZ Aero — panel: KANONICZNA NAWIGACJA, 11 pozycji w czterech grupach.
 *
 * Przepisana 1:1 z `design/admin/SZABLON.html` — kolejność, etykiety, grupy i ikony.
 * Sidebar jest jedyną rzeczą widoczną na każdym ekranie panelu, więc od tej chwili
 * jest identyczny wszędzie i pochodzi z jednego pliku (`§10 krok 3`).
 *
 * `capability` mówi, czego pozycja WYMAGA. Brak wymogu ponad `panel.access` znaczy
 * „czyta każdy, kto wszedł do panelu" — a nie „brak kontroli": `panel.access` jest
 * warunkiem koniecznym wydania sesji.
 */

import type { Capability } from '../../api/dto';
import {
  ChartIcon,
  ClockIcon,
  DashboardIcon,
  DaysIcon,
  ExportIcon,
  FileIcon,
  FlagIcon,
  LockIcon,
  PeopleIcon,
  PlaneIcon,
  WrenchIcon,
} from '../components/icons';

export interface NavItemSpec {
  /** Ścieżka trasy (bez `#`) — router panelu jedzie na hashu (§7). */
  to: string;
  label: string;
  icon: React.ReactNode;
  capability: Capability;
  /**
   * Plik mockupu, z którego powstaje ekran. Nie jest ozdobą: dopóki ekran nie istnieje,
   * to jedyna informacja, którą panel może uczciwie podać zamiast pustej strony —
   * a gdy już powstanie, zostaje jako wskazanie źródła prawdy dla jego wyglądu.
   */
  mockup: string;
}

export interface NavGroupSpec {
  title: string;
  items: NavItemSpec[];
}

export const NAV_GROUPS: NavGroupSpec[] = [
  {
    title: 'Operacje',
    items: [
      { to: '/pulpit', label: 'Pulpit', icon: <DashboardIcon />, capability: 'panel.access', mockup: 'A01-pulpit.html' },
      { to: '/dni', label: 'Dni lotne', icon: <DaysIcon />, capability: 'panel.access', mockup: 'A02-dni.html' },
      { to: '/flagi', label: 'Flagi', icon: <FlagIcon />, capability: 'panel.access', mockup: 'A03-flagi.html' },
    ],
  },
  {
    title: 'Rejestr',
    items: [
      { to: '/zdarzenia', label: 'Zdarzenia', icon: <FileIcon />, capability: 'panel.access', mockup: 'A04-zdarzenia.html' },
      { to: '/eksporty', label: 'Eksporty', icon: <ExportIcon />, capability: 'panel.access', mockup: 'A05-eksporty.html' },
      { to: '/audyt', label: 'Audyt', icon: <ClockIcon />, capability: 'audit.read', mockup: 'A09-audyt.html' },
    ],
  },
  {
    title: 'Raporty',
    items: [
      { to: '/statystyki', label: 'Statystyki', icon: <ChartIcon />, capability: 'panel.access', mockup: 'A10-statystyki.html' },
    ],
  },
  {
    title: 'Konfiguracja',
    items: [
      {
        to: '/piloci',
        label: 'Piloci',
        icon: <PeopleIcon />,
        // `panel.access`, nie `accounts.manage` — decyzja produktowa z mockupu A06:
        // „Szef wyszkolenia widzi tę listę, ale bez przycisków — potrzebuje jej do
        // statystyk i flag, nie do zarządzania dostępem". Kłódka na pozycji nawigacji
        // odcinałaby mu odczyt, którego trasa `GET /admin/api/pilots` udziela.
        // Przyciski akcji wyszarza `screens/piloci/kontoActions.ts`, z powodem.
        capability: 'panel.access',
        mockup: 'A06-piloci.html',
      },
      { to: '/flota', label: 'Flota', icon: <PlaneIcon size={15} />, capability: 'fleet.manage', mockup: 'A07-flota.html' },
      {
        to: '/progi',
        label: 'Progi i ustawienia',
        icon: <LockIcon />,
        capability: 'thresholds.manage',
        mockup: 'A08-progi.html',
      },
      {
        to: '/konserwacja',
        label: 'Konserwacja',
        icon: <WrenchIcon />,
        mockup: 'A11-konserwacja.html',
        // ZALEŻNOŚĆ DO ROZSTRZYGNIĘCIA: `server/src/domain/roles.ts` nie ma zdolności
        // opisującej narzędzia konserwacyjne (przebudowa projekcji jest dziś CLI,
        // bez trasy HTTP). Do czasu decyzji pozycja jest widoczna dla każdego, kto
        // ma wejście do panelu — czyli tak, jak rysuje ją mockup A11.
        capability: 'panel.access',
      },
    ],
  },
];
