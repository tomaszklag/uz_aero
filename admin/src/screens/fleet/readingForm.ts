/**
 * UZ Aero - panel 2.0: formularz ODCZYTU WPISANEGO RĘKĄ ADMINISTRATORA (issue #81).
 *
 * Moduł CZYSTY (bez Reacta): co administrator wpisał → co pójdzie na serwer, albo
 * które pole jest nie do przyjęcia. Ta sama zasada, co `aircraftForm.ts`: formularz
 * ocenia KSZTAŁT (czy to liczba, czy komentarz jest), a reguły świata (sufity
 * zbiorników, minus) egzekwuje serwer nazwanym powodem - druga kopia tych reguł
 * w przeglądarce rozjechałaby się z pierwszą.
 *
 * Szkic startuje z BIEŻĄCEGO stanu maszyny: administrator poprawia jedną liczbę,
 * a nie przepisuje trzech. Licznik w formacie TEJ maszyny (`mhFormat`), jak przy
 * stanie początkowym (§10.4) - a przyjmuje oba zapisy naraz (`parseMotoHours`).
 */

import { motoHours, parseLitres, parseMotoHours } from '@uzaero/format';
import type { MhFormat } from '@uzaero/domain';

import type { AircraftReadingDto } from '../../api/dto';
import type { RecordReadingBody } from '../../api/fleet';

export interface ReadingDraft {
  mh: string;
  fuelL: string;
  /** Pusty napis = olej nieznany (`null` na serwerze) - jedyne pole, które wolno zostawić puste. */
  oilL: string;
  note: string;
}

export type ReadingField = keyof ReadingDraft;

/** Litry bez jednostki - pole ma etykietę „(L)". */
const bare = (formatted: string): string => formatted.replace(/\sL$/, '');

/** Szkic wypełniony bieżącym odczytem; bez odczytu - pusty (maszyna bez historii). */
export function readingDraftOf(reading: AircraftReadingDto | null, mhFormat: MhFormat): ReadingDraft {
  if (reading == null) return { mh: '', fuelL: '', oilL: '', note: '' };
  return {
    mh: motoHours(reading.mh, mhFormat),
    fuelL: String(reading.fuelL),
    oilL: reading.oilL == null ? '' : String(reading.oilL),
    note: '',
  };
}

export interface ReadingVerdict {
  /** Pola nie do przyjęcia (czerwona ramka). Puste = da się zapisać. */
  invalid: ReadingField[];
  /** Ciało żądania; `null`, gdy cokolwiek jest nie do przyjęcia. */
  body: RecordReadingBody | null;
}

/**
 * Licznik i paliwo WYMAGANE (bez nich wpis nie ma miejsca w łańcuchu), olej opcjonalny,
 * komentarz WYMAGANY - nadpisuje się cudze odczyty, więc powód jest treścią wpisu.
 * Puste pole wymagane blokuje zapis samym brakiem (issue #55: widać z formularza).
 */
export function readingVerdict(draft: ReadingDraft): ReadingVerdict {
  const invalid: ReadingField[] = [];

  const mh = draft.mh.trim() === '' ? null : parseMotoHours(draft.mh);
  if (mh == null) invalid.push('mh');

  const fuelL = draft.fuelL.trim() === '' ? null : parseLitres(draft.fuelL);
  if (fuelL == null) invalid.push('fuelL');

  const oilText = draft.oilL.trim();
  const oilL = oilText === '' ? null : parseLitres(oilText);
  if (oilText !== '' && oilL == null) invalid.push('oilL');

  const note = draft.note.trim();
  if (note === '') invalid.push('note');

  if (invalid.length > 0 || mh == null || fuelL == null) return { invalid, body: null };
  return { invalid, body: { mh, fuelL, oilL, note } };
}
