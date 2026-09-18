/**
 * Ninerdeck (serwer) - ZNORMALIZOWANY ADRES E-MAIL (2.1.0, `docs/logowanie-haslem.md` §4.4).
 *
 * Od 2.1.0 adres jest LOGINEM, więc `Jan@X.pl` i `jan@x.pl` muszą być jedną osobą.
 * Migracja 9 przybija to w bazie (`idx_pilots_email_lower` - unikalność po `lower(email)`),
 * a ta funkcja pilnuje drugiej połowy: żeby w kolumnie stał JEDEN napis na osobę, a nie
 * ten, który akurat wpisano ostatni.
 *
 * ══ DOMENA, NIE ADAPTER - ta sama decyzja, co przy `clubCode.ts` ══
 * To jest reguła o KSZTAŁCIE WARTOŚCI, a nie szczegół Postgresa: adres wpisuje człowiek
 * w czterech różnych formularzach i przysyła dostawca tożsamości, a wszędzie znaczy to
 * samo. Druga kopia `trim().toLowerCase()` w adapterze rozjechałaby się przy pierwszej
 * poprawce (na przykład gdyby doszło obcinanie kropek w Gmailu - czego świadomie NIE
 * robimy, bo `jan.kowalski@` i `jankowalski@` to u innych dostawców dwie skrzynki).
 *
 * ODCZYTY porównują przez `lower()` po obu stronach i tak zostaje: w bazie mogą stać
 * wiersze sprzed migracji 9, a zapytanie, które ufa normalizacji zapisu, przestałoby
 * je widzieć.
 */

/** `  Jan@X.PL ` → `jan@x.pl`. Pusty napis i `null` przechodzą jako `null` - „bez adresu". */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Wariant dla pól opcjonalnych (`pilots.email` jest `NULL`-owalne). */
export function normalizeEmailOrNull(email: string | null | undefined): string | null {
  if (email == null) return null;
  const normalized = normalizeEmail(email);
  return normalized === '' ? null : normalized;
}
