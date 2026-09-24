/**
 * Ninerdeck - decyzje ekranu 00G („Nie pamiętam hasła"; makieta `design/00g-link-hasla.html`,
 * `docs/logowanie-haslem.md` D5, §5.4).
 *
 * JEDEN MECHANIZM ZAPOMNIANEGO HASŁA: link z e-maila. Ta sama droga obsługuje osobę,
 * która hasła jeszcze NIE MA (wchodzi Googlem) - list je USTAWIA, nie tylko zmienia -
 * ale ekran niczego nie rozróżnia: pyta o adres i tyle. Kodu jednorazowego do przepisania
 * NIE MA i nie będzie (decyzja właściciela 2026-09-16).
 */

import { looksLikeEmail } from './passwordLogin';

/**
 * Adres podstawiony z 00F - TYLKO wtedy, gdy pilot wpisał tam ADRES.
 *
 * Po kodzie pilota pole startuje puste i to nie jest niedbałość: kod nie jest adresem,
 * a serwer z kodu adresu nie zdradzi - odpowiedź na wysyłkę nie może mówić, czy ktoś
 * taki istnieje. Podstawienie „BNO" do pola e-mail byłoby wpisem, który na pewno nie
 * zadziała, postawionym tam, gdzie pilot go nie oczekuje.
 */
export const emailPrefill = (login: string): string => (looksLikeEmail(login) ? login.trim() : '');

/**
 * Czy „WYŚLIJ LINK" jest czynne.
 *
 * Pusty adres blokuje BEZ zdania - blokadę widać z pola nad przyciskiem (issue #55).
 * KSZTAŁTU ADRESU NIE SPRAWDZAMY i to jest decyzja: odmowa „to nie wygląda na adres"
 * przy wpisie, który serwer i tak przyjmie, byłaby drugą, surowszą regułą po tej
 * stronie - a ekran, który MA odpowiadać zawsze tak samo, nie może różnicować niczego
 * sam z siebie.
 */
export const canSendLink = (email: string): boolean => email.trim() !== '';

/**
 * POTWIERDZENIE - ZAWSZE TO SAMO ZDANIE (§8 pkt 2).
 *
 * Pada po `202` i po `429`, dla adresu znanego i obcego: inna odpowiedź byłaby jedyną
 * różnicą widoczną z zewnątrz, a ekran stoi przed każdym, kto zna adres aplikacji.
 * Tryb WARUNKOWY („jeśli ten adres jest w systemie") jest tu treścią, nie asekuracją.
 *
 * Zdanie mówi też, GDZIE otworzyć link: pilot na wspólnym tablecie czyta pocztę na
 * własnym telefonie, więc „na dowolnym urządzeniu" jest instrukcją do wykonania,
 * a nie opisem budowy systemu.
 */
export const LINK_SENT_TITLE = 'SPRAWDŹ POCZTĘ';

export const LINK_SENT_TEXT =
  'Jeśli ten adres jest w systemie, link już idzie - ważny godzinę. Otwórz go na dowolnym urządzeniu, ustaw hasło i zaloguj się tutaj.';

/** Karta instrukcji NAD polem - co się stanie po tapnięciu. */
export const LINK_INTRO_TITLE = 'LINK DO USTAWIENIA HASŁA';

export const LINK_INTRO_TEXT =
  'Wyślemy link na Twój adres. Otwórz go na dowolnym urządzeniu i ustaw hasło - potem zaloguj się tutaj.';
