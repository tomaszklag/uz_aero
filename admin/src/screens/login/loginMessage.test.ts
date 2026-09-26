import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { loginMessage, retryAfterText } from './loginMessage';

const http = (status: number, error: string, extra: Record<string, unknown> = {}): HttpError =>
  new HttpError(status, { error, ...extra } as never);

describe('nieudane logowanie hasłem (2.1.0)', () => {
  it('login nieznany, osoba bez hasła i złe hasło dają JEDNO zdanie', () => {
    // Serwer odpowiada na te trzy stany identycznie i w identycznym czasie (§5.2),
    // więc ekran nie ma prawa ich rozróżnić - inaczej formularz wyliczałby konta.
    const message = loginMessage(http(401, 'invalid_credentials'));
    expect(message.tone).toBe('danger');
    expect(message.text).toBe('Nieprawidłowy e-mail lub hasło.');
    expect(message.text).not.toContain('konta Google');
  });

  it('za dużo prób: zdanie niesie CZAS, nie „chwilę"', () => {
    const message = loginMessage(http(429, 'too_many_attempts', { retryAfterSec: 175 }));
    expect(message.tone).toBe('warn');
    expect(message.text).toContain('za 3 min');
  });

  it('bez `retryAfterSec` mówi „za minutę" zamiast milczeć o czasie', () => {
    // Stary serwer albo odmowa bez ciała - zdanie ma dalej mówić, kiedy próbować.
    expect(loginMessage(http(429, 'too_many_attempts')).text).toContain('za minutę');
  });

  it('czas zaokrągla się W GÓRĘ i nigdy nie schodzi pod minutę', () => {
    // Sekundy zapraszałyby do liczenia i do trzeciej próby, która blokadę przedłuży.
    expect(retryAfterText(12)).toBe('za minutę');
    expect(retryAfterText(60)).toBe('za minutę');
    expect(retryAfterText(61)).toBe('za 2 min');
    expect(retryAfterText(900)).toBe('za 15 min');
  });
});

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

  it('osoba bez roli panelu (także bez klubu): zdanie niesie OBIE drogi wyjścia', () => {
    // Od epiku D wielofirmowości osoba powstaje przy pierwszym logowaniu, więc „konta
    // nie ma" przestało być stanem - nieznajomy i zwykły pilot dostają to samo zdanie.
    // Od issue #180 osoba bez klubu bywa kimś, kto przed chwilą założył konto W TYM
    // panelu - zdanie musi więc mówić, skąd bierze się klub, a nie tylko „poproś".
    // Od issue #216 („panel dla wszystkich") 403 znaczy WYŁĄCZNIE brak klubu - członek
    // z pustym zakresem wchodzi - więc zdanie mówi o kodzie klubu, a nie o administratorze.
    const panel = loginMessage(http(403, 'no_membership'));
    expect(panel.tone).toBe('warn');
    expect(panel.text).toContain('nie należy jeszcze do żadnego klubu');
    expect(panel.text).toContain('kodem klubu w aplikacji');
    expect(panel.text).not.toContain('nadaje');
  });

  it('brak sieci to inne zdanie niż odmowa serwera', () => {
    const message = loginMessage(new TypeError('Failed to fetch'));
    expect(message.text).toContain('Nie ma połączenia');
  });

  it('nieznana awaria niesie kod', () => {
    expect(loginMessage(http(502, 'bad_gateway')).text).toContain('502');
  });
});
