/**
 * UZ Aero - test MASKI LICZNIKA MOTOGODZIN (zgłoszenie z urządzenia, 2026-08-14:
 * „czemu nie nakładamy maski? dowolny separator powinien być znakiem dla maski.
 * Można też tam otworzyć klawiaturę numeryczną zamiast pełnej").
 *
 * Sedno: pilot przepisuje liczbę z tarczy i sięga po znak, który ma pod palcem.
 * Klawiatura numeryczna Androida daje przecinek albo kropkę, a dwukropka nie daje wcale -
 * więc licznik w formacie hh:mm wymuszał dotąd pełną QWERTY. Maska przyjmuje wszystkie
 * trzy znaki jako TEN SAM separator i stawia właściwy, więc pole chodzi na numerycznej.
 */

import { maskMotoHoursInput, parseMotoHours } from '../ui/format';

describe('maska licznika motogodzin', () => {
  it('dowolny separator staje się TYM separatorem - licznik hh:mm', () => {
    expect(maskMotoHoursInput('1234.30', 'hhmm')).toBe('1234:30');
    expect(maskMotoHoursInput('1234,30', 'hhmm')).toBe('1234:30');
    expect(maskMotoHoursInput('1234:30', 'hhmm')).toBe('1234:30');
  });

  it('dowolny separator staje się TYM separatorem - godziny dziesiętne', () => {
    // Dwukropka na klawiaturze numerycznej nie ma, ale przecinek jest - i pilot
    // przyzwyczajony do hh:mm sięgnie po ten, który zna.
    expect(maskMotoHoursInput('1234,5', 'decimal')).toBe('1234.5');
    expect(maskMotoHoursInput('1234:5', 'decimal')).toBe('1234.5');
    expect(maskMotoHoursInput('1234.5', 'decimal')).toBe('1234.5');
  });

  it('separator jest DOKŁADNIE JEDEN', () => {
    // Bez tego wychodziło „1234:30:15" - zapis, którego parser i tak nie przyjmie,
    // a pilot dowiadywał się o tym dopiero przy próbie zapisu.
    expect(maskMotoHoursInput('1234:30:15', 'hhmm')).toBe('1234:3015');
    expect(maskMotoHoursInput('12.34.5', 'decimal')).toBe('12.345');
  });

  it('separator wiodący odpada - liczba zaczyna się od części całkowitej', () => {
    expect(maskMotoHoursInput(',5', 'decimal')).toBe('5');
    expect(maskMotoHoursInput(':30', 'hhmm')).toBe('30');
  });

  it('litery i spacje nie wchodzą do pola', () => {
    // Podpowiedzi słownikowe pełnej klawiatury potrafiły wstawić słowo w środek liczby.
    expect(maskMotoHoursInput('12a3 4', 'decimal')).toBe('1234');
  });

  it('wpis urwany zostaje urwany - to normalny stan w połowie pisania', () => {
    expect(maskMotoHoursInput('1234:', 'hhmm')).toBe('1234:');
    expect(maskMotoHoursInput('', 'hhmm')).toBe('');
  });

  it('to, co maska wypuszcza, parser przyjmuje', () => {
    // Para maska ↔ parser: bez tego pole wyglądałoby poprawnie, a zapis odrzucał.
    expect(parseMotoHours(maskMotoHoursInput('1234,30', 'hhmm'))).toBeCloseTo(1234.5, 5);
    expect(parseMotoHours(maskMotoHoursInput('1234:5', 'decimal'))).toBeCloseTo(1234.5, 5);
  });
});
