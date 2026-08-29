/**
 * UZ Aero (serwer) - wspólna autoryzacja tras: token → claims.
 *
 * Osobny moduł, bo używa go każda trasa poza `/auth/*` i `/health` - a wspólny kod
 * autoryzacji ma mieć jedno miejsce, w którym audyt czyta, co dokładnie przepuszczamy.
 *
 * **Wejściem jest TOKEN, nie nagłówek** (zmiana 2026-07-31, przekrój sesji
 * przeglądarkowej). Telefon nosi go w `Authorization: Bearer`, panel w ciasteczku
 * `HttpOnly` - a autoryzacja nie ma prawa istnieć w dwóch kopiach, po jednej na kanał.
 * Skąd token pochodzi, wie wyłącznie `http/tokenFromRequest.ts`; tutaj zostaje sama
 * decyzja, a funkcje pozostają czyste (testowalne bez Fastify).
 *
 * Dwa poziomy, celowo rozdzielone:
 *  • `authorize` - „czy to w ogóle ktoś zalogowany" (trasy aplikacji pilota);
 *  • `authorizeAccount` - „czy wolno mu TO zrobić" (trasy panelu, `/admin/api/*`).
 * Rozdział jest istotny, bo rozróżnia 401 od 403, a to są dla użytkownika dwie różne
 * wiadomości: „zaloguj się" i „twoja rola tego nie obejmuje". Mockup panelu wymaga
 * podania POWODU odmowy (`design/admin/`, reguła „nigdy cichy brak"), więc odpowiedź
 * niesie też wymaganą zdolność.
 */

import type {
  PilotAuthSnapshot,
  PilotsPort,
  TokenService,
  VerifiedIdentity,
} from '../application/common/ports.ts';
import { can, type Capability } from '../domain/roles.ts';

export function authorize(tokens: TokenService, token: string | null): VerifiedIdentity | null {
  if (token == null) return null;
  return tokens.verify(token);
}

export type AuthOutcome =
  | { ok: true; account: PilotAuthSnapshot }
  | { ok: false; status: 401; body: { error: 'unauthorized' } }
  | { ok: false; status: 403; body: { error: 'forbidden'; required: Capability } };

/**
 * Czy token wydany w chwili `issuedAt` (sekundy epoki) jest STARSZY niż unieważnienie
 * poświadczeń konta (`pilots.credentials_valid_from`).
 *
 * To jedyny sposób, w jaki reset hasła i deaktywacja zrywają sesję PANELU: ta sesja
 * jest podpisanym JWT w ciasteczku `HttpOnly` i NIE MA dla niej wiersza w bazie, więc
 * `revokeAllFor` (kasujące `refresh_tokens`) nie ma czego unieważnić. Bez tej kontroli
 * wykradzione poświadczenie panelu przeżywałoby reset hasła nawet o osiem godzin.
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

/**
 * Brama uprawnień dla tras panelu. Zwraca gotowy status i ciało odpowiedzi, żeby
 * żadna trasa nie wymyślała własnego kształtu odmowy - 403 z innym polem w innym
 * miejscu to dokładnie ten rodzaj rozjazdu, przed którym broni istnienie tego pliku.
 *
 * ══ ROLA I AKTYWNOŚĆ IDĄ Z KONTA, NIE Z TOKENU (2026-08-01, przekrój A06) ══
 * Sesja panelu żyje `ADMIN_SESSION_TTL_SEC` = 8 h. Gdyby zdolność sprawdzać przeciw
 * roli zapisanej w claimach, deaktywacja konta i odebranie roli działałyby dopiero po
 * ośmiu godzinach - czyli przycisk „Deaktywuj" na ekranie A06 KŁAMAŁBY, a to jest
 * jedyna rzecz, której administrator po tym kliknięciu potrzebuje: pewności, że dostęp
 * naprawdę zniknął. `AuthCommands.refresh` stosuje tę zasadę od początku („Rola idzie
 * z KONTA, nie ze starego tokenu") - panel jest z nią teraz spójny.
 *
 * Koszt: jedno wyszukanie po kluczu głównym na żądanie panelu. Panel jest ruchem
 * znikomym (dwie osoby przy biurku), a ten sam odczyt obsługuje naraz autoryzację
 * i `Actor` do dziennika audytu - czyli rolę Z CHWILI AKCJI, a nie z chwili logowania.
 *
 * **Konto nieaktywne daje 401, nie 403.** To nie jest „twoja rola tego nie obejmuje",
 * tylko „za tym poświadczeniem nikt już nie stoi" - i panel ma na to jedną odpowiedź:
 * ekran logowania. Tak samo odpowiada dziś `GET /admin/api/me` na konto skasowane.
 *
 * ══ I TRZECI WARUNEK: POŚWIADCZENIE MUSI BYĆ NOWSZE NIŻ JEGO UNIEWAŻNIENIE ══
 * Istnienie konta, `active` i rola nie odpowiadają na pytanie „czy poświadczenia się
 * w międzyczasie nie zmieniły". Reset hasła przesuwa `credentials_valid_from`, a stary
 * token panelu ma `iat` sprzed tej chwili - i dopiero to go zabija (`credentialsRevoked`).
 * Kontrola jest DARMOWA: brama i tak czyta konto przy każdym żądaniu, więc znacznik
 * przyjeżdża tym samym `SELECT`-em. Konto czytamy PROJEKCJĄ bez hasha - brama go nie
 * weryfikuje, więc nie ma powodu, żeby wjeżdżał do warstwy HTTP.
 */
export async function authorizeAccount(
  tokens: TokenService,
  accounts: PilotsPort,
  token: string | null,
  capability: Capability,
): Promise<AuthOutcome> {
  const identity = authorize(tokens, token);
  if (identity == null) return { ok: false, status: 401, body: { error: 'unauthorized' } };

  const account = await accounts.authSnapshot(identity.pilotId);
  if (account == null || !account.active) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } };
  }
  if (credentialsRevoked(account.credentialsValidFrom, identity.issuedAt)) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } };
  }

  if (!can(account.role, capability)) {
    return { ok: false, status: 403, body: { error: 'forbidden', required: capability } };
  }
  return { ok: true, account };
}
