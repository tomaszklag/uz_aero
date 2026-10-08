/**
 * Ninerdeck - panel: SŁOWNIK KLUBU dla skrzynki (4.0.0, K7) - nazwisko, znak i format
 * licznika z identyfikatora.
 *
 * Wiadomość wozi identyfikatory (`payload`), a zdanie potrzebuje nazwisk i znaków. Spoza
 * słownika wraca `null`, nigdy identyfikator: wiersz mówi wtedy ogólnie („Prośba o zgodę
 * na lot", „samolot"), bo surowy uuid pod oczami człowieka jest gorszy niż brak nazwy.
 */

import type { MhFormat } from '@ninerdeck/domain';

import type { DirectoryDto } from '../../api/dto';

export interface InboxLookups {
  nameOf: (pilotId: string) => string | null;
  regOf: (aircraftId: string) => string | null;
  mhFormatOf: (aircraftId: string) => MhFormat | null;
}

export function inboxLookups(directory: DirectoryDto | undefined): InboxLookups {
  const names = new Map((directory?.members ?? []).map((m) => [m.id, m.name]));
  const aircraft = new Map((directory?.aircraft ?? []).map((a) => [a.id, a]));
  return {
    nameOf: (pilotId) => names.get(pilotId) ?? null,
    regOf: (aircraftId) => aircraft.get(aircraftId)?.reg ?? null,
    mhFormatOf: (aircraftId) => aircraft.get(aircraftId)?.mhFormat ?? null,
  };
}
