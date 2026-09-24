/**
 * Ninerdeck - panel: „Załóż konto" - decyzje formularza (issue #180, 2026-09-24).
 *
 * Moduł CZYSTY, jak `forgotPasswordForm.ts`: ekran to dwa pola i jedna akcja, więc
 * jedyne, co da się w nim zepsuć, to KIEDY wolno wysłać i CO powiedzieć po wysłaniu.
 * Oba pytania mają odpowiedzi tutaj, z testami, a `.tsx` odpowiada za układ.
 *
 * ══ TEN SAM MECHANIZM, CO ZAPOMNIANE HASŁO (`docs/logowanie-haslem.md` §5.4a) ══
 * Imię, nazwisko i adres → list z linkiem → hasło ustawia strona `/haslo/` i DOPIERO
 * WTEDY powstaje osoba. Do #180 ta droga istniała wyłącznie w aplikacji (00H); panel
 * dostaje ją 1:1, bo administrator zakładający konta testowe nie ma po co sięgać po
 * telefon. Czego tu NIE MA: pola hasła (ustawia je strona z linku) ani kodu klubu -
 * dołączanie do klubu jest osobnym krokiem w aplikacji i osobną decyzją administratora;
 * rejestracja niczego w klubie nie omija.
 *
 * ══ JEDNO ZDANIE NA KAŻDĄ ODPOWIEDŹ SERWERA ══
 * Serwer odpowiada `202` ZAWSZE - dla adresu wolnego, zajętego i po wyczerpaniu limitu
 * wysyłek. Ekran musi więc opisać OBA wyniki naraz, w trybie warunkowym: inaczej sam
 * byłby tą różnicą, której serwer starannie nie zdradza. Wyjątkami są awaria SIECI
 * („nie wiem, czy wysłano" to inna wiadomość niż „wysłano") i `400` - odmowa KSZTAŁTU
 * danych, która o istnieniu konta nie mówi nic, a „link już idzie" byłoby wtedy nieprawdą.
 */

import { isHttpError } from '../../api/httpClient';
import { canSendLink } from './forgotPasswordForm';

/** Lustro walidacji serwera (`signupBody`: imię i nazwisko od 2 znaków). */
export const NAME_MIN_LENGTH = 2;

/** Imię i nazwisko gotowe do wysłania - bez zewnętrznych i podwójnych spacji, reszta bez zmian. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Czy wolno wysłać: oba pola wymagane, oba blokują BEZ zdania - widać je nad
 * przyciskiem (issue #55). Adres sprawdzamy kształtem tak samo, jak przy „Nie pamiętam
 * hasła", bo serwer odrzuci go `400`; „czy to na pewno dwa człony" NIE sprawdzamy -
 * „Jan" jest kompletnym imieniem człowieka, który tak się przedstawia.
 */
export function canSignUp(name: string, email: string): boolean {
  return normalizeName(name).length >= NAME_MIN_LENGTH && canSendLink(email);
}

/**
 * Lead karty - CO SIĘ STANIE, nie jak działa link (issue #72). Klub przychodzi potem.
 * Krótszy niż na 00H: strażnik napisów panelu (`copy.test.ts`) trzyma zdania w dwóch
 * linijkach, a „na dowolnym urządzeniu" ma wagę na wspólnym tablecie, nie w przeglądarce.
 */
export const SIGNUP_LEAD =
  'Wyślemy link na Twój adres. Ustaw z niego hasło i zaloguj się tutaj. Do klubu wejdziesz kodem od administratora w aplikacji.';

export interface SignUpOutcome {
  tone: 'ok' | 'danger';
  text: string;
}

/** Potwierdzenie w trybie WARUNKOWYM - to samo zdanie dla adresu wolnego i zajętego. */
export const SIGNUP_SENT: SignUpOutcome = {
  tone: 'ok',
  text: 'Jeśli ten adres jest wolny, link już idzie - ważny godzinę. Jeśli konto z tym adresem już istnieje, list mówi, jak się zalogować.',
};

/**
 * Wynik wysłania. `error == null` znaczy `202`; odmowa limitu i każda inna odmowa
 * serwera daje TO SAMO potwierdzenie (patrz docblock). Dwa wyjątki niżej.
 */
export function signUpOutcome(error: unknown): SignUpOutcome {
  if (error == null) return SIGNUP_SENT;
  if (!isHttpError(error)) {
    return { tone: 'danger', text: 'Nie ma połączenia z serwerem. Spróbuj za chwilę.' };
  }
  if (error.status === 400) {
    return {
      tone: 'danger',
      text: 'Serwer nie przyjął tych danych - sprawdź imię i nazwisko oraz adres e-mail.',
    };
  }
  return SIGNUP_SENT;
}
