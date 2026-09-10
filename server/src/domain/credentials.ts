/**
 * Ninerdeck (serwer) - czy poświadczenie jest STARSZE niż unieważnienie poświadczeń.
 *
 * Jedna reguła dla trzech miejsc: bramy panelu (`http/authorize.ts`), tokenu osoby
 * (`GET /auth/memberships`) i dołączania kodem (`POST /auth/join`). Do epiku D mieszkała
 * w bramie HTTP, ale warstwa aplikacji nie ma prawa importować z `http/` - a druga kopia
 * porównania to pierwsze miejsce, w którym jedna strona zaokrągli w stronę zaufania.
 *
 * `validFrom` = `pilots.credentials_valid_from` albo `memberships.credentials_valid_from`
 * (wielofirmowość §3.4). To jedyny sposób, w jaki deaktywacja zrywa sesję PANELU: ta sesja
 * jest podpisanym JWT w ciasteczku `HttpOnly` i NIE MA dla niej wiersza w bazie, więc
 * `revokeAllFor` (kasujące `refresh_tokens`) nie ma czego unieważnić. Bez tej kontroli
 * wykradzione poświadczenie panelu przeżywałoby odcięcie nawet o osiem godzin.
 *
 * Porównanie jest ŚCIŚLE mniejsze i po milisekundach, a `issuedAt` ma rozdzielczość
 * sekundy - więc token wydany w tej samej sekundzie, w której padło unieważnienie,
 * zostaje ODRZUCONY. Zaokrąglenie działa w stronę odebrania dostępu; koszt to co
 * najwyżej jedno powtórzone logowanie, a odwrotny błąd byłby luką.
 */
export function credentialsRevoked(validFrom: Date | null, issuedAt: number): boolean {
  if (validFrom == null) return false;
  return issuedAt * 1000 < validFrom.getTime();
}
