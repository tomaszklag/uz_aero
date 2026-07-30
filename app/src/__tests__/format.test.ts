/**
 * UZ Aero — test FORMATOWANIA I PARSOWANIA odczytów.
 *
 * `parseMotoHours` jest jedynym miejscem, w którym napis wpisany przez pilota staje się
 * liczbą trafiającą do rejestru zdarzeń — a odczyt MH porządkuje sesje samolotu (§4.5).
 * Pomyłka o 30 minut nie wygląda tu na błąd: po prostu zapisuje się zła wartość.
 * Dlatego parser i formater sprawdzamy razem, w obie strony.
 *
 * Testujemy też, że wpis nieczytelny daje `null`, a nie „prawie liczbę" — wołający ma
 * wtedy zablokować zapis (§6 pkt 3: nigdy cichy błąd).
 */

import {
  duration,
  litres,
  maskTimeUtcInput,
  motoHours,
  parseLitres,
  parseMotoHours,
  parseTimeUtcOnDay,
  timeUtc,
} from '../ui/format';

describe('motogodziny', () => {
  it('formatuje wg konfiguracji samolotu (§5.4)', () => {
    expect(motoHours(1234.5, 'hhmm')).toBe('1234:30');
    expect(motoHours(1234.5, 'decimal')).toBe('1234.5');
    expect(motoHours(null, 'hhmm')).toBe('—');
  });

  it('nie produkuje „:60" przy zaokrągleniu minut w górę', () => {
    // 0,999 h = 59,94 min → naiwne zaokrąglenie dałoby „1234:60".
    expect(motoHours(1234.999, 'hhmm')).toBe('1235:00');
  });

  it('przyjmuje oba zapisy niezależnie od skonfigurowanego formatu', () => {
    // Pilot przepisuje to, co widzi na liczniku, a nie to, co ustawił administrator.
    expect(parseMotoHours('1234:30')).toBeCloseTo(1234.5, 6);
    expect(parseMotoHours('1234.5')).toBeCloseTo(1234.5, 6);
    expect(parseMotoHours('1234,5')).toBeCloseTo(1234.5, 6); // przecinek z klawiatury PL
    expect(parseMotoHours(' 1234:30 ')).toBeCloseTo(1234.5, 6);
    expect(parseMotoHours('1 234:30')).toBeCloseTo(1234.5, 6); // spacja jak w mockupie
  });

  it('odrzuca wpis nieczytelny zamiast zgadywać', () => {
    for (const bad of ['', '  ', 'abc', '12:75', '12:3:4', '-5', '1234:', ':30', '12.5.5']) {
      expect(parseMotoHours(bad)).toBeNull();
    }
  });

  it('zachowuje wartość w obie strony (format → parse)', () => {
    for (const value of [0, 1.5, 99.25, 1233, 1234.5, 1241.15]) {
      const viaHhmm = parseMotoHours(motoHours(value, 'hhmm'));
      expect(viaHhmm).not.toBeNull();
      // hh:mm ma rozdzielczość minuty — zgodność do 1/60 h wystarcza.
      expect(Math.abs(viaHhmm! - value)).toBeLessThanOrEqual(1 / 120 + 1e-9);

      expect(parseMotoHours(motoHours(value, 'decimal'))).toBeCloseTo(value, 1);
    }
  });
});

describe('paliwo', () => {
  it('formatuje bez miejsc po przecinku', () => {
    expect(litres(88)).toBe('88 L');
    expect(litres(87.6)).toBe('88 L');
    expect(litres(null)).toBe('—');
  });

  it('parsuje litry i odrzuca śmieci', () => {
    expect(parseLitres('150')).toBe(150);
    expect(parseLitres('87,5')).toBeCloseTo(87.5, 6);
    expect(parseLitres('1 50')).toBe(150);
    for (const bad of ['', 'sto', '-10', '15:30', '1.2.3']) {
      expect(parseLitres(bad)).toBeNull();
    }
  });
});

describe('czas', () => {
  it('pokazuje godziny w UTC, nie w strefie urządzenia', () => {
    // 2026-06-22 08:00 UTC — niezależnie od tego, gdzie stoi telefon (`CLAUDE.md`).
    expect(timeUtc(Date.UTC(2026, 5, 22, 8, 0))).toBe('08:00');
    expect(timeUtc(null)).toBe('—');
  });

  it('maska stawia dwukropek za pilota — wpisuje same cyfry', () => {
    // Klawiatura numeryczna nie ma dwukropka; „0800" musi znaczyć 08:00.
    expect(maskTimeUtcInput('0')).toBe('0');
    expect(maskTimeUtcInput('08')).toBe('08');
    expect(maskTimeUtcInput('080')).toBe('08:0');
    expect(maskTimeUtcInput('0800')).toBe('08:00');

    // Wpis już z dwukropkiem (wartość startowa arkusza) przechodzi bez zmian.
    expect(maskTimeUtcInput('08:00')).toBe('08:00');
    // Backspace w „08:00" daje „08:0", a nie skok o dwa znaki.
    expect(maskTimeUtcInput('08:0')).toBe('08:0');
    // Piąta cyfra nie ma gdzie trafić — ucinamy zamiast puszczać „08:0012".
    expect(maskTimeUtcInput('080012')).toBe('08:00');
    expect(maskTimeUtcInput('')).toBe('');
  });

  it('wpisaną godzinę osadza w dniu lotnym, nie w dniu „dziś"', () => {
    // Arkusze meldunku (02) i zakończenia duty (09) dostają tylko „HH:MM" — data musi
    // przyjść z wartości poprawianej, inaczej korekta przeskakiwałaby dzień lotny.
    const day = Date.UTC(2026, 5, 22, 9, 41, 30);
    expect(parseTimeUtcOnDay('08:00', day)).toBe(Date.UTC(2026, 5, 22, 8, 0));
    expect(parseTimeUtcOnDay('8:05', day)).toBe(Date.UTC(2026, 5, 22, 8, 5));
    expect(parseTimeUtcOnDay(' 16:45 ', day)).toBe(Date.UTC(2026, 5, 22, 16, 45));

    // Sekundy z „teraz" nie przeżywają korekty — pilot wpisuje pełną minutę.
    expect(parseTimeUtcOnDay('09:41', day)).toBe(Date.UTC(2026, 5, 22, 9, 41));
  });

  it('odrzuca godzinę nieczytelną albo nieistniejącą', () => {
    const day = Date.UTC(2026, 5, 22, 9, 41);
    for (const bad of ['', '  ', '24:00', '08:60', '0800', '8', '08:0', 'ósma', '08:00:00']) {
      expect(parseTimeUtcOnDay(bad, day)).toBeNull();
    }
  });

  it('formatuje czas trwania jako H:MM', () => {
    expect(duration(90 * 60_000)).toBe('1:30');
    expect(duration(6 * 3_600_000 + 39 * 60_000)).toBe('6:39'); // block time dnia kanonicznego
    expect(duration(-1)).toBe('0:00');
  });
});
