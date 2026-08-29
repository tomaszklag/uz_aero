/**
 * UZ Aero - test podstawiania odczytów startowych (issue #62, siódma i ósma tura).
 *
 * Reguła „nie nadpisuj decyzji pilota" jest tu CAŁĄ treścią modułu, a warunek trzymany
 * w JSX już raz przeżył dziurę bez jednego czerwonego testu (`myDayActions`, issue #42).
 * Stąd osobny plik i osobne przypadki na każdą gałąź.
 */

import {
  prefillSource,
  readingsPrefill,
  type AppliedPrefill,
} from '../ui/screens/logic/readingsPrefill';
import type { RemoteReadingsChainLink } from '../application';

const before: RemoteReadingsChainLink = {
  sessionUuid: 'rano',
  picId: 'ako',
  at: Date.UTC(2026, 7, 16, 9, 0),
  fuelL: 140,
  mh: 1232.4,
};

const empty = { foundL: null, mhBefore: null };

describe('podstawianie odczytów zastanych', () => {
  it('wypełnia OBA puste pola - paliwo i licznik idą z tej samej odpowiedzi', () => {
    // Sedno ósmej tury: łańcuch niósł MH sąsiada od początku, a wpis go nie używał.
    const result = readingsPrefill('sp-axa', before, null, empty);
    expect(result!.fields).toEqual({ foundL: 140, mhBefore: 1232.4 });
  });

  it('nie ma czego podstawić bez sąsiada ani bez maszyny', () => {
    expect(readingsPrefill('sp-axa', null, null, empty)).toBeNull();
    expect(readingsPrefill('sp-axa', undefined, null, empty)).toBeNull();
    expect(readingsPrefill(null, before, null, empty)).toBeNull();
  });

  it('z tego samego sąsiada podstawia RAZ - drugie wejście na krok nic nie robi', () => {
    const first = readingsPrefill('sp-axa', before, null, empty)!;
    expect(readingsPrefill('sp-axa', before, first.applied, first.fields)).toBeNull();
  });

  it('NIE NADPISUJE liczby wpisanej przez pilota', () => {
    // Paliwomierz bije rachubę: pilot wpisał 96 L i 1233 MH, bo tyle pokazywały przyrządy.
    const applied: AppliedPrefill = { key: 'sp-axa|inny', fuelL: 140, mh: 1232.4 };
    const result = readingsPrefill('sp-axa', before, applied, { foundL: 96, mhBefore: 1233 });
    expect(result!.fields).toEqual({ foundL: 96, mhBefore: 1233 });
  });

  it('nadpisuje WŁASNĄ poprzednią podpowiedź, gdy zmienia się sąsiad', () => {
    // Pilot cofnął się na krok 1 i wybrał inną maszynę - liczby z tamtej są dziś śmieciem,
    // ale tylko dlatego, że to MY je tam wpisaliśmy.
    const applied: AppliedPrefill = { key: 'sp-bkk|wczoraj', fuelL: 88, mh: 900 };
    const result = readingsPrefill('sp-axa', before, applied, { foundL: 88, mhBefore: 900 });
    expect(result!.fields).toEqual({ foundL: 140, mhBefore: 1232.4 });
  });

  it('rozstrzyga POLE PO POLU - poprawione paliwo zostaje, pusty licznik się wypełnia', () => {
    const applied: AppliedPrefill = { key: 'sp-axa|inny', fuelL: 140, mh: 1232.4 };
    const result = readingsPrefill('sp-axa', before, applied, { foundL: 96, mhBefore: null });
    expect(result!.fields).toEqual({ foundL: 96, mhBefore: 1232.4 });
  });

  it('klucz rozróżnia maszyny stojące na tej samej chwili', () => {
    const first = readingsPrefill('sp-axa', before, null, empty)!;
    expect(readingsPrefill('sp-bkk', before, first.applied, first.fields)).not.toBeNull();
  });
});

describe('adnotacja źródła przy polu', () => {
  it('mówi, skąd liczba, dopóki jest to liczba sąsiada', () => {
    expect(prefillSource(before, 'fuelL', 140)).toBe('z poprzedniego lotu · AKO');
    expect(prefillSource(before, 'mh', 1232.4)).toBe('z poprzedniego lotu · AKO');
  });

  it('MILCZY przy wartości poprawionej - inaczej podpisywałaby cudzym źródłem odczyt pilota', () => {
    expect(prefillSource(before, 'fuelL', 96)).toBeUndefined();
    expect(prefillSource(before, 'mh', 1233)).toBeUndefined();
    expect(prefillSource(before, 'fuelL', null)).toBeUndefined();
    expect(prefillSource(null, 'fuelL', 140)).toBeUndefined();
  });
});
