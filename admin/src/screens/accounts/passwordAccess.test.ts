import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import {
  linkBlocker,
  linkFailureText,
  linkSentText,
  linkValidity,
  methodLabels,
} from './passwordAccess';

const NOW = Date.UTC(2026, 8, 15, 10, 0);
const inMinutes = (n: number): string => new Date(NOW + n * 60_000).toISOString();

describe('plakietki metod', () => {
  it('nazywa metody w kolejności z mockupu', () => {
    expect(methodLabels(['google', 'password'])).toEqual(['Google', 'hasło']);
  });

  it('konto, do którego nikt jeszcze nie wszedł, nie ma ani jednej', () => {
    // Stan prawdziwy, nie brak danych: ekran ma wtedy nie rysować rzędu plakietek.
    expect(methodLabels([])).toEqual([]);
  });
});

describe('kiedy wolno wysłać link', () => {
  it('bez adresu nie ma dokąd wysłać - i przycisk mówi to wprost', () => {
    expect(linkBlocker(null)).toBe('ta osoba nie ma adresu e-mail');
    expect(linkBlocker('   ')).toBe('ta osoba nie ma adresu e-mail');
    expect(linkBlocker('barbara@ninerdeck.pl')).toBeNull();
  });
});

describe('ważność linku', () => {
  it('liczy się z TERMINU serwera, nie ze stałej w panelu', () => {
    // Reset ma godzinę, zaproszenie pierwszego administratora 72 h - o tym rozstrzyga
    // serwer, więc panel czyta termin zamiast wpisywać liczbę.
    expect(linkValidity(inMinutes(60), NOW)).toBe('godzinę');
    expect(linkValidity(inMinutes(58), NOW)).toBe('godzinę');
    expect(linkValidity(inMinutes(72 * 60), NOW)).toBe('72 h');
    expect(linkValidity(inMinutes(3 * 60), NOW)).toBe('3 h');
  });

  it('termin, który już minął, nie robi się ujemny', () => {
    expect(linkValidity(inMinutes(-30), NOW)).toBe('godzinę');
  });
});

describe('potwierdzenie wysyłki', () => {
  it('mówi DOKĄD i JAK DŁUGO - nigdy linku', () => {
    const text = linkSentText({ sentTo: 'barbara@ninerdeck.pl', expiresAt: inMinutes(60) }, NOW);
    expect(text).toBe('wysłano na barbara@ninerdeck.pl · ważny godzinę');
    expect(text).not.toContain('haslo');
  });
});

describe('nieudana wysyłka', () => {
  const http = (status: number, error: string): HttpError =>
    new HttpError(status, { error } as never);

  it('każda odmowa ma własną drogę wyjścia, więc własne zdanie', () => {
    expect(linkFailureText(http(409, 'email_required'))).toContain('nie ma adresu e-mail');
    expect(linkFailureText(http(429, 'too_many_attempts'))).toContain('Za dużo wysyłek');
    // 502 znaczy „token powstał, list nie doszedł" - cisza kazałaby czekać na list,
    // który nigdzie nie poszedł.
    expect(linkFailureText(http(502, 'mail_failed'))).toContain('Spróbuj jeszcze raz');
  });

  it('awaria sieci to inne zdanie niż odmowa serwera; nieznana odmowa niesie kod', () => {
    expect(linkFailureText(new TypeError('Failed to fetch'))).toContain('Nie ma połączenia');
    expect(linkFailureText(http(500, 'boom'))).toContain('500');
  });
});
