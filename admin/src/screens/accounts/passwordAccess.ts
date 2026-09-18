/**
 * Ninerdeck - panel: DOSTĘP DO KONTA - metody logowania i link „ustaw hasło"
 * (2.1.0, issue #134 D4/D5; mockupy `piloci-konto`, `konto`, `organizacje-klub`).
 *
 * Moduł CZYSTY (bez Reacta). Trzy decyzje, wszystkie takie, które łatwo zepsuć w JSX
 * i których nikt by potem nie zauważył:
 *  • jakie plakietki opisują konto i w jakiej kolejności;
 *  • kiedy „Wyślij link" jest zablokowany i z jakim powodem;
 *  • co ekran mówi po wysłaniu - i co po każdej z trzech odmów.
 *
 * ══ ADMINISTRATOR WYSYŁA, NIE DYKTUJE (§5.4) ══
 * Nigdzie w tym pliku nie ma linku ani kodu, bo serwer ich nie oddaje i oddawać nie
 * będzie: link do wklejenia w komunikator jest tym samym kanałem ręcznym, który
 * przegląd właściciela odrzucił razem z kodem jednorazowym. Potwierdzenie mówi DOKĄD
 * poszedł list i JAK DŁUGO jest ważny - to wszystko, co administrator ma powiedzieć
 * przez telefon.
 */

import { isHttpError } from '../../api/httpClient';
import type { AccountMethodDto, PasswordLinkSentDto } from '../../api/dto';

/** Plakietka metody - napis, jakim panel nazywa sposób wejścia. */
const METHOD_LABEL: Record<AccountMethodDto, string> = {
  google: 'Google',
  password: 'hasło',
};

/**
 * Plakietki pod adresem: informacja o STANIE konta, nie przełączniki.
 *
 * Klub nie włącza ani nie wyłącza metod - Google podpina się samo po zweryfikowanym
 * adresie, a hasło ustawia jego właściciel z linku. Kolejność jest kolejnością mockupu.
 *
 * Pusta lista jest stanem PRAWDZIWYM (konto założone adresem, do którego nikt jeszcze
 * nie wszedł) i ekran ma wtedy nie rysować rzędu plakietek wcale - pusta ramka mówiłaby
 * o awarii odczytu.
 */
export function methodLabels(methods: readonly AccountMethodDto[]): string[] {
  return methods.map((method) => METHOD_LABEL[method]);
}

/**
 * Powód, dla którego „Wyślij link" jest nieczynny; `null` = wolno wysłać.
 *
 * Powód stoi W PRZYCISKU (reguła issue #55), a nie w banerze: człowiek napotyka blokadę
 * przy przycisku i tam szuka odpowiedzi. Tu wolno powiedzieć wprost, czego brakuje -
 * pyta administrator o członka SWOJEGO klubu, więc nie ma czego ukrywać (inaczej niż
 * na ekranie logowania, gdzie każda różnica wylicza konta).
 */
export function linkBlocker(email: string | null): string | null {
  return email == null || email.trim() === '' ? 'ta osoba nie ma adresu e-mail' : null;
}

/**
 * „godzinę" / „72 h" - jak długo ważny jest wysłany link.
 *
 * Liczymy z TERMINU podanego przez serwer, zamiast wpisywać stałą: reset ma godzinę,
 * a zaproszenie pierwszego administratora 72 h (§5.4) i to serwer o tym rozstrzyga.
 * Zaokrąglenie do pełnych godzin jest tu dokładnością właściwą - nikt nie planuje
 * dnia wokół minuty ważności linku.
 */
export function linkValidity(expiresAt: string, now: number): string {
  const at = new Date(expiresAt).getTime();
  if (!Number.isFinite(at)) return 'krótko';

  const minutes = Math.max(0, Math.round((at - now) / 60_000));
  const hours = Math.round(minutes / 60);
  if (hours <= 1) return 'godzinę';
  return `${hours} h`;
}

/** Potwierdzenie pod przyciskiem: dokąd poszedł list i jak długo jest ważny. */
export function linkSentText(sent: PasswordLinkSentDto, now: number): string {
  return `wysłano na ${sent.sentTo} · ważny ${linkValidity(sent.expiresAt, now)}`;
}

/**
 * Nieudana wysyłka - zdanie do banera.
 *
 * Trzy odmowy i trzy różne drogi wyjścia, więc trzy zdania: brakujący adres naprawia
 * się w karcie osoby, limit przeczekuje, a niedoręczony list wysyła ponownie. `502`
 * jest tu najważniejszy: token powstał, więc cisza po kliknięciu kazałaby czekać na
 * list, który nigdzie nie poszedł.
 */
export function linkFailureText(error: unknown): string {
  if (!isHttpError(error)) return 'Nie ma połączenia z serwerem. Spróbuj za chwilę.';

  if (error.status === 409 && error.body.error === 'email_required') {
    return 'Ta osoba nie ma adresu e-mail - nie ma dokąd wysłać linku.';
  }
  if (error.status === 429) return 'Za dużo wysyłek - spróbuj za chwilę.';
  if (error.status === 502) return 'Nie udało się wysłać listu. Spróbuj jeszcze raz.';
  return `Nie udało się wysłać linku (kod ${error.status}).`;
}
