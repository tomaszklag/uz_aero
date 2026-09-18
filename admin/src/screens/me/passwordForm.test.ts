import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { EMPTY_PASSWORD, passwordFailure, verdictOf } from './passwordForm';

const ME = { email: 'tomasz.malkiewicz@ninerdeck.pl', name: 'Tomasz Małkiewicz' };
const GOOD = 'wspolny-tablet-EPZG';

const draft = (over: Partial<typeof EMPTY_PASSWORD> = {}) => ({ ...EMPTY_PASSWORD, ...over });

describe('kiedy wolno zapisać', () => {
  it('pusty formularz blokuje BEZ ZDANIA - powód widać z pól', () => {
    const verdict = verdictOf(EMPTY_PASSWORD, ME, false);
    expect(verdict.canSave).toBe(false);
    expect(verdict.nextError).toBeNull();
    expect(verdict.repeatError).toBeNull();
  });

  it('osoba BEZ hasła nie podaje obecnego', () => {
    const verdict = verdictOf(draft({ next: GOOD, repeat: GOOD }), ME, false);
    expect(verdict.canSave).toBe(true);
  });

  it('osoba Z hasłem musi je podać - inaczej serwer i tak odmówi', () => {
    expect(verdictOf(draft({ next: GOOD, repeat: GOOD }), ME, true).canSave).toBe(false);
    expect(
      verdictOf(draft({ current: 'stare-haslo-2026', next: GOOD, repeat: GOOD }), ME, true).canSave,
    ).toBe(true);
  });
});

describe('co mówi pod polem', () => {
  it('politykę liczy DOMENA, a zdanie nazywa powód, nie wymagania', () => {
    expect(verdictOf(draft({ next: 'krotkie' }), ME, false).nextError).toContain('Za krótkie');

    // Hasło z własną tożsamością jest pierwszym, które ktoś spróbuje przy tablecie.
    // KOLEJNOŚĆ POWODÓW NALEŻY DO DOMENY: adres bada się przed nazwiskiem, więc dla
    // konta `tomasz.malkiewicz@…` nazwisko w haśle wraca jako „zawiera Twój adres" -
    // i to jest prawda o tym haśle, a nie pomyłka. Panel nie ustawia tej kolejności
    // po swojemu, bo wtedy miałby własną politykę.
    expect(verdictOf(draft({ next: 'malkiewicz2026' }), ME, false).nextError).toContain(
      'zawiera Twój adres',
    );
    expect(
      verdictOf(draft({ next: 'malkiewicz2026' }), { email: 'tm@ninerdeck.pl', name: ME.name }, false)
        .nextError,
    ).toContain('zawiera Twoje nazwisko');
  });

  it('powtórka odzywa się dopiero, gdy coś w niej jest', () => {
    // Zarzut postawiony w chwili, gdy ktoś skończył pisać pierwsze pole, jest za wczesny.
    expect(verdictOf(draft({ next: GOOD }), ME, false).repeatError).toBeNull();
    expect(verdictOf(draft({ next: GOOD, repeat: 'co-innego-2026' }), ME, false).repeatError).toBe(
      'Hasła nie są takie same.',
    );
  });
});

describe('odmowa serwera', () => {
  const http = (status: number, error: string, extra: Record<string, unknown> = {}): HttpError =>
    new HttpError(status, { error, ...extra } as never);

  it('`weak_password` wraca POD POLE tym samym zdaniem, co polityka w przeglądarce', () => {
    // Jedna implementacja reguły po obu stronach znaczy jedno zdanie: gdyby panel miał
    // własną kopię polityki, te dwa napisy rozjechałyby się przy pierwszej poprawce.
    const fromServer = passwordFailure(http(400, 'weak_password', { reason: 'contains_email' }));
    const fromBrowser = verdictOf(draft({ next: 'malkiewicz2026' }), ME, false);
    expect(fromServer.field).toBe(fromBrowser.nextError);
    expect(fromServer.banner).toBeNull();
  });

  it('nieznany powód polityki nie zostaje bez zdania', () => {
    // Serwer może dopisać powód, którego to wydanie panelu nie zna - cisza pod polem
    // byłaby gorsza niż zdanie ogólne.
    expect(passwordFailure(http(400, 'weak_password', { reason: 'czego-nie-znamy' })).field).toBe(
      'Wybierz inne hasło.',
    );
  });

  it('złe obecne hasło i limit prób mówią o sobie w banerze', () => {
    expect(passwordFailure(http(401, 'invalid_credentials')).banner).toContain('obecne hasło');
    expect(passwordFailure(http(429, 'too_many_attempts')).banner).toContain('Za dużo prób');
    expect(passwordFailure(new TypeError('Failed to fetch')).banner).toContain('Nie ma połączenia');
    expect(passwordFailure(http(500, 'boom')).banner).toContain('500');
  });
});
