/**
 * Ninerdeck - panel 2.0: konto z serwera -> WIERSZ TABELI.
 *
 * Moduł CZYSTY (bez Reacta), bo to są decyzje o treści komórek - a te chcemy mieć
 * pod testem, nie w JSX-ie. Komponent dostaje gotowy wiersz i wyłącznie go rysuje.
 */

import type { PilotListItemDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';
import { NONE } from '../common/values';
import { scopeLabel, scopeTone } from './scope';

/*
 * NAZWĘ ZAKRESU LICZY `scope.ts` ZE ZBIORU (epik #197) - tabela jej nie
 * przechowuje i nie wymyśla. Do 3.1.0 stała tu mapa ról na etykiety; rola zniknęła
 * z modelu razem z kolumną, a „administrator" jest odtąd nazwą ZESTAWU zdolności.
 */


export interface AccountRow {
  id: string;
  code: string;
  name: string;
  /** Kreska, nie pusta komórka: brak e-maila to normalny stan, nie brak danych. */
  email: string;
  scopeLabel: string;
  scopeTone: PillTone;
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
    email: pilot.email ?? NONE,
    scopeLabel: scopeLabel(pilot.capabilities),
    scopeTone: scopeTone(pilot.capabilities),
    active: pilot.active,
    statusLabel: pilot.active ? 'Aktywny' : 'Nieaktywny',
    muted: !pilot.active,
  };
}
