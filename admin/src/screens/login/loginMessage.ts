/**
 * Ninerdeck - panel: nieudane logowanie -> zdanie i ton banera.
 *
 * Moduł CZYSTY (bez Reacta): to jest decyzja o treści, a treść tego ekranu ma
 * dokładnie jedno zadanie - powiedzieć, czy człowiek ma spróbować jeszcze raz,
 * czy pójść po administratora.
 *
 * == DWIE METODY, JEDNA TABELA ODMOW (2.1.0, `docs/logowanie-haslem.md` §5.2) ==
 * Hasło wróciło jako druga metoda, więc wróciła też odmowa POŚWIADCZEŃ - i jest JEDNA
 * na trzy stany: login nieznany, osoba bez hasła i złe hasło dają to samo zdanie
 * (serwer liczy skrót także dla nieznanego adresu), żeby formularz nie wyliczał kont.
 * Ton czerwony, bo warto spróbować jeszcze raz.
 *
 * Pozostałe odmowy dotyczą OSOBY, którą serwer już rozpoznał - Googlem albo hasłem -
 * i każda ma inną drogę wyjścia, więc każda ma własne zdanie; ton bursztynowy znaczy
 * „idź po administratora":
 *  • `429 too_many_attempts` - za dużo prób. Zdanie niesie CZAS, nie „chwilę": minuta
 *    i kwadrans to dwie różne decyzje człowieka stojącego przy tablecie;
 *  • `403 no_panel_access` - osoba jest, ale w żadnym klubie nie jest administratorem
 *    (zwykły pilot albo ktoś, kto nie ma jeszcze klubu);
 *  • `401 account_disabled` - osoba zablokowana; próbowanie ponownie nic nie zmieni.
 *    Mówimy to WPROST, bo tożsamość jest już dowiedziona - nie ma czego ukrywać.
 */

import { isHttpError } from '../../api/httpClient';
import type { BannerTone } from '../../ui/components';

export interface LoginMessage {
  tone: BannerTone;
  text: string;
}

/**
 * „za 3 min" z sekund `Retry-After`.
 *
 * Zaokrąglamy W GÓRĘ i nigdy nie schodzimy poniżej minuty: „spróbuj za 12 s" zaprasza
 * do liczenia sekund i do trzeciej nieudanej próby, która przedłuży blokadę.
 */
export function retryAfterText(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 60) return 'za minutę';
  return `za ${Math.ceil(seconds / 60)} min`;
}

export function loginMessage(error: unknown): LoginMessage {
  // Awaria sieci to nie odpowiedź serwera - `fetch` rzuca `TypeError`, statusu nie ma.
  if (!isHttpError(error)) {
    return { tone: 'danger', text: 'Nie ma połączenia z serwerem. Spróbuj za chwilę.' };
  }

  if (error.status === 401 && error.body.error === 'invalid_credentials') {
    return { tone: 'danger', text: 'Nieprawidłowy e-mail lub hasło.' };
  }

  if (error.status === 429) {
    return { tone: 'warn', text: `Za dużo prób - spróbuj ${retryAfterText(error.body.retryAfterSec)}.` };
  }

  if (error.status === 403) {
    // Jedno zdanie na DWIE sytuacje, których serwer nie rozróżnia (`no_panel_access`):
    // członek klubu bez wejścia do panelu i osoba BEZ KLUBU - od issue #180 także taka,
    // która przed chwilą założyła konto w tym panelu. Dla niej „poproś administratora
    // klubu" byłoby zdaniem o kimś, kogo jeszcze nie ma: klub przychodzi kodem w aplikacji.
    return {
      tone: 'warn',
      text: 'To konto nie ma dostępu do panelu. Do klubu wchodzi się kodem klubu w aplikacji Ninerdeck, a dostęp do panelu nadaje administrator klubu.',
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
