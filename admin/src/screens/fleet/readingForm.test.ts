/**
 * UZ Aero - panel 2.0: formularz odczytu administratora (issue #81) - warstwa czysta.
 */

import { describe, expect, it } from 'vitest';

import type { AircraftReadingDto } from '../../api/dto';
import { readingDraftOf, readingVerdict } from './readingForm';

const reading: AircraftReadingDto = {
  mh: 1236.5,
  fuelL: 112,
  at: Date.UTC(2026, 8, 3, 10, 0),
  byPilotId: 'AKO',
  byPilotName: 'Anna Kowalska',
  oilL: 8.2,
  oilAddedSinceL: 0,
  oilAt: Date.UTC(2026, 8, 1, 7, 0),
  source: 'handover',
  note: null,
};

describe('readingDraftOf', () => {
  it('startuje z bieżącego stanu w formacie licznika TEJ maszyny - poprawia się jedną liczbę', () => {
    expect(readingDraftOf(reading, 'hhmm')).toEqual({
      mh: '1236:30',
      fuelL: '112',
      oilL: '8.2',
      note: '',
    });
    expect(readingDraftOf(reading, 'decimal').mh).toBe('1236.5');
  });

  it('bez odczytu szkic jest pusty - maszyna bez historii nie ma czego podstawić', () => {
    expect(readingDraftOf(null, 'decimal')).toEqual({ mh: '', fuelL: '', oilL: '', note: '' });
  });
});

describe('readingVerdict', () => {
  it('licznik w OBU zapisach, paliwo z przecinkiem, olej opcjonalny, komentarz wymagany', () => {
    expect(
      readingVerdict({ mh: '1236:30', fuelL: '112,5', oilL: '', note: ' po remoncie ' }),
    ).toEqual({
      invalid: [],
      body: { mh: 1236.5, fuelL: 112.5, oilL: null, note: 'po remoncie' },
    });
    expect(readingVerdict({ mh: '1236.5', fuelL: '112', oilL: '8,2', note: 'x' }).body).toEqual({
      mh: 1236.5,
      fuelL: 112,
      oilL: 8.2,
      note: 'x',
    });
  });

  it('puste pola wymagane i nieczytelne liczby blokują zapis - z nazwą pola', () => {
    const empty = readingVerdict({ mh: '', fuelL: '', oilL: '', note: '' });
    expect(empty.body).toBeNull();
    expect(empty.invalid).toEqual(['mh', 'fuelL', 'note']);

    // Olej nieczytelny to błąd, olej pusty to wartość („nieznany").
    const garbage = readingVerdict({ mh: 'abc', fuelL: '1x', oilL: 'dużo', note: 'ok' });
    expect(garbage.invalid).toEqual(['mh', 'fuelL', 'oilL']);
    expect(garbage.body).toBeNull();
  });
});
