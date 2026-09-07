/**
 * Zaznaczenie pola wpisu przy otwarciu arkusza (`components/sheets/sheetSelection.ts`).
 *
 * Zgłoszenie z urządzenia (2026-09-02, arkusz oleju): sterowane „zaznacz wszystko"
 * trzymane aż do pierwszej wpisanej cyfry przywracało się przy każdym odświeżeniu pola
 * i nie dawało postawić kursora tapnięciem. Reguła po poprawce: kursor na końcu wpisu,
 * a sterowanie oddane polu w chwili, w której doniesie DOKŁADNIE zadaną pozycję.
 */

import {
  cursorAtEnd,
  selectionApplied,
} from '../ui/components/sheets/sheetSelection';

describe('cursorAtEnd', () => {
  it('stawia kursor za ostatnim znakiem, bez zaznaczenia', () => {
    expect(cursorAtEnd('112')).toEqual({ start: 3, end: 3 });
  });

  it('puste pole dostaje pozycję zerową', () => {
    expect(cursorAtEnd('')).toEqual({ start: 0, end: 0 });
  });
});

describe('selectionApplied', () => {
  const target = { start: 3, end: 3 };

  it('zwalnia dokładnie na zadanej pozycji', () => {
    expect(selectionApplied(target, { start: 3, end: 3 })).toBe(true);
  });

  it('zdarzenie z fokusu ({0,0}) przed zastosowaniem celu NIE zwalnia', () => {
    // Zwolnienie na nim zostawiłoby kursor na początku, choć cel to koniec wpisu.
    expect(selectionApplied(target, { start: 0, end: 0 })).toBe(false);
  });

  it('pozycja sprzed maski (inna niż cel) NIE zwalnia', () => {
    // Maska przestawia znaki, więc zdarzenie potrafi donieść pozycję, której na
    // ekranie już nie ma - pułapka opisana w docs/architektura-kodu.md §2.
    expect(selectionApplied({ start: 5, end: 5 }, { start: 4, end: 4 })).toBe(false);
  });

  it('częściowe pokrycie (zaznaczenie zamiast kursora) NIE zwalnia', () => {
    expect(selectionApplied(target, { start: 0, end: 3 })).toBe(false);
  });

  it('po oddaniu sterowania (undefined) nie ma czego zwalniać', () => {
    expect(selectionApplied(undefined, { start: 2, end: 2 })).toBe(false);
  });
});
