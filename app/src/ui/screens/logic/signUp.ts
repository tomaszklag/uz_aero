/**
 * Ninerdeck - decyzje ekranu 00H („Załóż konto"; makieta `design/00h-zaloz-konto.html`,
 * `docs/logowanie-haslem.md` §5.4a; D9 odwrócone 2026-09-17).
 *
 * REJESTRACJA E-MAILEM TO TEN SAM MECHANIZM, CO ZAPOMNIANE HASŁO: imię, nazwisko i adres
 * → list z linkiem → hasło ustawia się NA STRONIE, i dopiero wtedy powstaje osoba. Adres
 * jest przez to potwierdzony samym kliknięciem, jak `email_verified` u Google.
 *
 * Czego tu NIE MA i dlaczego: pola hasła (ustawia je strona z linku - pilot na wspólnym
 * tablecie czyta pocztę na własnym telefonie) ani kodu klubu (dołączanie jest osobnym
 * krokiem 00E i osobną decyzją administratora - rejestracja niczego w klubie nie omija).
 */

/**
 * Czy „WYŚLIJ LINK" jest czynne.
 *
 * Oba pola wymagane, oba blokują BEZ zdania - widać je nad przyciskiem (issue #55).
 * Imię i nazwisko jest jedyną rzeczą, której serwer nie ma skąd wziąć: u osoby z Google
 * przychodzi z profilu, tutaj nie ma innego źródła.
 *
 * Kształtu adresu ani „czy to na pewno dwa człony" NIE sprawdzamy: „Jan" jest
 * kompletnym imieniem człowieka, który tak się przedstawia, a odmowa oparta na liczbie
 * spacji byłaby regułą wymyśloną po tej stronie.
 */
export const canSignUp = (name: string, email: string): boolean =>
  name.trim() !== '' && email.trim() !== '';

/** Imię i nazwisko gotowe do wysłania - bez zewnętrznych spacji, reszta bez zmian. */
export const normalizeName = (name: string): string => name.trim().replace(/\s+/g, ' ');

/** Karta instrukcji NAD polami - co się stanie i skąd weźmie się klub. */
export const SIGNUP_INTRO_TITLE = 'ZAŁÓŻ KONTO';

export const SIGNUP_INTRO_TEXT =
  'Wyślemy link na Twój adres. Otwórz go na dowolnym urządzeniu i ustaw hasło - potem zaloguj się tutaj. Do klubu wejdziesz kodem od administratora.';

/**
 * POTWIERDZENIE - ZAWSZE TO SAMO ZDANIE, w trybie WARUNKOWYM (§8 pkt 2).
 *
 * Serwer nie mówi, czy adres jest wolny; przy zajętym wychodzi list resetu ze zdaniem
 * „masz już konto", więc człowiek, który zapomniał, że już się rejestrował, i tak
 * dostaje to, po co przyszedł. Ekran musi więc opisać OBA wyniki naraz - inaczej sam
 * byłby tą różnicą, której serwer starannie nie zdradza.
 */
export const SIGNUP_SENT_TITLE = 'SPRAWDŹ POCZTĘ';

export const SIGNUP_SENT_TEXT =
  'Jeśli ten adres jest wolny, link już idzie - ważny godzinę. Jeśli konto z tym adresem już istnieje, list mówi, jak się zalogować. Otwórz link na dowolnym urządzeniu, ustaw hasło i zaloguj się tutaj.';
