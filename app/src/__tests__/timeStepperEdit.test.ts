/**
 * UZ Aero — test WPISU GODZINY z klawiatury w stepperze (zgłoszenie z urządzenia,
 * 2026-08-14: „powinienem móc kliknąć w czas i przez klawiaturę zmienić wartość").
 *
 * Same maska i parser mają własne testy w `format.test.ts`. Tutaj sprawdzamy to, co
 * dokłada `timeStepperEdit`: związanie godziny z DNIEM poprawianego zdarzenia. Bez tego
 * wpis „08:20" trafiałby na dzisiejszą dobę, a poprawiana sesja bywa sprzed tygodnia.
 */

import { timeStepperEdit } from '../ui/components/input/timeStepperEdit';
import { timeUtc } from '../ui/format';

const DAY = Date.UTC(2026, 7, 6);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

describe('wpis godziny w stepperze', () => {
  it('wpisana godzina ląduje w DNIU poprawianego zdarzenia', () => {
    const edit = timeStepperEdit(at(8, 4), timeUtc);

    expect(edit.parse('08:20')).toBe(at(8, 20));
  });

  it('dzień bierze się z wartości, a nie z „teraz"', () => {
    // Sesja sprzed tygodnia: gdyby parser brał dzisiejszą datę, korekta przenosiłaby
    // zdarzenie o siedem dni, zamiast przesunąć je o kwadrans.
    const tydzienTemu = at(8, 4) - 7 * 24 * 3_600_000;
    const edit = timeStepperEdit(tydzienTemu, timeUtc);

    expect(edit.parse('08:20')).toBe(tydzienTemu + 16 * 60_000);
  });

  it('pole startuje od bieżącej wartości w tym samym zapisie, co wyświetlana', () => {
    // Inaczej tapnięcie w „08:04" otwierałoby pole z czymś innym niż to, co widać.
    const edit = timeStepperEdit(at(8, 4), timeUtc);

    expect(edit.toText(at(8, 4))).toBe(timeUtc(at(8, 4)));
  });

  it('maska stawia dwukropek za pilota — klawiatura numeryczna go nie ma', () => {
    const edit = timeStepperEdit(at(8, 4), timeUtc);

    expect(edit.mask?.('0820')).toBe('08:20');
  });

  it('wpis nieczytelny daje `null` — stepper zostaje przy poprzedniej wartości', () => {
    const edit = timeStepperEdit(at(8, 4), timeUtc);

    expect(edit.parse('08:6')).toBeNull();
    expect(edit.parse('99:99')).toBeNull();
    expect(edit.parse('')).toBeNull();
  });

  it('klawiatura numeryczna i pięć znaków — „HH:MM" z dwukropkiem od maski', () => {
    const edit = timeStepperEdit(at(8, 4), timeUtc);

    expect(edit.keyboardType).toBe('number-pad');
    expect(edit.maxLength).toBe(5);
  });
});
