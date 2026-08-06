/**
 * UZ Aero — testy RODZAJU OPERACJI: co mówi o trasie i jak się nazywa.
 *
 * Dwie rzeczy, które łatwo rozjechać przy dokładaniu kolejnej operacji do katalogu:
 *
 *  1. `isSameFieldOperation` — jedno źródło reguły „ten dzień wraca tam, skąd wystartował".
 *     Pyta o nią formularz preflightu (jedno pole ICAO czy para) i kokpit (czy uzbroić
 *     bramkę lądowania `sameFieldOnly`). Gdyby ktoś odpowiedział na to pytanie drugi raz
 *     w jednym z tych miejsc, rozjazd byłby niewidoczny do pierwszego dziwnego lądowania.
 *  2. `operationLabel` — katalog nazw dla pilota. Test przechodzi po WSZYSTKICH wartościach
 *     z domeny, więc nowa operacja bez etykiety zapali się tutaj, a nie na ekranie.
 */

import { isJumpOperation, isSameFieldOperation, OPERATION_TYPES } from '../domain';
import { operationLabel, operationTag, routeLabel } from '../ui/screens/logic/operations';

describe('rodzaj operacji a trasa dnia', () => {
  it('skoki startują i lądują na tym samym lotnisku', () => {
    expect(isSameFieldOperation('skoki')).toBe(true);
  });

  it('przelot, egzamin, lot techniczny i inne mogą skończyć gdzie indziej', () => {
    for (const operation of OPERATION_TYPES.filter((o) => o !== 'skoki')) {
      expect(isSameFieldOperation(operation)).toBe(false);
    }
  });
});

describe('rodzaj operacji a zrzut skoczków (issue #19)', () => {
  it('skoki wynoszą skoczków — zrzut ma sens tylko tam', () => {
    expect(isJumpOperation('skoki')).toBe(true);
    for (const operation of OPERATION_TYPES.filter((o) => o !== 'skoki')) {
      expect(isJumpOperation(operation)).toBe(false);
    }
  });

  it('to OSOBNE pytanie niż kształt trasy, choć dziś odpowiedź jest ta sama', () => {
    // Gdyby doszła operacja „zloty" (jedno lotnisko, zero skoczków), oba predykaty
    // rozjechałyby się natychmiast — i właśnie dlatego nie są jedną funkcją.
    for (const operation of OPERATION_TYPES) {
      expect(isJumpOperation(operation)).toBe(isSameFieldOperation(operation));
    }
  });
});

describe('nazwy operacji dla pilota', () => {
  it('„ferry" nazywa się po polsku, choć w rejestrze zostaje identyfikatorem', () => {
    // Wartość zdarzenia się NIE zmienia — zmiana napisu na ekranie nie jest powodem
    // do migracji historii klubu (issue #13).
    expect(OPERATION_TYPES).toContain('ferry');
    expect(operationLabel('ferry')).toBe('Przelot');
    expect(operationTag('ferry')).toBe('PRZELOT');
  });

  it('każda operacja z katalogu ma nazwę — nowa nie prześlizgnie się bez niej', () => {
    for (const operation of OPERATION_TYPES) {
      expect(operationLabel(operation).length).toBeGreaterThan(0);
      expect(operationLabel(operation)).not.toBe(operation);
    }
  });
});

/**
 * Napis trasy czytają trzy ekrany (pasek kokpitu, podgląd cudzej sesji, podsumowanie
 * preflightu) — i wszystkie z tego samego rekordu, w którym skoki mają OBA kody równe.
 */
describe('napis trasy', () => {
  it('skoki: jedno lotnisko, choć rekord niesie dwa równe kody', () => {
    expect(routeLabel('skoki', 'EPKK', 'EPKK')).toBe('EPKK');
  });

  it('przelot: strzałka między kodami', () => {
    expect(routeLabel('ferry', 'EPKK', 'EPWA')).toBe('EPKK → EPWA');
  });

  it('niepełna trasa nie zostawia wiszącej strzałki', () => {
    expect(routeLabel('ferry', 'EPKK', null)).toBe('EPKK');
    expect(routeLabel('ferry', null, null)).toBe('');
    expect(routeLabel('skoki', null, null)).toBe('');
  });

  it('dzień bez preflightu (operacja nieznana) czyta się jak para', () => {
    // `projection.operation` bywa `null` — np. sesja odtworzona z samego claimu.
    expect(routeLabel(null, 'EPKK', 'EPWA')).toBe('EPKK → EPWA');
  });
});
