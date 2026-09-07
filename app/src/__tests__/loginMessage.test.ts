/**
 * UZ Aero - nieudane logowanie → zdanie (`ui/screens/logic/loginMessage.ts`).
 */

import { ServerRejectedError, ServerUnreachableError } from '../application/ports';
import { GoogleSignInError } from '../ui/screens/logic/googleSignInError';
import { loginMessage } from '../ui/screens/logic/loginMessage';

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
