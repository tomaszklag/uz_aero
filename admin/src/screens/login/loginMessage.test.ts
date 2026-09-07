import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { loginMessage } from './loginMessage';

const http = (status: number, error: string): HttpError =>
  new HttpError(status, { error } as never);

describe('nieudane logowanie (Google)', () => {
  it('token nie do sprawdzenia: „spróbuj jeszcze raz", bez wskazywania konta', () => {
    const message = loginMessage(http(401, 'invalid_token'));
    expect(message.tone).toBe('danger');
    expect(message.text).toContain('Nie udało się potwierdzić konta Google');
  });

  it('konto wyłączone mówi to WPROST - to nie jest odmowa poświadczeń', () => {
    // Inaczej niż przy hasłach: tożsamość jest już potwierdzona podpisem Google,
    // więc nie ma czego ukrywać, a „spróbuj jeszcze raz" kazałoby próbować bez sensu.
    const message = loginMessage(http(401, 'account_disabled'));
    expect(message.tone).toBe('warn');
    expect(message.text).toContain('wyłączone');
  });

  it('konto Google bez konta w klubie: droga prowadzi do administratora', () => {
    const message = loginMessage(http(403, 'not_registered'));
    expect(message.tone).toBe('warn');
    expect(message.text).toContain('nie ma konta z tym adresem');
    expect(message.text).toContain('administratora');
  });

  it('konto bez panelu brzmi INACZEJ niż konto nieznane - to dwie różne prośby', () => {
    const panel = loginMessage(http(403, 'no_panel_access'));
    expect(panel.tone).toBe('warn');
    expect(panel.text).toContain('nie ma dostępu do panelu');
    expect(panel.text).not.toBe(loginMessage(http(403, 'not_registered')).text);
  });

  it('brak sieci to inne zdanie niż odmowa serwera', () => {
    const message = loginMessage(new TypeError('Failed to fetch'));
    expect(message.text).toContain('Nie ma połączenia');
  });

  it('nieznana awaria niesie kod', () => {
    expect(loginMessage(http(502, 'bad_gateway')).text).toContain('502');
  });
});
