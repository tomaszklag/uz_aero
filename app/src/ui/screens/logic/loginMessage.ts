/**
 * UZ Aero - nieudane logowanie → ZDANIE dla pilota na ekranie `00a` (§6 pkt 3: powód,
 * nigdy kod błędu; nigdy cicha odmowa).
 *
 * Moduł czysty, wyniesiony z `authStore` przy wejściu Google (2026-09-04), bo lista
 * zdań urosła i ma test: „złe hasło" zniknęło razem z hasłami, doszły odmowy konta
 * i niepowodzenia po stronie telefonu.
 *
 * `null` = NIE pokazuj banera: pilot sam zamknął okno Google. Zdanie „logowanie
 * przerwane" opisywałoby jego własną decyzję sprzed sekundy.
 */

import { ServerRejectedError, ServerUnreachableError } from '../../../application/ports';
import { GoogleSignInError } from './googleSignInError';

export function loginMessage(error: unknown): string | null {
  if (error instanceof GoogleSignInError) {
    if (error.reason === 'cancelled') return null;
    if (error.reason === 'unavailable') {
      return 'Ta wersja aplikacji nie ma skonfigurowanego logowania Google - zgłoś to administratorowi.';
    }
    return 'Logowanie Google nie powiodło się. Spróbuj jeszcze raz.';
  }
  if (error instanceof ServerUnreachableError) {
    return 'Brak połączenia z serwerem. Pierwsze logowanie wymaga internetu - zaloguj się przed wylotem w teren.';
  }
  if (error instanceof ServerRejectedError) {
    if (error.code === 'account_disabled') return 'Konto jest wyłączone - skontaktuj się z administratorem.';
    if (error.status === 401) return 'Nie udało się potwierdzić konta Google. Spróbuj jeszcze raz.';
    return `Serwer odrzucił logowanie (${error.code}).`;
  }
  return 'Nie udało się zalogować - spróbuj ponownie.';
}
