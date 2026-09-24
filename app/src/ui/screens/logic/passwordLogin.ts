/**
 * Ninerdeck - decyzje POLA LOGINU na ekranie 00F (makieta `design/00f-login-haslo.html`,
 * `docs/logowanie-haslem.md` §5.1, D2).
 *
 * Moduł CZYSTY: jak rozpoznać, co pilot wpisał, jak to znormalizować i kiedy „ZALOGUJ"
 * jest czynne. Kontekst KLUBU, w którym rozwiąże się kod pilota, mieszka osobno
 * (`deviceClubs.ts`) - to własność URZĄDZENIA, a nie tego formularza.
 */

/**
 * JEDNO POLE NA DWA IDENTYFIKATORY (D2).
 *
 * E-mail jest jedynym globalnym identyfikatorem osoby; kod pilota działa WYŁĄCZNIE
 * w klubie, który urządzenie zna. Dwa osobne pola pytałyby więc o rzeczy, z których
 * pilot wpisuje jedną - a rozstrzygnąć da się to z samego napisu.
 *
 * Rozstrzyga OBECNOŚĆ „@", nie kształt adresu: pole ma rozpoznać INTENCJĘ, a nie
 * walidować pocztę. „ako@" jest adresem popsutym, nie kodem pilota, więc pójdzie
 * na serwer jako adres i wróci jedną odmową - tą samą, co adres nieznany.
 */
export const looksLikeEmail = (login: string): boolean => login.includes('@');

/**
 * Login gotowy do wysłania.
 *
 * Adres: przycięty i małą literą - tak trzyma go serwer od 2.1.0 (`domain/email.ts`),
 * a różnica wielkości liter na tablecie z autokapitalizacją jest regułą, nie wyjątkiem.
 * Kod pilota: przycięty i WERSALIKAMI - tak stoi w klubie i tak czyta go człowiek.
 *
 * Normalizacja jest po to, żeby ta sama osoba wpisująca „ Bno " weszła tam, gdzie
 * wpisująca „BNO" - a nie po to, żeby cokolwiek przepuścić: sprawdza serwer.
 */
export const normalizeLogin = (login: string): string => {
  const trimmed = login.trim();
  return looksLikeEmail(trimmed) ? trimmed.toLowerCase() : trimmed.toUpperCase();
};

/**
 * Czy „ZALOGUJ" jest czynne.
 *
 * Puste pole blokuje BEZ zdania - blokadę widać z pól nad przyciskiem (wąski wyjątek
 * issue #55; makieta 00F mówi to wprost). Długości hasła NIE sprawdzamy: polityka
 * dotyczy USTAWIANIA hasła, a nie logowania - konto sprzed zaostrzenia reguł musi
 * dać się otworzyć, a „za krótkie" przy logowaniu mówiłoby pilotowi o CUDZEJ regule.
 */
export const canSubmitLogin = (login: string, password: string): boolean =>
  login.trim() !== '' && password !== '';
