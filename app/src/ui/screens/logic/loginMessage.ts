/**
 * Ninerdeck - nieudane logowanie → ZDANIE dla pilota na ekranie `00a` (§6 pkt 3: powód,
 * nigdy kod błędu; nigdy cicha odmowa).
 *
 * Moduł czysty, wyniesiony z `authStore` przy wejściu Google (2026-09-04), bo lista
 * zdań urosła i ma test: „złe hasło" zniknęło razem z hasłami, doszły odmowy konta
 * i niepowodzenia po stronie telefonu.
 *
 * `null` = NIE pokazuj banera: pilot sam zamknął okno Google. Zdanie „logowanie
 * przerwane" opisywałoby jego własną decyzję sprzed sekundy.
 */

import { PASSWORD_MIN_LENGTH } from '@ninerdeck/domain';
import type { PasswordWeakness } from '@ninerdeck/domain';

import type { PasswordLoginOutcome, SetPasswordOutcome } from '../../../application/auth/authService';
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

// ── 2.1.0: logowanie HASŁEM (00F), link (00G/00H), zmiana hasła (13B) ───────────

/**
 * „Spróbuj za 3 min" - ograniczenie tempa serwera (10 prób na login, 30 na adres IP
 * w 15 min). Powód stoi W PRZYCISKU (issue #55) i MUSI podawać CZAS: „za dużo prób"
 * bez liczby każe pilotowi zgadywać, kiedy wrócić - a on stoi przy tablecie i chce lecieć.
 */
export const waitReason = (sec: number): string =>
  sec < 60 ? `Za dużo prób - spróbuj za ${sec} s` : `Za dużo prób - spróbuj za ${Math.ceil(sec / 60)} min`;

/**
 * Zdania polityki hasła - po jednym na powód z `@ninerdeck/domain`.
 *
 * Mówią, CO JEST NIE TAK z wpisaną wartością, a nie jakie są wymagania: wymagania stoją
 * w podpowiedzi pod polem i widać je, zanim ktokolwiek zacznie pisać.
 *
 * Panel ma własną kopię tych zdań (`admin/src/screens/me/passwordForm.ts`) i to jest
 * świadome: REGUŁĘ liczy jedna funkcja domeny, a NAPIS należy do powierzchni - panel
 * pisze do administratora przy biurku, aplikacja do pilota przy tablecie. Do domeny
 * copy nie wchodzi: nie ma tam dziś ani jednego zdania dla człowieka i nie zaczynamy
 * od hasła.
 */
const WEAKNESS_TEXT: Record<PasswordWeakness, string> = {
  too_short: `Za krótkie - co najmniej ${PASSWORD_MIN_LENGTH} znaków.`,
  too_long: 'Za długie - skróć je.',
  blocklisted: 'Za łatwe do odgadnięcia - wybierz inne.',
  contains_email: 'Za łatwe do odgadnięcia - zawiera Twój adres.',
  contains_name: 'Za łatwe do odgadnięcia - zawiera Twoje nazwisko.',
};

export const weaknessText = (weakness: PasswordWeakness): string => WEAKNESS_TEXT[weakness];

/**
 * Co ekran 00F ma powiedzieć po nieudanym logowaniu hasłem - i GDZIE.
 *
 * Podział miejsc jest regułą, nie stylem (issue #55): przy POLU stoi zarzut do tego, co
 * pilot wpisał, a W PRZYCISKU - powód, dla którego zapisu nie ma teraz w ogóle. Odmowa
 * poświadczeń jest pierwszym rodzajem, limit i brak sieci - drugim.
 */
export interface LoginNotice {
  /** Zdanie PRZY POLU. Wpisu NIE czyścimy - pilot poprawia literówkę, nie zaczyna od nowa. */
  fieldError: string | null;
  /** Powód W PRZYCISKU - blokada, nie ocena wpisu. */
  blockReason: string | null;
}

const NO_NOTICE: LoginNotice = { fieldError: null, blockReason: null };

export function passwordLoginNotice(outcome: PasswordLoginOutcome): LoginNotice {
  switch (outcome.kind) {
    case 'invalid_credentials':
      // JEDNO zdanie na trzy stany serwera (login nieznany / osoba bez hasła / złe
      // hasło). Serwer starannie ich nie rozróżnia, więc ekran nie ma prawa - inaczej
      // odpowiedź wyliczałaby konta. Nazywa OBA pola, bo nie wiadomo, które jest złe.
      return { fieldError: 'Nieprawidłowy e-mail, kod albo hasło.', blockReason: null };
    case 'account_disabled':
      // Tożsamość jest już dowiedziona, więc wolno powiedzieć WPROST (makieta 00F).
      // Bez „spróbuj ponownie": próbowanie nic nie zmieni.
      return { fieldError: 'To konto jest wyłączone.', blockReason: null };
    case 'rate_limited':
      return { fieldError: null, blockReason: waitReason(outcome.retryAfterSec) };
    case 'unreachable':
      return { fieldError: null, blockReason: 'Wymaga internetu' };
    default:
      return NO_NOTICE;
  }
}

/** Co arkusz 13B ma powiedzieć po nieudanym zapisie hasła - i pod którym polem. */
export interface SetPasswordNotice extends LoginNotice {
  /** Zdanie pod polem „Obecne hasło" - jedyna odmowa, która dotyczy właśnie jego. */
  currentError: string | null;
}

const NO_SET_NOTICE: SetPasswordNotice = { ...NO_NOTICE, currentError: null };

export function setPasswordNotice(outcome: SetPasswordOutcome): SetPasswordNotice {
  switch (outcome.kind) {
    case 'invalid_credentials':
      return { ...NO_SET_NOTICE, currentError: 'Nieprawidłowe obecne hasło.' };
    case 'weak_password':
      // TYM SAMYM zdaniem, które ekran pokazał przy wpisie: obie strony liczą jedną
      // politykę, więc druga wersja tego samego zarzutu byłaby dowodem na kopię reguły.
      return { ...NO_SET_NOTICE, fieldError: weaknessText(outcome.reason) };
    case 'email_required':
      // Hasło bez adresu byłoby poświadczeniem, którym nie da się zalogować: login to
      // e-mail albo kod pilota, a kodu nie ma kto nadać poza administratorem klubu.
      return {
        ...NO_SET_NOTICE,
        blockReason: 'Twoje konto nie ma adresu e-mail - poproś o niego administratora klubu',
      };
    case 'rate_limited':
      return { ...NO_SET_NOTICE, blockReason: waitReason(outcome.retryAfterSec) };
    case 'unreachable':
      return { ...NO_SET_NOTICE, blockReason: 'Wymaga internetu' };
    default:
      return NO_SET_NOTICE;
  }
}
