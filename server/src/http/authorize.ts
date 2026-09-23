/**
 * Ninerdeck (serwer) - wspólna autoryzacja tras: token → claims.
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
 * Trzy poziomy, celowo rozdzielone:
 *  • `authorize` - „czy to w ogóle ktoś zalogowany W KLUBIE" (trasy aplikacji pilota);
 *  • `authorizeOrg` - „czy wolno mu TO zrobić w klubie z tokenu" (trasy panelu klubu,
 *    `/admin/api/*`);
 *  • `authorizePlatform` - „czy to superadministrator" (trasy `platform.manage`, epik E).
 * Rozdział jest istotny, bo rozróżnia 401 od 403, a to są dla użytkownika dwie różne
 * wiadomości: „zaloguj się" i „twoja rola tego nie obejmuje". Mockup panelu wymaga
 * podania POWODU odmowy (`design/admin/`, reguła „nigdy cichy brak"), więc odpowiedź
 * niesie też wymaganą zdolność.
 */

import type {
  LoginSessionsPort,
  MembershipAuthSnapshot,
  PilotsPort,
  TokenService,
  VerifiedIdentity,
  VerifiedPlatformIdentity,
} from '../application/common/ports.ts';
import { credentialsRevoked } from '../domain/credentials.ts';
import { can, platformCan, type Capability, type PlatformRole } from '../domain/roles.ts';

export function authorize(tokens: TokenService, token: string | null): VerifiedIdentity | null {
  if (token == null) return null;
  return tokens.verify(token);
}

/**
 * Brama tras TELEFONU (epik C wielofirmowości, issue #99): token klubu I aktywne
 * członkostwo w tym klubie, czytane przy KAŻDYM żądaniu - dokładnie tak, jak panel
 * (`authorizeOrg` niżej), z tego samego powodu i tą samą regułą.
 *
 * ══ DLACZEGO TELEFON PYTA BAZĘ, SKORO TOKEN ŻYJE GODZINĘ ══
 * Do epiku C trasy telefonu wierzyły samemu podpisowi: token klubu = członek klubu.
 * Wyłączenie członkostwa działało więc na telefonie dopiero po wygaśnięciu tokenu,
 * a przez tę godzinę pilot wyłączony z klubu nadal wysyłał zdarzenia do jego dziennika
 * i pobierał jego flotę. Jeden odczyt po kluczu głównym `(org_id, pilot_id)` na żądanie
 * jest tańszy niż godzina cudzych zapisów - i jest tą samą kontrolą, którą issue #99
 * nazywa „PIC aktywnym członkiem klubu maszyny": maszyna należy do klubu z tokenu
 * (pilnuje ingest), a członkostwo w tym klubie pilnuje tu brama.
 *
 * `null` = 401 - „za tym poświadczeniem nikt już nie stoi": token zły, osoba
 * zablokowana platformowo, klub wyłączony, członkostwo nieaktywne albo poświadczenie
 * starsze niż jego unieważnienie. Telefon reaguje na 401 jak na wygaśnięcie: próbuje
 * odświeżyć, a refresh odmawia z tego samego powodu - i sync staje z nazwanym stanem.
 */
export async function authorizeMember(
  tokens: TokenService,
  accounts: PilotsPort,
  token: string | null,
): Promise<MembershipAuthSnapshot | null> {
  const identity = authorize(tokens, token);
  if (identity == null) return null;
  const account = await activeMembership(accounts, identity);
  // ══ TELEFON DOSTAJE JEDNO 401, A POWÓD CZYTA Z ODŚWIEŻENIA ══
  // Zdalne wylogowanie odbija tu tak samo, jak wygasły token - i tak ma być: aplikacja
  // na każde 401 sięga po `POST /auth/refresh`, a to ONO odpowiada `session_revoked`
  // i uruchamia baner z powodem (D7). Drugie ciało 401 na szesnastu trasach telefonu
  // byłoby polem, którego nikt po tamtej stronie nie czyta. Panel ma inaczej - patrz
  // `authorizeOrg`: tam nie ma czego odświeżać, więc powód musi paść od razu.
  return account == null || account.sessionRevoked ? null : account;
}

/**
 * Członkostwo AKTYWNE z bazy dla tożsamości z tokenu - wspólny rdzeń bramy telefonu
 * i bramy panelu. Trzy warunki naraz: osoba, klub i członkostwo są aktywne (koniunkcja
 * liczona w SQL-u, `authSnapshot`), a poświadczenie jest nowsze niż OBIE daty
 * unieważnienia (osoby i członkostwa, §3.4).
 */
async function activeMembership(
  accounts: PilotsPort,
  identity: VerifiedIdentity,
): Promise<MembershipAuthSnapshot | null> {
  const account = await accounts.authSnapshot(
    identity.pilotId,
    identity.orgId,
    identity.sessionId,
  );
  if (account == null || !account.active) return null;
  if (
    credentialsRevoked(account.credentialsValidFrom, identity.issuedAt) ||
    credentialsRevoked(account.membershipCredentialsValidFrom, identity.issuedAt)
  ) {
    return null;
  }
  return account;
}

/**
 * `session_revoked` obok `unauthorized` (2.1.0, §6): panel nie ma czego odświeżyć, więc
 * powód musi paść od razu - inaczej administrator wylogowany zdalnie widzi ekran
 * logowania bez słowa wyjaśnienia i próbuje wejść drugi raz tym samym ciasteczkiem.
 */
export type AuthOutcome =
  | { ok: true; account: MembershipAuthSnapshot }
  | { ok: false; status: 401; body: { error: 'unauthorized' | 'session_revoked' } }
  | { ok: false; status: 403; body: { error: 'forbidden'; required: Capability } };

/** Wynik bramy PLATFORMOWEJ - ten sam kształt odmów, inna tożsamość po `ok`. */
export type PlatformAuthOutcome =
  | { ok: true; identity: VerifiedPlatformIdentity; platformRole: PlatformRole }
  | { ok: false; status: 401; body: { error: 'unauthorized' | 'session_revoked' } }
  | { ok: false; status: 403; body: { error: 'forbidden'; required: Capability } };

const UNAUTHORIZED = { ok: false, status: 401, body: { error: 'unauthorized' } } as const;
const SESSION_REVOKED = { ok: false, status: 401, body: { error: 'session_revoked' } } as const;

/**
 * Brama uprawnień dla tras panelu KLUBU. Zwraca gotowy status i ciało odpowiedzi, żeby
 * żadna trasa nie wymyślała własnego kształtu odmowy - 403 z innym polem w innym
 * miejscu to dokładnie ten rodzaj rozjazdu, przed którym broni istnienie tego pliku.
 *
 * ══ ROLA I AKTYWNOŚĆ IDĄ Z CZŁONKOSTWA, NIE Z TOKENU (2026-08-01, przekrój A06) ══
 * Sesja panelu żyje `ADMIN_SESSION_TTL_SEC` = 8 h. Gdyby zdolność sprawdzać przeciw
 * roli zapisanej w claimach, wyłączenie członkostwa i odebranie roli działałyby dopiero
 * po ośmiu godzinach - czyli przycisk „Deaktywuj" na ekranie A06 KŁAMAŁBY, a to jest
 * jedyna rzecz, której administrator po tym kliknięciu potrzebuje: pewności, że dostęp
 * naprawdę zniknął. `AuthCommands.refresh` stosuje tę zasadę od początku („Rola idzie
 * z KONTA, nie ze starego tokenu") - panel jest z nią spójny.
 *
 * Koszt: jedno wyszukanie po kluczu głównym `(org_id, pilot_id)` na żądanie panelu. Panel
 * jest ruchem znikomym (dwie osoby przy biurku), a ten sam odczyt obsługuje naraz
 * autoryzację i `Actor` do dziennika audytu - czyli rolę Z CHWILI AKCJI.
 *
 * **Członkostwo nieaktywne (osoba zablokowana, klub wyłączony, członkostwo `disabled`
 * albo nieistniejące) daje 401, nie 403.** To nie jest „twoja rola tego nie obejmuje",
 * tylko „za tym poświadczeniem nikt już nie stoi" - i panel ma na to jedną odpowiedź:
 * ekran logowania.
 *
 * ══ I TRZECI WARUNEK: POŚWIADCZENIE MUSI BYĆ NOWSZE NIŻ JEGO UNIEWAŻNIENIE - OBA ══
 * Wyłączenie członkostwa przesuwa `memberships.credentials_valid_from`, deaktywacja
 * osoby - `pilots.credentials_valid_from` (wielofirmowość §3.4). Token starszy niż
 * KTÓRAKOLWIEK z tych dat ginie. Bez daty na członkostwie wyłączenie w klubie A
 * wylogowywałoby z klubu B albo - gorzej - nie wylogowywałoby z A.
 */
export async function authorizeOrg(
  tokens: TokenService,
  accounts: PilotsPort,
  token: string | null,
  capability: Capability,
): Promise<AuthOutcome> {
  // Nie przez `authorizeMember`: tamta droga zwija zdalne wylogowanie do zwykłego 401,
  // bo telefon i tak sięga po odświeżenie. Panel potrzebuje POWODU, więc czyta ten sam
  // odczyt wprost.
  const identity = authorize(tokens, token);
  if (identity == null) return UNAUTHORIZED;
  const account = await activeMembership(accounts, identity);
  if (account == null) return UNAUTHORIZED;
  if (account.sessionRevoked) return SESSION_REVOKED;

  if (!can(account.capabilities, capability)) {
    return { ok: false, status: 403, body: { error: 'forbidden', required: capability } };
  }
  return { ok: true, account };
}

/**
 * Brama PLATFORMOWA - superadministrator bez klubu (wielofirmowość §3.3, §8.1).
 *
 * Rola idzie z OSOBY (`pilots.platform_role`), czytanej przy każdym żądaniu z tego
 * samego powodu, co członkostwo wyżej: odebranie roli platformowej ma działać od razu.
 * Osoba zablokowana platformowo albo skasowana → 401; osoba bez roli platformowej →
 * 403 z wymaganą zdolnością - token platformowy dostaje wyłącznie ktoś, kto ją miał
 * przy logowaniu, więc ta gałąź znaczy „odebrano mu ją w międzyczasie".
 */
export async function authorizePlatform(
  tokens: TokenService,
  accounts: PilotsPort,
  sessions: LoginSessionsPort,
  token: string | null,
  capability: Capability,
): Promise<PlatformAuthOutcome> {
  const identity = token == null ? null : tokens.verifyPlatform(token);
  if (identity == null) return UNAUTHORIZED;

  const account = await accounts.findById(identity.pilotId);
  if (account == null || !account.active) return UNAUTHORIZED;
  // Sesja platformowa nie ma członkostwa, więc nie doczepi się do `authSnapshot` -
  // pyta osobno. To jest najwrażliwsza sesja na serwerze i jedyna, która otwiera moduł
  // Organizacje, więc kosztu jednego odczytu po kluczu głównym nie ma tu co żałować.
  if (identity.sessionId != null && (await sessions.isRevoked(identity.sessionId, account.id))) {
    return SESSION_REVOKED;
  }
  if (!platformCan(account.platformRole, capability) || account.platformRole == null) {
    return { ok: false, status: 403, body: { error: 'forbidden', required: capability } };
  }
  return { ok: true, identity, platformRole: account.platformRole };
}
