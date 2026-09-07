/**
 * UZ Aero - panel 2.0: nieudane logowanie -> zdanie i ton banera.
 *
 * Moduł CZYSTY (bez Reacta): to jest decyzja o treści, a treść tego ekranu ma
 * dokładnie jedno zadanie - powiedzieć, czy człowiek ma spróbować jeszcze raz,
 * czy pójść po administratora.
 *
 * == PO WEJSCIU GOOGLE (2026-09-04) NIE MA JUZ „ZLEGO HASLA" ==
 * Tożsamości dowodzi podpisany token Google, więc na poziomie poświadczeń zostaje
 * jedna odmowa: „tego tokenu nie umiem sprawdzić" (`401 invalid_token`). Wszystkie
 * pozostałe odmowy dotyczą KONTA, które serwer już rozpoznał - i każda z nich ma
 * inną drogę wyjścia, więc każda ma własne zdanie:
 *  • `403 not_registered` - konto Google jest poprawne, ale w klubie nie ma konta
 *    z tym adresem: administrator musi je założyć (albo wpisać adres w istniejącym);
 *  • `403 no_panel_access` - konto jest, ale to konto pilota: panel go nie obejmuje;
 *  • `401 account_disabled` - konto wyłączone; próbowanie ponownie nic nie zmieni.
 */

import { isHttpError } from '../../api/httpClient';
import type { BannerTone } from '../../ui/components';

export interface LoginMessage {
  tone: BannerTone;
  text: string;
}

export function loginMessage(error: unknown): LoginMessage {
  // Awaria sieci to nie odpowiedź serwera - `fetch` rzuca `TypeError`, statusu nie ma.
  if (!isHttpError(error)) {
    return { tone: 'danger', text: 'Nie ma połączenia z serwerem. Spróbuj za chwilę.' };
  }

  if (error.status === 403 && error.body.error === 'not_registered') {
    return {
      tone: 'warn',
      text: 'W klubie nie ma konta z tym adresem Google. Poproś administratora o jego dodanie.',
    };
  }

  if (error.status === 403) {
    return {
      tone: 'warn',
      text: 'To konto nie ma dostępu do panelu. Poproś administratora o nadanie roli.',
    };
  }

  if (error.status === 401 && error.body.error === 'account_disabled') {
    return { tone: 'warn', text: 'To konto jest wyłączone. Poproś administratora o włączenie.' };
  }

  if (error.status === 401) {
    return { tone: 'danger', text: 'Nie udało się potwierdzić konta Google. Spróbuj jeszcze raz.' };
  }

  // Kod zostaje w zdaniu, bo przy nieznanej awarii jest jedyną rzeczą, którą człowiek
  // może przekazać dalej - a „coś poszło nie tak" nie pomaga nikomu.
  return { tone: 'danger', text: `Logowanie nie powiodło się (kod ${error.status}).` };
}
