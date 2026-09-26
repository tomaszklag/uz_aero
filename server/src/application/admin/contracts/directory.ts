/**
 * Ninerdeck (serwer) - SŁOWNIK KLUBU dla panelu: `GET /admin/api/directory`
 * (issue #216, „panel dla wszystkich").
 *
 * Kalendarz w panelu rysuje znak maszyny i skrócone nazwisko pilota z IDENTYFIKATORÓW,
 * które niesie zajętość. Do 3.1.0 brał je z list modułów Piloci i Samoloty - a te stoją
 * na „Podglądzie klubu" (`panel.access`) i niosą więcej, niż kalendarz czyta: adresy
 * e-mail, zakresy, sesje, konfigurację maszyn. Odkąd kalendarz otwiera się KAŻDEMU
 * członkowi, potrzebuje słownika, który niesie DOKŁADNIE to, co ekran z niego czyta -
 * ta sama zasada, co przy cudzej zajętości (`docs/rezerwacje.md` §17).
 *
 * To jest odpowiednik `GET /reference` telefonu w jego najwęższej postaci: nazwy do
 * podpisania tego, co i tak widać. Kod pilota i nazwisko widzi każdy członek także
 * w aplikacji (wybór drugiego pilota, pasek osi kalendarza), więc nic tu nie wycieka.
 */

import type { ServiceStatus } from '@ninerdeck/domain';

export interface DirectoryMember {
  /** Identyfikator OSOBY - klucz zajętości i zdarzeń. */
  id: string;
  /** Kod W TYM klubie - drugi człon podpisu pod nazwiskiem w szufladzie. */
  code: string;
  name: string;
  /** Członkostwo wyłączone zostaje w słowniku: jego rezerwacje z przeszłości mają nazwisko. */
  active: boolean;
}

export interface DirectoryAircraft {
  id: string;
  reg: string;
  type: string;
  serviceStatus: ServiceStatus;
}

export interface AdminDirectory {
  members: DirectoryMember[];
  aircraft: DirectoryAircraft[];
}
