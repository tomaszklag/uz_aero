/**
 * Ninerdeck - polityka hasła (2.1.0, D4): JEDNA funkcja dla serwera, telefonu, panelu
 * i strony `/haslo/`. Test stoi po stronie aplikacji, bo tu żyją testy `@ninerdeck/domain`;
 * serwer sprawdza tę samą funkcję przez `400 weak_password` w `passwordReset.test.ts`.
 */

import {
  checkPassword,
  isAcceptablePassword,
  PASSWORD_BLOCKLIST,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@ninerdeck/domain';

describe('polityka hasła (NIST SP 800-63B)', () => {
  it('długość jest jedyną miarą siły: 12 znaków wystarcza bez cyfr i znaków specjalnych', () => {
    expect(checkPassword('zielonesmigloleci')).toBeNull();
    expect(checkPassword('correct horse battery staple')).toBeNull();
    expect(isAcceptablePassword('dwanascieznak')).toBe(true);
  });

  it('za krótkie hasło odpada na długości, także z kompletem „złożoności"', () => {
    expect(checkPassword('Ab1!Ab1!Ab1')).toBe('too_short');
    expect(checkPassword('')).toBe('too_short');
  });

  it('długość liczy się w punktach kodowych, nie w jednostkach UTF-16', () => {
    // Sześć emoji poza BMP = 6 znaków dla człowieka, 12 jednostek UTF-16 - za krótkie.
    expect(checkPassword('🛩️🛩️🛩️🛩️🛩️🛩️'.replace(/️/g, ''))).toBe('too_short');
    expect('🛩🛩🛩🛩🛩🛩'.length).toBe(12);
    expect([...'🛩🛩🛩🛩🛩🛩'].length).toBe(6);
  });

  it('sufit 128 znaków chroni serwer, nie użytkownika', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MAX_LENGTH))).toBeNull();
    expect(checkPassword('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe('too_long');
  });

  it('lista zablokowanych działa po normalizacji: wielkość liter, ogonki i odstępy nie ratują', () => {
    expect(checkPassword('haslo1234567')).toBe('blocklisted');
    expect(checkPassword('HASŁO 1234567')).toBe('blocklisted');
    expect(checkPassword('Ninerdeck 1234')).toBe('blocklisted');
    // Każdy wpis listy spełnia minimum długości - inaczej byłby martwy (odpadałby wcześniej).
    const tooShort = PASSWORD_BLOCKLIST.filter((entry) => [...entry].length < PASSWORD_MIN_LENGTH);
    expect(tooShort).toEqual([]);
  });

  it('fragment adresu e-mail blokuje: cały adres, część lokalna i jej kawałki', () => {
    const context = { email: 'Jan.Kowalski@example.com' };
    expect(checkPassword('jan.kowalski@example.com', context)).toBe('contains_email');
    expect(checkPassword('mojeKOWALSKIhaslo', context)).toBe('contains_email');
    expect(checkPassword('xxjan.kowalskixx', context)).toBe('contains_email');
    // Domena nie jest tożsamością tej osoby.
    expect(checkPassword('example.com.jest.ok', context)).toBeNull();
  });

  it('fragment imienia i nazwiska blokuje, bez ogonków i wielkości liter', () => {
    const context = { name: 'Tomasz Małkiewicz' };
    expect(checkPassword('malkiewicz2026', context)).toBe('contains_name');
    expect(checkPassword('TOMASZ-lata-wysoko', context)).toBe('contains_name');
    expect(checkPassword('tomaszmalkiewicz', context)).toBe('contains_name');
    expect(checkPassword('szybowiec nad polem', context)).toBeNull();
  });

  it('krótkie kawałki tożsamości (<4 znaki) nie blokują - inaczej „jan" odrzucałby połowę słów', () => {
    expect(checkPassword('janowe-latanie-2026', { name: 'Jan Se', email: 'js@x.pl' })).toBeNull();
  });

  it('kolejność powodów: długość → lista → adres → nazwisko', () => {
    expect(checkPassword('kowalski', { email: 'kowalski@x.pl' })).toBe('too_short');
    expect(checkPassword('haslo1234567', { email: 'haslo1234567@x.pl' })).toBe('blocklisted');
    expect(checkPassword('kowalski-kowalski', { email: 'kowalski@x.pl', name: 'Jan Kowalski' })).toBe(
      'contains_email',
    );
  });

  it('kontekst jest opcjonalny - strona `/haslo/` nie zna nazwiska', () => {
    expect(checkPassword('dobre dlugie haslo', {})).toBeNull();
    expect(checkPassword('dobre dlugie haslo', { email: null, name: null })).toBeNull();
  });
});
