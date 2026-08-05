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
  dateTimeUtc,
  duration,
  litres,
  maskTimeUtcInput,
  motoHours,
  parseDateTimeUtc,
  parseLitres,
  parseMotoHours,
  parseTimeUtcOnDay,
  relativeAge,
  thousands,
  timeUtc,
} from '../ui/format';

describe('tysiące', () => {
  it('grupuje cyfry spacją jak mockup 05 („3 500 FT")', () => {
    expect(thousands(3500)).toBe('3 500');
    expect(thousands(142)).toBe('142');
    expect(thousands(12500)).toBe('12 500');
  });

  it('zaokrągla i nie gubi znaku przy wysokości pod poziomem morza', () => {
    expect(thousands(3499.6)).toBe('3 500');
    expect(thousands(-12.4)).toBe('−12');
    expect(thousands(-1234)).toBe('−1 234');
  });
});

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

/**
 * Pole nowego czasu z ekranu korekty administratora (`design/admin/A02b-korekta.html`).
 * Tu wartość jedzie do REJESTRU KLUBU, więc każdy cichy błąd parsowania kończy się
 * złą liczbą w arkuszu — i nikt tego nie zauważy, bo napis wygląda poprawnie.
 */
describe('data z godziną w UTC (korekta administratora)', () => {
  it('wypisuje dokładnie zapis z mockupu A02b', () => {
    expect(dateTimeUtc(Date.UTC(2026, 6, 30, 13, 1, 33))).toBe('2026-07-30 13:01:33');
    // Jednocyfrowe miesiące i dni dostają wiodące zero — inaczej pole raz ma
    // 19 znaków, raz 17, i kolumna mono skacze.
    expect(dateTimeUtc(Date.UTC(2026, 0, 3, 4, 5, 6))).toBe('2026-01-03 04:05:06');
  });

  it('parsuje JAWNIE w UTC — to jest cały powód istnienia tej funkcji', () => {
    // `new Date('2026-07-30 13:01:33')` przeglądarka rozumie jako czas LOKALNY;
    // w Warszawie latem dałoby to przesunięcie o 2 h bez żadnego sygnału.
    expect(parseDateTimeUtc('2026-07-30 13:01:33')).toBe(Date.UTC(2026, 6, 30, 13, 1, 33));
    expect(parseDateTimeUtc(' 2026-07-30T13:01:33 ')).toBe(Date.UTC(2026, 6, 30, 13, 1, 33));
    // Sekundy opcjonalne: godzina przepisana z książki samolotu ich nie ma.
    expect(parseDateTimeUtc('2026-07-30 13:01')).toBe(Date.UTC(2026, 6, 30, 13, 1, 0));
  });

  it('jest odwrotnością `dateTimeUtc` w obie strony', () => {
    const at = Date.UTC(2026, 6, 30, 13, 1, 33);
    expect(parseDateTimeUtc(dateTimeUtc(at))).toBe(at);
  });

  it('odrzuca wpis nieczytelny zamiast zgadywać', () => {
    for (const bad of [
      '',
      '   ',
      '13:01:33',
      '2026-07-30',
      '30-07-2026 13:01',
      '2026-07-30 24:00:00',
      '2026-07-30 13:60',
      '2026-07-30 13:01:60',
      'wczoraj po południu',
    ]) {
      expect(parseDateTimeUtc(bad)).toBeNull();
    }
  });

  it('odrzuca datę NIEISTNIEJĄCĄ, zamiast przewinąć kalendarz', () => {
    // `Date.UTC(2026, 1, 30)` daje 2 marca i przeszłoby bez kontroli — a korekta,
    // która po cichu przesuwa dzień lotny, jest gorsza niż odrzucony formularz.
    expect(parseDateTimeUtc('2026-02-30 10:00:00')).toBeNull();
    expect(parseDateTimeUtc('2026-04-31 10:00:00')).toBeNull();
    expect(parseDateTimeUtc('2026-13-01 10:00:00')).toBeNull();
    // Rok przestępny zostaje poprawny — to nie jest test na „odrzucaj wszystko".
    expect(parseDateTimeUtc('2028-02-29 10:00:00')).toBe(Date.UTC(2028, 1, 29, 10, 0, 0));
  });
});

describe('wiek względny (skrzynka flag panelu)', () => {
  const h = 3_600_000;
  const min = 60_000;

  it('daje dokładnie te napisy, co mockupy `design/admin/A03*.html`', () => {
    expect(relativeAge(3 * 24 * h + 3 * h)).toBe('3 dni 3 h');
    expect(relativeAge(24 * h + 8 * h)).toBe('1 dzień 8 h');
    expect(relativeAge(6 * h + 41 * min)).toBe('6 h 41 min');
    expect(relativeAge(26 * min)).toBe('26 min');
  });

  it('zjada człon zerowy — „2 dni", nie „2 dni 0 h"', () => {
    expect(relativeAge(2 * 24 * h)).toBe('2 dni');
    expect(relativeAge(20 * h)).toBe('20 h');
  });

  it('odmienia „dzień" po polsku', () => {
    expect(relativeAge(24 * h)).toBe('1 dzień');
    expect(relativeAge(5 * 24 * h)).toBe('5 dni');
    expect(relativeAge(22 * 24 * h)).toBe('22 dni');
  });

  it('nigdy nie schodzi poniżej zera — zegary bywają przestawione', () => {
    // Flaga „utworzona za 5 minut" to rozjazd zegarów, a nie ujemny wiek. Panel
    // ma wtedy pokazać najmniejszą prawdziwą wartość, nie minus.
    expect(relativeAge(-5 * min)).toBe('0 min');
    expect(relativeAge(30_000)).toBe('0 min');
  });
});
