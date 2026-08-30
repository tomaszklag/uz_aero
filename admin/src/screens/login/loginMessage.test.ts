import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { loginMessage } from './loginMessage';

const http = (status: number, error: string): HttpError =>
  new HttpError(status, { error } as never);

describe('nieudane logowanie', () => {
  it('złe poświadczenia: jedno zdanie i czyste pole hasła', () => {
    const message = loginMessage(http(401, 'invalid_credentials'));
    expect(message.text).toBe('Nieprawidłowy login lub hasło.');
    expect(message.clearPassword).toBe(true);
  });

  it('konto wyłączone brzmi TAK SAMO jak złe hasło', () => {
    // Serwer celowo nie rozróżnia tych dwóch przypadków w odpowiedzi - inaczej ekran
    // logowania zdradzałby, które loginy istnieją. Panel nie ma czego dopowiedzieć.
    expect(loginMessage(http(401, 'account_disabled')).text).toBe(
      loginMessage(http(401, 'invalid_credentials')).text,
    );
  });

  it('konto bez panelu: hasło ZOSTAJE, bo było poprawne', () => {
    const message = loginMessage(http(403, 'no_panel_access'));
    expect(message.tone).toBe('warn');
    expect(message.text).toContain('nie ma dostępu do panelu');
    expect(message.clearPassword).toBe(false);
  });

  it('brak sieci nie kasuje wpisanego hasła', () => {
    // Przepisywanie hasła po każdym zaniku zasięgu jest karą za cudzy problem.
    const message = loginMessage(new TypeError('Failed to fetch'));
    expect(message.clearPassword).toBe(false);
    expect(message.text).toContain('Nie ma połączenia');
  });

  it('nieznana awaria niesie kod', () => {
    expect(loginMessage(http(502, 'bad_gateway')).text).toContain('502');
  });
});
