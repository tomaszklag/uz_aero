/**
 * Ninerdeck - nieudane logowanie → zdanie (`ui/screens/logic/loginMessage.ts`).
 */

import { PASSWORD_MIN_LENGTH } from '@ninerdeck/domain';

import { ServerRejectedError, ServerUnreachableError } from '../application/ports';
import { GoogleSignInError } from '../ui/screens/logic/googleSignInError';
import {
  loginMessage,
  passwordLoginNotice,
  setPasswordNotice,
  waitReason,
  weaknessText,
} from '../ui/screens/logic/loginMessage';

describe('loginMessage', () => {
  it('pilot sam zamknął okno Google: BEZ banera - to nie jest błąd', () => {
    expect(loginMessage(new GoogleSignInError('cancelled'))).toBeNull();
  });

  it('okno wróciło bez tokenu: spróbuj jeszcze raz', () => {
    expect(loginMessage(new GoogleSignInError('failed'))).toContain('Spróbuj jeszcze raz');
  });

  it('brak identyfikatora klienta w buildzie: to błąd konfiguracji, nie pilota', () => {
    expect(loginMessage(new GoogleSignInError('unavailable'))).toContain('administratorowi');
  });

  it('brak sieci: instrukcja „zaloguj się przed wylotem w teren"', () => {
    expect(loginMessage(new ServerUnreachableError())).toContain('przed wylotem w teren');
  });

  it('konto wyłączone mówi to WPROST', () => {
    expect(loginMessage(new ServerRejectedError(401, 'account_disabled'))).toContain('wyłączone');
  });

  it('token nie do sprawdzenia: „nie udało się potwierdzić konta Google"', () => {
    expect(loginMessage(new ServerRejectedError(401, 'invalid_token'))).toContain(
      'potwierdzić konta Google',
    );
  });

  it('inna odmowa niesie kod - jedyna rzecz do przekazania dalej', () => {
    expect(loginMessage(new ServerRejectedError(500, 'boom'))).toContain('boom');
  });

  it('cokolwiek innego: zdanie ogólne, nigdy cisza', () => {
    expect(loginMessage(new Error('x'))).toContain('spróbuj ponownie');
  });
});

describe('passwordLoginNotice (00F)', () => {
  it('trzy stany serwera dostają JEDNO zdanie - ekran nie ma prawa wyliczać kont', () => {
    // Serwer odpowiada tak samo na login nieznany, osobę bez hasła i złe hasło.
    // Gdyby ekran je rozróżnił, sam byłby tą różnicą.
    // Zdanie nazywa WSZYSTKIE TRZY możliwości, bo ekran nie wie, która zaszła (makieta 00F).
    const notice = passwordLoginNotice({ kind: 'invalid_credentials' });
    expect(notice.fieldError).toBe('Nieprawidłowy e-mail, kod albo hasło.');
    expect(notice.blockReason).toBeNull();
  });

  it('konto wyłączone mówi to WPROST - tożsamość jest już dowiedziona', () => {
    const notice = passwordLoginNotice({ kind: 'account_disabled' });
    expect(notice.fieldError).toBe('To konto jest wyłączone.');
    expect(notice.fieldError).not.toContain('spróbuj');
  });

  it('limit tempa stoi W PRZYCISKU i podaje CZAS (issue #55)', () => {
    expect(passwordLoginNotice({ kind: 'rate_limited', retryAfterSec: 180 })).toEqual({
      fieldError: null,
      blockReason: 'Za dużo prób - spróbuj za 3 min',
    });
  });

  it('brak sieci blokuje przycisk, a nie ocenia wpisu', () => {
    expect(passwordLoginNotice({ kind: 'unreachable' })).toEqual({
      fieldError: null,
      blockReason: 'Wymaga internetu',
    });
  });

  it('udane logowanie nie ma nic do powiedzenia', () => {
    expect(passwordLoginNotice({ kind: 'no_club', clubs: { status: 'none', person: { name: 'Jan', email: null }, memberships: [] } })).toEqual({
      fieldError: null,
      blockReason: null,
    });
  });
});

describe('waitReason', () => {
  it('poniżej minuty mówi w sekundach, wyżej w minutach - i ZAWSZE podaje liczbę', () => {
    expect(waitReason(45)).toBe('Za dużo prób - spróbuj za 45 s');
    expect(waitReason(61)).toBe('Za dużo prób - spróbuj za 2 min');
  });
});

describe('weaknessText', () => {
  it('mówi, CO JEST NIE TAK z wpisaną wartością, a nie jakie są wymagania', () => {
    expect(weaknessText('too_short')).toContain(String(PASSWORD_MIN_LENGTH));
    expect(weaknessText('contains_email')).toContain('adres');
    expect(weaknessText('contains_name')).toContain('nazwisko');
  });
});

describe('setPasswordNotice (13B)', () => {
  it('złe OBECNE hasło staje pod swoim polem, nie pod nowym', () => {
    expect(setPasswordNotice({ kind: 'invalid_credentials' })).toEqual({
      fieldError: null,
      currentError: 'Nieprawidłowe obecne hasło.',
      blockReason: null,
    });
  });

  it('odmowa polityki wraca TYM SAMYM zdaniem, które ekran pokazał przy wpisie', () => {
    // Dwie wersje tego samego zarzutu byłyby dowodem, że gdzieś leży kopia reguły.
    expect(setPasswordNotice({ kind: 'weak_password', reason: 'blocklisted' }).fieldError).toBe(
      weaknessText('blocklisted'),
    );
  });

  it('konto bez adresu nie ma jak mieć hasła - powód w przycisku, z drogą wyjścia', () => {
    const notice = setPasswordNotice({ kind: 'email_required' });
    expect(notice.blockReason).toContain('administratora');
    expect(notice.fieldError).toBeNull();
  });

  it('limit i brak sieci blokują przycisk', () => {
    expect(setPasswordNotice({ kind: 'rate_limited', retryAfterSec: 30 }).blockReason).toBe(
      'Za dużo prób - spróbuj za 30 s',
    );
    expect(setPasswordNotice({ kind: 'unreachable' }).blockReason).toBe('Wymaga internetu');
  });

  it('udany zapis milczy', () => {
    expect(setPasswordNotice({ kind: 'ok' })).toEqual({
      fieldError: null,
      currentError: null,
      blockReason: null,
    });
  });
});
