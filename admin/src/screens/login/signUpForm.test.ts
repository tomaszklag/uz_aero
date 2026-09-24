import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { canSignUp, normalizeName, SIGNUP_SENT, signUpOutcome } from './signUpForm';

// Numer zgłoszenia (180) zostaje w komentarzu: strażnik hexów panelu czyta `#180`
// w napisie testu jak kolor.
describe('kiedy wolno wysłać link rejestracyjny (rejestracja z panelu)', () => {
  it('wymaga imienia i nazwiska od dwóch znaków ORAZ adresu o kształcie adresu', () => {
    expect(canSignUp('Anna Kowal', 'anna.kowal@ninerdeck.pl')).toBe(true);
    // „Jan" jest kompletnym imieniem - liczby członów nie sprawdzamy.
    expect(canSignUp('Jan', 'jan@ninerdeck.pl')).toBe(true);

    expect(canSignUp('', 'anna@ninerdeck.pl')).toBe(false);
    // Lustro serwera: `signupBody` odrzuca imię krótsze niż 2 znaki (400).
    expect(canSignUp('X', 'anna@ninerdeck.pl')).toBe(false);
    expect(canSignUp('   ', 'anna@ninerdeck.pl')).toBe(false);
    expect(canSignUp('Anna Kowal', '')).toBe(false);
    expect(canSignUp('Anna Kowal', 'anna@ninerdeck')).toBe(false);
  });

  it('nie próbuje rozstrzygać, CZY ten adres jest wolny', () => {
    // To pytanie rozstrzyga serwer i nie mówi o tym nikomu - formularz nie ma czym.
    expect(canSignUp('Ktoś Nowy', 'zajety@ninerdeck.pl')).toBe(true);
  });

  it('imię i nazwisko wysyła bez zewnętrznych i podwójnych spacji', () => {
    expect(normalizeName('  Anna   Kowal ')).toBe('Anna Kowal');
  });
});

describe('co ekran mówi po wysłaniu', () => {
  it('to samo zdanie w trybie warunkowym po sukcesie i po odmowie limitu', () => {
    // Serwer odpowiada 202 także przy wyczerpanym limicie; gdyby ekran powiedział wtedy
    // cokolwiek innego, sam wyliczałby konta.
    const limited = new HttpError(429, { error: 'too_many_attempts' } as never);
    expect(signUpOutcome(null)).toEqual(SIGNUP_SENT);
    expect(signUpOutcome(limited)).toEqual(SIGNUP_SENT);
    expect(SIGNUP_SENT.text).toContain('Jeśli ten adres jest wolny');
    expect(SIGNUP_SENT.text).toContain('już istnieje');
    expect(SIGNUP_SENT.text).toContain('ważny godzinę');
  });

  it('awaria SIECI i odmowa KSZTAŁTU danych są jedynymi stanami, w których to zdanie byłoby nieprawdą', () => {
    const offline = signUpOutcome(new TypeError('Failed to fetch'));
    expect(offline.tone).toBe('danger');
    expect(offline.text).toContain('Nie ma połączenia');

    // 400 mówi o polach, nie o koncie - „link już idzie" byłoby wtedy kłamstwem.
    const rejected = signUpOutcome(new HttpError(400, { error: 'bad_request' } as never));
    expect(rejected.tone).toBe('danger');
    expect(rejected.text).toContain('imię i nazwisko');
  });
});
