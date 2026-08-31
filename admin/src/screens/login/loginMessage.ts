/**
 * UZ Aero - panel 2.0: nieudane logowanie -> zdanie i ton banera.
 *
 * Moduł CZYSTY (bez Reacta): to jest decyzja o treści, a treść tego ekranu ma
 * dokładnie jedno zadanie - powiedzieć, czy człowiek ma poprawić hasło, czy pójść
 * po administratora.
 *
 * == DLACZEGO 401 I 403 BRZMIA ROZNIE ==
 * Bo to dwie różne sytuacje i serwer je rozróżnia świadomie: `401` znaczy „nie te
 * poświadczenia ALBO konto wyłączone" i jest CELOWO nierozróżnialne (inaczej ekran
 * zdradzałby, które loginy istnieją), a `403 no_panel_access` znaczy „hasło było
 * dobre, ale to konto jest tylko dla telefonu" - i tu człowiek ma prawo wiedzieć,
 * czego mu brakuje, bo inaczej będzie w kółko poprawiał poprawne hasło.
 */

import { isHttpError } from '../../api/httpClient';
import type { BannerTone } from '../../ui/components';

export interface LoginMessage {
  tone: BannerTone;
  text: string;
  /** `true` = czyścimy pole hasła i stawiamy przy nim czerwoną ramkę. */
  clearPassword: boolean;
}

export function loginMessage(error: unknown): LoginMessage {
  // Awaria sieci to nie odpowiedź serwera - `fetch` rzuca `TypeError`, statusu nie ma.
  // Hasła NIE czyścimy: nikt go nie odrzucił, a przepisywanie go po każdym zaniku
  // zasięgu jest karą za cudzy problem.
  if (!isHttpError(error)) {
    return {
      tone: 'danger',
      text: 'Nie ma połączenia z serwerem. Spróbuj za chwilę.',
      clearPassword: false,
    };
  }

  if (error.status === 403) {
    return {
      tone: 'warn',
      text: 'To konto nie ma dostępu do panelu. Poproś administratora o nadanie roli.',
      clearPassword: false,
    };
  }

  if (error.status === 401) {
    return { tone: 'danger', text: 'Nieprawidłowy login lub hasło.', clearPassword: true };
  }

  // Kod zostaje w zdaniu, bo przy nieznanej awarii jest jedyną rzeczą, którą człowiek
  // może przekazać dalej - a „coś poszło nie tak" nie pomaga nikomu.
  return {
    tone: 'danger',
    text: `Logowanie nie powiodło się (kod ${error.status}).`,
    clearPassword: false,
  };
}
