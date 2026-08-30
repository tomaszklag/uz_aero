/**
 * UZ Aero - panel 2.0: konto z serwera -> WIERSZ TABELI.
 *
 * Moduł CZYSTY (bez Reacta), bo to są decyzje o treści komórek - a te chcemy mieć
 * pod testem, nie w JSX-ie. Komponent dostaje gotowy wiersz i wyłącznie go rysuje.
 */

import type { PilotListItemDto, PilotRole } from '../../api/dto';
import type { PillTone } from '../../ui/components';

/**
 * Nazwa roli DLA CZŁOWIEKA i jej ton.
 *
 * `Record<PilotRole, …>`, więc rola dodana na serwerze wywala kompilację zamiast
 * pojawić się na ekranie jako surowy kod.
 *
 * Rola panelowa jest `blue` (to jest informacja: ten człowiek wchodzi do panelu),
 * pilot jest `dim` - bo to stan domyślny, a plakietka świecąca przy każdym wierszu
 * uczy oko pomijać kolumnę.
 */
const ROLES: Record<PilotRole, { label: string; tone: PillTone }> = {
  admin: { label: 'Administrator', tone: 'blue' },
  pilot: { label: 'Pilot', tone: 'dim' },
};

export const roleLabel = (role: PilotRole): string => ROLES[role].label;
export const roleTone = (role: PilotRole): PillTone => ROLES[role].tone;

/** Jedno zdanie o tym, co rola OTWIERA - do kart wyboru w formularzu. */
const ROLE_NOTES: Record<PilotRole, string> = {
  pilot: 'Tylko aplikacja na telefonie.',
  admin: 'Panel w całości, razem z pilotami i samolotami.',
};

export const roleNote = (role: PilotRole): string => ROLE_NOTES[role];

/** Kolejność kart wyboru roli - od najmniejszych uprawnień. Domyślna jest pierwsza. */
export const ROLE_ORDER: readonly PilotRole[] = ['pilot', 'admin'];

export interface AccountRow {
  id: string;
  code: string;
  name: string;
  /** Kreska, nie pusta komórka: brak e-maila to normalny stan, nie brak danych. */
  email: string;
  roleLabel: string;
  roleTone: PillTone;
  active: boolean;
  statusLabel: string;
  /** Wiersz przygaszony - konto bez dostępu. Serwer stawia takie na końcu listy. */
  muted: boolean;
}

export function accountRow(pilot: PilotListItemDto): AccountRow {
  return {
    id: pilot.id,
    code: pilot.code,
    name: pilot.name,
    email: pilot.email ?? '—',
    roleLabel: roleLabel(pilot.role),
    roleTone: roleTone(pilot.role),
    active: pilot.active,
    statusLabel: pilot.active ? 'Aktywny' : 'Nieaktywny',
    muted: !pilot.active,
  };
}
