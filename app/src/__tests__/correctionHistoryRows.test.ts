/**
 * UZ Aero - test PODPISU WIERSZA HISTORII ZMIAN (issue #43, uwaga z urządzenia).
 *
 * Zgłoszenie brzmiało: „po co dajesz badge z typem pola »notatka«, przecież mam to
 * napisane w nagłówku". Plakietka nie jest jednak zbędna zawsze - w historii odczytu
 * przejęcia to jedyna rzecz, która odróżnia wiersz o paliwie od wiersza o liczniku.
 * Rozstrzyga FAKTYCZNA zawartość listy i to jest cała reguła tego modułu.
 */

import { fieldLabel, needsFieldLabels } from '../ui/screens/logic/correctionHistoryRows';
import type { CorrectionField } from '../domain';

const entries = (...fields: (CorrectionField | null)[]) => fields.map((field) => ({ field }));

describe('podpis wiersza historii zmian', () => {
  it('lista jednorodna NIE podpisuje - nagłówek arkusza mówi to samo', () => {
    // Historia notatki ma same notatki, historia lądowania - same czasy. Plakietka
    // powtarzałaby nagłówek przy każdym wpisie i zabierała miejsce parze wartości.
    expect(needsFieldLabels(entries('notes', 'notes'))).toBe(false);
    expect(needsFieldLabels(entries('time', 'time', 'time'))).toBe(false);
    expect(needsFieldLabels(entries('dualId'))).toBe(false);
  });

  it('lista mieszana podpisuje, bo wiersze trzeba rozróżnić', () => {
    // Bez podpisu „150 → 148" i „1234,5 → 1234,6" różnią się wyłącznie rzędem wielkości.
    expect(needsFieldLabels(entries('fuelL', 'mh'))).toBe(true);
    expect(needsFieldLabels(entries('time', 'jumpers'))).toBe(true);
  });

  it('decyduje ZAWARTOŚĆ listy, nie to, co w niej mogłoby być', () => {
    // Arkusz odczytu obejmuje czas, paliwo i licznik, ale sesja z samymi poprawkami
    // paliwa daje listę jednorodną - i wtedy podpisu nie potrzebuje.
    expect(needsFieldLabels(entries('fuelL', 'fuelL'))).toBe(false);
  });

  it('unieważnienia nie liczą się do rozstrzygnięcia', () => {
    // `void`/`unvoid` nie zmieniają wartości i mają w arkuszu własny werdykt zamiast
    // pary „było → jest", więc nie mają czego podpisywać ani czego różnicować.
    expect(needsFieldLabels(entries(null, 'time', null))).toBe(false);
    expect(needsFieldLabels(entries(null, null))).toBe(false);
  });

  it('pusta lista nie podpisuje niczego', () => {
    expect(needsFieldLabels([])).toBe(false);
  });

  it('każde pole rejestru ma polską nazwę', () => {
    // Brak wpisu w słowniku dawał `undefined` w miejscu plakietki - dokładnie tak
    // wyglądały pierwsze korekty notatki i Duala, zanim doszły tu obie nazwy.
    const fields: CorrectionField[] = [
      'time',
      'fuelL',
      'mh',
      'oilL',
      'oilAddedL',
      'jumpers',
      'notes',
      'dualId',
    ];

    for (const field of fields) {
      expect(fieldLabel(field)).toEqual(expect.any(String));
      expect(fieldLabel(field).length).toBeGreaterThan(0);
    }
  });
});
