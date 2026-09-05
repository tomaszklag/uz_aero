/**
 * UZ Aero - niepowodzenie PO STRONIE TELEFONU, zanim token dojechał do serwera.
 *
 * Moduł czysty i osobny od hooka, który go rzuca (`ui/hooks/useGoogleSignIn.ts`),
 * bo klasę musi znać także `loginMessage.ts` - a ten jest testowany w Node bez
 * `expo-auth-session`. Trzy powody, bo trzy różne zdania:
 *  • `cancelled` - pilot zamknął okno Google; to nie jest błąd i nie dostaje banera;
 *  • `failed` - okno wróciło bez tokenu (błąd dostawcy, przerwane połączenie);
 *  • `unavailable` - w tym buildzie nie ma identyfikatora klienta Google, więc
 *    przepływu nie da się w ogóle zacząć. To błąd konfiguracji, nie pilota.
 */
export type GoogleSignInFailure = 'cancelled' | 'failed' | 'unavailable';

export class GoogleSignInError extends Error {
  constructor(readonly reason: GoogleSignInFailure) {
    super(`Logowanie Google: ${reason}`);
    this.name = 'GoogleSignInError';
  }
}
