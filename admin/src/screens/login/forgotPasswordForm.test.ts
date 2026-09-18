import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { canSendLink, forgotOutcome, LINK_SENT } from './forgotPasswordForm';

describe('kiedy wolno wysłać link', () => {
  it('przyjmuje adres, odrzuca to, co adresem nie jest', () => {
    expect(canSendLink('anna.kowal@ninerdeck.pl')).toBe(true);
    expect(canSendLink('  anna@ninerdeck.pl  ')).toBe(true);

    expect(canSendLink('')).toBe(false);
    expect(canSendLink('anna')).toBe(false);
    expect(canSendLink('@ninerdeck.pl')).toBe(false);
    expect(canSendLink('anna@ninerdeck')).toBe(false);
    expect(canSendLink('anna@.pl')).toBe(false);
    expect(canSendLink('anna kowal@ninerdeck.pl')).toBe(false);
  });

  it('nie próbuje rozstrzygać, CZY takie konto istnieje', () => {
    // Pole sprawdza kształt i nic ponadto: o istnieniu konta nie wolno powiedzieć
    // ani tutaj, ani w odpowiedzi - inaczej formularz wyliczałby konta.
    expect(canSendLink('nikogo-takiego@ninerdeck.pl')).toBe(true);
  });
});

describe('co ekran mówi po wysłaniu', () => {
  it('to samo zdanie po sukcesie i po odmowie serwera', () => {
    // 429 przy wyczerpanym limicie wysyłek: gdyby ekran powiedział o nim cokolwiek
    // innego, byłaby to jedyna różnica między adresem znanym a obcym.
    const limited = new HttpError(429, { error: 'too_many_attempts' } as never);
    expect(forgotOutcome(null)).toEqual(LINK_SENT);
    expect(forgotOutcome(limited)).toEqual(LINK_SENT);
    expect(LINK_SENT.text).toContain('Jeśli ten adres jest w systemie');
    expect(LINK_SENT.text).toContain('ważny godzinę');
  });

  it('awaria SIECI jest jedynym stanem, w którym to zdanie byłoby nieprawdą', () => {
    const offline = forgotOutcome(new TypeError('Failed to fetch'));
    expect(offline.tone).toBe('danger');
    expect(offline.text).toContain('Nie ma połączenia');
  });
});
