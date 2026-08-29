/**
 * UZ Aero - panel: komunikaty ekranu logowania (moduł czysty).
 *
 * Testujemy REGUŁĘ, nie brzmienie: że 401 nie zdradza istnienia konta, że 403 z braku
 * roli mówi coś ZUPEŁNIE innego, i że nieznana odpowiedź nie zamienia się w milczenie.
 */

import { describe, expect, it } from 'vitest';

import { loginMessage } from './loginMessages';

describe('loginMessage', () => {
  it('401 → jeden komunikat, bez podpowiedzi, które loginy istnieją', () => {
    const message = loginMessage(401, 'invalid_credentials');

    expect(message.tone).toBe('danger');
    expect(message.markPassword).toBe(true);
    // Sedno reguły: komunikat nie może rozróżniać hasła od konta.
    expect(`${message.title} ${message.detail}`).not.toMatch(/nie istnieje|nie ma takiego konta/i);
  });

  it('konto wyłączone dostaje TEN SAM komunikat co złe hasło', () => {
    // Serwer odpowiada 401 również przy `account_disabled` - panel nie ma prawa
    // rozdzielić tych przypadków, bo rozdzielenie ich jest wyliczarką kont.
    expect(loginMessage(401, 'account_disabled')).toEqual(loginMessage(401, 'invalid_credentials'));
  });

  it('403 `no_panel_access` → wyjaśnienie, nie „złe hasło"', () => {
    const message = loginMessage(403, 'no_panel_access');

    expect(message.tone).toBe('warn');
    // Hasło było poprawne, więc pole hasła NIE jest oznaczane jako błędne -
    // inaczej wysłalibyśmy człowieka po nowe hasło zamiast po nową rolę.
    expect(message.markPassword).toBe(false);
    expect(message.detail).toMatch(/administrator/i);
    expect(message.detail).toMatch(/telefon/i);
  });

  it('brak odpowiedzi (sieć) mówi o sieci, a nie o poświadczeniach', () => {
    const message = loginMessage(null, null);

    expect(message.markPassword).toBe(false);
    expect(message.title).toMatch(/połączenia/i);
  });

  it('nieznany status daje KONKRETNĄ wiadomość z kodem, nie pustkę', () => {
    const message = loginMessage(500, 'boom');

    expect(message.detail).toContain('500');
    expect(message.title.length).toBeGreaterThan(0);
  });

  it('każdy wariant ma niepusty tytuł i treść (kontrola kompletności)', () => {
    const cases: Array<[number | null, string | null]> = [
      [401, 'invalid_credentials'],
      [403, 'no_panel_access'],
      [403, 'csrf_header_required'],
      [null, null],
      [503, 'unavailable'],
    ];

    for (const [status, error] of cases) {
      const message = loginMessage(status, error);
      expect(message.title.trim().length).toBeGreaterThan(0);
      expect(message.detail.trim().length).toBeGreaterThan(0);
    }
  });
});
