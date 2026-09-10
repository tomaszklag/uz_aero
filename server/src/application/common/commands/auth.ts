/**
 * UZ Aero (serwer) - komendy uwierzytelnienia (§3.0, §4.6).
 *
 * Logowanie to jedyna operacja w systemie, która WYMAGA sieci po stronie telefonu
 * (jednorazowe provisioning) - dlatego jej wynik niesie wszystko, czego aplikacja
 * potrzebuje do pracy offline: tożsamość, klub, parę tokenów. Cache referencyjny
 * telefon dociąga osobnym zapytaniem.
 *
 * Model tokenów (decyzja 2026-07-22): JWT krótki (praca z API), refresh długi
 * i ROTOWANY (jednorazowy - zużycie wydaje następny). Wygasły JWT nie wylogowuje:
 * telefon po prostu odświeża przy najbliższej sieci.
 *
 * ══ HASŁA ZNIKŁY (2026-09-04, `docs/logowanie-google.md`) ══
 * Jedyną drogą do konta jest dostawca zewnętrzny. Konsekwencja, którą widać w tym
 * pliku: `verifyCredentials` i wyrównywanie czasu odpowiedzi przy nieznanym loginie
 * przestały istnieć, bo nie ma już sekretu, którego trzeba bronić przed enumeracją -
 * tożsamości dowodzi podpisany token Google, a nie coś, co użytkownik wpisuje.
 *
 * ══ TU ZAPADA DECYZJA O DOSTĘPIE I MA DOKŁADNIE JEDEN KSZTAŁT ══
 * Aktywne CZŁONKOSTWO → tokeny KLUBU. Wszystko inne → BRAK tokenu pilota. Nie ma tu
 * stanu pośredniego „trochę zalogowany": osoba bez klubu dostaje token OSOBY, który
 * otwiera dwie trasy bez klubu i nie jest tożsamością (patrz `TokenService` w portach).
 *
 * ══ OSOBA POWSTAJE PRZY PIERWSZYM LOGOWANIU (wielofirmowość §4, epik D, issue #100) ══
 * Do 2.0.0 bramą był brak KONTA: nieznajomy dostawał zgłoszenie w `external_identities`
 * i czekał, aż administrator założy mu konto. Od epiku D bramą jest brak CZŁONKOSTWA -
 * piętro wyżej: nieznajomy dostaje od razu wiersz `pilots` (bez klubu), a to, czy wolno
 * mu wejść, rozstrzyga członkostwo `active` w jakimś klubie. Zgłoszenie do klubu składa
 * kodem klubu (`POST /auth/join`, `application/mobile/commands/join.ts`), decyduje
 * administrator KLUBU. Tożsamość Google jest przez to zawsze podpięta - statusów
 * `pending`/`rejected` na niej nie ma; mieszkają na członkostwie.
 *
 * ══ KLUB W TOKENIE (wielofirmowość §5–§6, issue #98) ══
 * Osoba jest jedna, członkostw bywa kilka; token pilota jest tokenem DLA KLUBU. Klub
 * aktywny wybiera reguła §5: ostatnio używany (z najświeższego refresha), inaczej jedyny
 * albo pierwszy alfabetycznie. Przełączenie klubu (`POST /auth/switch`) dochodzi
 * w epiku F.
 */

import { credentialsRevoked } from '../../../domain/credentials.ts';
import type { MembershipStatus } from '../../../domain/memberships.ts';
import {
  can,
  capabilitiesOf,
  platformCapabilitiesOf,
  type Capability,
  type PilotRole,
  type PlatformRole,
} from '../../../domain/roles.ts';
import type {
  Clock,
  ExternalIdentitiesPort,
  ExternalIdentity,
  IdentityProviderPort,
  LoginSurface,
  Membership,
  PilotAccount,
  PilotsPort,
  RefreshTokensPort,
  TokenService,
} from '../ports.ts';

/** Czas życia JWT (s) - krótki, bo odświeżenie jest tanie i automatyczne. */
export const ACCESS_TTL_SEC = 60 * 60;

/** Czas życia refresh tokenu (dni) - pokrywa sezon pracy w terenie bez logowania. */
export const REFRESH_TTL_DAYS = 90;

/**
 * Czas życia tokenu OSOBY (dni).
 *
 * Długi, bo mierzy cierpliwość administratora klubu, nie pilota: człowiek, który wpisał
 * kod klubu w piątek, ma po weekendzie zobaczyć swój stan bez przechodzenia przez Google
 * od nowa. Ryzyko jest znikome - token nie jest tożsamością i otwiera dwie trasy bez klubu.
 */
export const PERSON_TTL_DAYS = 30;

/**
 * Czas życia sesji panelu (s) - jeden dzień pracy przy biurku.
 *
 * Przeglądarka NIE dostaje refresh tokenu (`docs/architektura-panelu-serwer.md` §8.4):
 * obietnica §3.0 „wygasły token ≠ wylogowanie" istnieje dla pilota w terenie, a nie
 * dla administratora przy biurku - panelowi wolno powiedzieć „zaloguj się ponownie".
 * Drugie długożyciowe poświadczenie w przeglądarce kupiłoby wyłącznie powierzchnię ataku.
 */
export const ADMIN_SESSION_TTL_SEC = 8 * 60 * 60;

/** Klub w odpowiedziach logowania - tyle, ile aplikacja potrzebuje, żeby go NAZWAĆ. */
export interface OrgRef {
  id: string;
  slug: string;
  name: string;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
  /**
   * `role` jedzie w odpowiedzi, a nie tylko w tokenie: panel musi wiedzieć od razu po
   * zalogowaniu, które sekcje pokazać, a nie zgadywać po odmowach z kolejnych tras.
   * `code` i `role` są kodem i rolą Z CZŁONKOSTWA w klubie `org`.
   */
  pilot: { id: string; code: string; name: string; role: PilotRole };
  /** Klub, DLA KTÓREGO wydano tę parę (wielofirmowość §6). */
  org: OrgRef;
  /**
   * Komplet klubów osoby - z tego telefon wie, czy rysować przełącznik na 13a
   * (wyłącznie przy więcej niż jednym członkostwie, §7.3) i plakietkę klubu na 01e.
   */
  memberships: { org: OrgRef; code: string; role: PilotRole }[];
}

/**
 * Członkostwo tak, jak widzą je ekrany 00C/00D/00E i lista klubów na 13A: klub nazwany,
 * stan, powód odrzucenia i chwile - bez znaczników unieważnienia, które są sprawą bramy.
 */
export interface ClubMembershipView {
  org: OrgRef;
  /** Klub wyłączony przez superadministratora nie wpuszcza nikogo, choć członkostwo stoi. */
  clubActive: boolean;
  status: MembershipStatus;
  code: string | null;
  role: PilotRole;
  rejectReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

/**
 * Stan osoby wobec klubów - to, co aplikacja czyta, żeby wybrać ekran (§5):
 * `pending` → 00C, `rejected` → 00D, `none` → 00E; `active` wyłącznie w odpowiedzi na
 * token KLUBU (13A), bo z tokenem osoby aktywne członkostwo znaczy „wydaj tokeny".
 * Pierwszeństwo: active > pending > rejected > none - osoba, która czeka w jednym klubie
 * i została odrzucona w drugim, ma na ekranie czekanie, nie odmowę.
 */
export type ClubsStatus = 'active' | 'pending' | 'rejected' | 'none';

export interface ClubsView {
  status: ClubsStatus;
  memberships: ClubMembershipView[];
  /**
   * Kim jest pytający - imię i adres Z KONTA, do plakietki na ekranach 00C/00D/00E.
   *
   * Jedzie w tej samej odpowiedzi, bo odpowiada na pytanie zadawane razem z tamtym:
   * „na co czekam" ma sens dopiero z „pod którym kontem". Aplikacja nie ma skąd wziąć
   * tego sama - token osoby niesie identyfikator, a nie profil, a wyłuskiwanie danych
   * z tokenu Google byłoby drugim, niesprawdzanym źródłem tych samych napisów.
   */
  person: { name: string; email: string | null };
}

export type ProviderLoginResult =
  | { ok: true; tokens: AuthTokens }
  /** Podpis, `iss`, `aud` albo termin nie przeszły - albo to nie jest nasz token. */
  | { ok: false; reason: 'invalid_token' }
  /** Osoba zablokowana PLATFORMOWO (`pilots.active`). */
  | { ok: false; reason: 'account_disabled' }
  /**
   * Osoba jest, aktywnego członkostwa nie ma (wielofirmowość §4): przyjęte (202),
   * z tokenem OSOBY na 00C/00D/00E - jedyny wynik bez tokenów pilota, który nie jest odmową.
   */
  | { ok: false; reason: 'no_club'; personToken: string; clubs: ClubsView };

/** Konto tak, jak widzi je panel po zalogowaniu - bez pól technicznych. */
export interface PanelPilot {
  id: string;
  code: string;
  name: string;
  role: PilotRole;
  /** Klub sesji panelu (wielofirmowość §8.2) - w SESJI, nie w nagłówku. */
  org: OrgRef;
}

/**
 * Klub, do którego ta osoba może PRZEŁĄCZYĆ sesję panelu (mockup `00a-wybor-klubu`).
 *
 * Kod i rola są tu po to, żeby karta wyboru mogła napisać drugą linię („administrator ·
 * Twój kod TMK") - a nie po to, żeby panel cokolwiek z nich wnioskował: o tym, co wolno
 * w klubie, rozstrzyga zdolność z sesji WYDANEJ dla tego klubu.
 */
export interface PanelScopeClub {
  org: OrgRef;
  code: string;
  role: PilotRole;
}

/**
 * Zakresy sesji panelu: kluby z rolą panelu i - osobno - platforma (issue #101, E2).
 *
 * ══ JEDZIE W KAŻDEJ ODPOWIEDZI O SESJI, A NIE OSOBNĄ TRASĄ ══
 * Bo odpowiada na pytanie, które panel zadaje przy KAŻDYM wczytaniu: czy rysować
 * przełącznik klubu i czy po zalogowaniu iść na ekran wyboru. Osobna trasa znaczyłaby
 * drugie żądanie przy każdym starcie panelu po to samo, a przy jednym członkostwie -
 * żądanie o odpowiedź, która nic nie zmienia.
 *
 * Koszt: jeden odczyt członkostw osoby przy `GET /me`. Panel to dwie osoby przy biurku
 * (ten sam rachunek, co przy `authorizeOrg`), a lista jest WŁASNYMI członkostwami
 * pytającego - nie wycieka z niej nic, czego on sam nie wie.
 */
export interface PanelScopes {
  clubs: PanelScopeClub[];
  /** Czy ta osoba ma zakres PLATFORMY (moduł Organizacje) - `pilots.platform_role`. */
  platform: boolean;
}

/**
 * Sesja przeglądarkowa: token do CIASTECZKA (nie do ciała odpowiedzi) + kto się zalogował.
 *
 * DWA kształty, bo dwa rodzaje sesji (wielofirmowość §3.3): administrator KLUBU pracuje
 * w klubie z tokenu; SUPERADMINISTRATOR nie ma klubu i dostaje token platformowy, który
 * otwiera wyłącznie trasy `platform.manage` (moduł Organizacje, epik E).
 *
 * `scopes` niosą OBA kształty, bo przełącznik jest dwukierunkowy: superadministrator
 * z członkostwem `admin` schodzi z platformy do klubu, a administrator klubu wraca.
 */
export type PanelSession =
  | {
      kind: 'org';
      token: string;
      ttlSec: number;
      pilot: PanelPilot;
      capabilities: readonly Capability[];
      scopes: PanelScopes;
    }
  | {
      kind: 'platform';
      token: string;
      ttlSec: number;
      pilot: { id: string; name: string; platformRole: PlatformRole };
      capabilities: readonly Capability[];
      scopes: PanelScopes;
    };

export type PanelLoginResult =
  | { ok: true; session: PanelSession }
  | { ok: false; reason: 'invalid_token' }
  | { ok: false; reason: 'account_disabled' }
  /**
   * `no_panel_access` jest ODRĘBNY i to jest decyzja produktowa z mockupu A00: konto
   * loguje się POPRAWNIE, a odbija się o rolę - i ma zobaczyć dlaczego („panel jest dla
   * administratora; pilot pracuje w aplikacji na telefonie"). Od wielofirmowości znaczy:
   * w ŻADNYM klubie nie jest administratorem i nie jest superadministratorem - także
   * wtedy, gdy klubu nie ma wcale (osoba po pierwszym logowaniu). Dawne `not_registered`
   * zniknęło razem z bramą „brak konta": konto jest zawsze, pytaniem jest członkostwo.
   */
  | { ok: false; reason: 'no_panel_access' };

/**
 * Kto stoi za tokenem TRASY BEZ KLUBU (`GET /auth/memberships`, `POST /auth/join`;
 * wielofirmowość §6): osoba z tokenem OSOBY albo pilot z tokenem DOWOLNEGO klubu -
 * pilot klubu A dołącza do B z ustawień (13A) własnym tokenem, nie tokenem osoby.
 * `kind` rozstrzyga, czy odpowiedź może nieść tokeny klubu (wyłącznie dla tokenu osoby).
 */
export interface PersonRequest {
  pilotId: string;
  issuedAt: number;
  kind: 'person' | 'club';
}

/**
 * Kto stoi za CIASTECZKIEM sesji panelu - bez rozstrzygania, którego rodzaju jest.
 *
 * Przełączenie zakresu (`POST /admin/api/auth/switch`) zadaje pytanie o osobę, a nie
 * o jej bieżący klub: administrator klubu A przechodzi do B, a superadministrator
 * schodzi z platformy do klubu. Rodzaj tokenu, którym przyszedł, nie ma tu znaczenia -
 * znaczenie ma to, czy w CELU jest aktywne członkostwo z rolą panelu.
 */
export interface PanelRequest {
  pilotId: string;
  issuedAt: number;
}

/**
 * Wynik przełączenia zakresu. `not_found` dla celu, którego ta osoba nie ma - cudzy
 * klub jest dla niej NIEISTNIEJĄCY, nie „zabroniony" (epik C, issue #99: 404 zamiast
 * 403 nie potwierdza cudzego zasobu). `unauthorized` = za ciasteczkiem nikt już nie stoi.
 */
export type PanelSwitchResult =
  | { ok: true; session: PanelSession }
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'not_found' };

/**
 * Wynik przełączenia klubu w TELEFONIE (`POST /auth/switch`, wielofirmowość §6).
 *
 * `not_found` dla klubu, którego ta osoba nie ma albo w którym nie jest aktywna - cudzy
 * klub jest dla niej NIEISTNIEJĄCY, nie „zabroniony" (epik C, issue #99: 403 potwierdzałoby
 * cudzy zasób). `unauthorized` = za tokenem nikt już nie stoi albo to nie jest token klubu.
 */
export type ClubSwitchResult =
  | { ok: true; tokens: AuthTokens }
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'not_found' };

/**
 * Odpowiedź `GET /auth/memberships`. `approved` niesie TOKENY, bo pilot zatwierdzony
 * w międzyczasie ma wejść do aplikacji bez ponownego przechodzenia przez Google.
 * `unknown` = za tym tokenem nikt już nie stoi (osoba zablokowana, poświadczenie
 * unieważnione, token już zrealizowany).
 */
export type MembershipStatusResult =
  | { kind: 'clubs'; clubs: ClubsView }
  | { kind: 'approved'; tokens: AuthTokens }
  | { kind: 'unknown' };

export class AuthCommands {
  constructor(
    private readonly pilots: PilotsPort,
    private readonly refreshTokens: RefreshTokensPort,
    private readonly identities: ExternalIdentitiesPort,
    private readonly provider: IdentityProviderPort,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    /**
     * Identyfikator NOWEJ OSOBY (pierwsze logowanie) jako funkcja, nie port - ta sama
     * decyzja, co `newId` w komendach panelu: composition root podaje `randomUUID`,
     * a drugiej implementacji nie ma.
     */
    private readonly newId: () => string,
  ) {}

  /** Logowanie telefonu (§3.0) - prowisioning urządzenia albo token osoby bez klubu. */
  async loginWithProvider(idToken: string): Promise<ProviderLoginResult> {
    const resolved = await this.resolve(idToken, 'mobile');
    if (resolved.kind === 'invalid') return { ok: false, reason: 'invalid_token' };
    const { account, identity } = resolved;
    if (!account.active) return { ok: false, reason: 'account_disabled' };

    const memberships = await this.pilots.memberships(account.id);
    const active = await this.pickActive(account.id, memberships);
    if (active == null) {
      // Osoba bez klubu (§4): token OSOBY na ekrany 00C/00D/00E. Nie stemplujemy
      // `lastLoginAt` - ten stempel jest JEDNORAZOWOŚCIĄ tokenu osoby (patrz
      // `membershipStatus`), więc pada dopiero przy wejściu do klubu.
      return {
        ok: false,
        reason: 'no_club',
        personToken: this.tokens.signPerson({ pilotId: account.id }, PERSON_TTL_DAYS * 24 * 3600),
        clubs: clubsView(memberships, personOf(account)),
      };
    }

    await this.identities.markLogin(identity.provider, identity.subject, this.clock.now());
    return { ok: true, tokens: await this.issueFor(account, active) };
  }

  /**
   * Logowanie do PANELU: ten sam dostawca, inny wynik.
   *
   * Różnice wobec telefonu są dwie i obie są istotne:
   *  • brama `panel.access` - członkostwo bez roli panelu NIE DOSTAJE sesji (nie tylko
   *    pustego ekranu): token, którym nic nie wolno, byłby poświadczeniem bez powodu;
   *  • brak refresh tokenu - przeglądarka nie dostaje drugiego poświadczenia (§8.4).
   *    Wołanie `loginWithProvider()` „dla wygody" i porzucanie refresha zostawiałoby
   *    wiersz w `refresh_tokens` po każdym wejściu do panelu, czyli martwe sesje bez końca.
   *
   * Klub sesji wybieramy spośród członkostw Z ROLĄ PANELU tą samą regułą, co dla telefonu
   * (ostatnio używany → jedyny → pierwszy alfabetycznie). Ekran wyboru klubu przy kilku
   * członkostwach administratora i przełącznik „Zmień klub" to epik E - do tego czasu
   * wybór jest deterministyczny, a nie interaktywny.
   *
   * Superadministrator BEZ członkostwa `admin` dostaje sesję PLATFORMOWĄ (§3.3) - ona
   * otwiera wyłącznie moduł Organizacje. Osoba, która jest jednym i drugim, wchodzi jako
   * administrator klubu: sesja klubu ma zdolności, których platformowa nie ma, a przejście
   * na „Organizacje" jest dla niej przełączeniem kontekstu (epik E), nie logowaniem.
   *
   * Osoba bez klubu NIE dostaje tu tokenu osoby: ekrany oczekiwania i kodu klubu są
   * funkcją aplikacji pilota, a nie back-office'u - dla panelu to `no_panel_access`.
   */
  async panelLoginWithProvider(idToken: string): Promise<PanelLoginResult> {
    const resolved = await this.resolve(idToken, 'panel');
    if (resolved.kind === 'invalid') return { ok: false, reason: 'invalid_token' };
    if (!resolved.account.active) return { ok: false, reason: 'account_disabled' };

    const { account, identity } = resolved;
    const memberships = await this.pilots.memberships(account.id);
    const admin = await this.pickActive(account.id, memberships, (m) => can(m.role, 'panel.access'));

    const scopes = panelScopesOf(memberships, account.platformRole);

    if (admin == null) {
      if (account.platformRole == null) return { ok: false, reason: 'no_panel_access' };
      await this.identities.markLogin(identity.provider, identity.subject, this.clock.now());
      return { ok: true, session: platformSession(this.tokens, account, account.platformRole, scopes) };
    }

    await this.identities.markLogin(identity.provider, identity.subject, this.clock.now());
    return { ok: true, session: orgSession(this.tokens, account, admin, scopes) };
  }

  /**
   * Zakresy sesji panelu dla osoby - kluby z rolą panelu i platforma.
   *
   * Czyta wyłącznie z BAZY, nigdy z claimów ciasteczka: sesja żyje osiem godzin, a lista
   * klubów zmienia się decyzją innego administratora. Ta sama zasada, przez którą
   * `authorizeOrg` pyta o członkostwo przy każdym żądaniu.
   */
  async panelScopes(pilotId: string): Promise<PanelScopes> {
    const account = await this.pilots.findById(pilotId);
    if (account == null || !account.active) return { clubs: [], platform: false };
    return panelScopesOf(await this.pilots.memberships(pilotId), account.platformRole);
  }

  /**
   * Kto stoi za ciasteczkiem panelu - token KLUBU albo PLATFORMOWY, bez rozstrzygania
   * który. `null` = ani jeden, ani drugi (token osoby tu NIE przechodzi: osoba bez klubu
   * nie ma czego przełączać).
   *
   * Metoda stoi tutaj, a nie w trasie z wstrzykniętym `TokenService`, z tego samego
   * powodu, co `identifyPerson`: warstwa HTTP ma zostać cienka, a jedno miejsce ma
   * pokazywać komplet - kto wydaje sesję panelu i kto ją przyjmuje.
   */
  identifyPanel(token: string | null): PanelRequest | null {
    if (token == null) return null;
    const club = this.tokens.verify(token);
    if (club != null) return { pilotId: club.pilotId, issuedAt: club.issuedAt };
    const platform = this.tokens.verifyPlatform(token);
    if (platform != null) return { pilotId: platform.pilotId, issuedAt: platform.issuedAt };
    return null;
  }

  /**
   * Przełączenie zakresu panelu: `orgId` = klub, `null` = platforma (moduł Organizacje).
   * Nowa para nie powstaje - sesja panelu to JEDEN token w ciasteczku (§8.4).
   *
   * ══ CEL SPRAWDZAMY OD ZERA, ŹRÓDŁA NIE PYTAMY O NIC POZA TOŻSAMOŚCIĄ ══
   * Administrator wyłączony w klubie A ma prawo przejść do B - o wejściu rozstrzyga
   * członkostwo w CELU. Sprawdzamy więc: osoba aktywna platformowo, w celu aktywne
   * członkostwo z rolą panelu (a dla platformy - rola platformowa) i klub działa.
   *
   * ══ I TA SAMA BRAMA, CO PRZY TOKENIE OSOBY: UNIEWAŻNIENIE POŚWIADCZEŃ ══
   * Ciasteczko starsze niż `credentials_valid_from` osoby ALBO celu nie mieni nowej
   * sesji. Bez tego wyłączenie członkostwa dawałoby się obejść przełączeniem tam
   * i z powrotem ciasteczkiem sprzed wyłączenia - a to jest dokładnie ten scenariusz,
   * który audyt 2026-09-05 znalazł przy tokenie rejestracyjnym.
   */
  async panelSwitch(request: PanelRequest, target: string | null): Promise<PanelSwitchResult> {
    const account = await this.pilots.findById(request.pilotId);
    if (account == null || !account.active) return { ok: false, reason: 'unauthorized' };
    if (credentialsRevoked(account.credentialsValidFrom, request.issuedAt)) {
      return { ok: false, reason: 'unauthorized' };
    }

    const memberships = await this.pilots.memberships(account.id);
    const scopes = panelScopesOf(memberships, account.platformRole);

    if (target == null) {
      if (account.platformRole == null) return { ok: false, reason: 'not_found' };
      return {
        ok: true,
        session: platformSession(this.tokens, account, account.platformRole, scopes),
      };
    }

    const membership = memberships.find((m) => m.orgId === target);
    if (
      membership == null ||
      !isActive(membership) ||
      !can(membership.role, 'panel.access') ||
      credentialsRevoked(membership.credentialsValidFrom, request.issuedAt)
    ) {
      return { ok: false, reason: 'not_found' };
    }

    return { ok: true, session: orgSession(this.tokens, account, membership, scopes) };
  }

  /**
   * Kto stoi za tokenem trasy BEZ KLUBU - `null`, gdy to ani token osoby, ani klubu.
   *
   * Metoda stoi tutaj, a nie w trasie z wstrzykniętym `TokenService`, żeby warstwa HTTP
   * została cienka i żeby istniało jedno miejsce, w którym widać komplet: kto wydaje
   * token osoby (`loginWithProvider`) i kto go przyjmuje. Token platformowy tu NIE
   * przechodzi: superadministrator nie ma czego zgłaszać żadnemu klubowi.
   */
  identifyPerson(token: string | null): PersonRequest | null {
    if (token == null) return null;
    const person = this.tokens.verifyPerson(token);
    if (person != null) return { pilotId: person.pilotId, issuedAt: person.issuedAt, kind: 'person' };
    const club = this.tokens.verify(token);
    if (club != null) return { pilotId: club.pilotId, issuedAt: club.issuedAt, kind: 'club' };
    return null;
  }

  /**
   * Stan osoby wobec klubów (`GET /auth/memberships`) - ekran 00C pyta o to co
   * kilkanaście sekund, 13A raz przy otwarciu.
   *
   * Zwraca też `approved` z tokenami i to jest cała wartość tej trasy dla tokenu OSOBY:
   * pilot zatwierdzony w międzyczasie ma wejść do aplikacji bez przechodzenia przez
   * Google od nowa. Token KLUBU tokenów nie dostaje nigdy - kto go ma, już wszedł;
   * nowy klub bierze przełączeniem (`POST /auth/switch`, epik F).
   *
   * ══ WYDAJE TOKENY PILOTA DOKŁADNIE RAZ (audyt 2026-09-05) ══
   * Reguła przeniesiona z tokenu rejestracyjnego: skopiowany token osoby nie może być
   * fabryką refreshów, której nie zrywa deaktywacja. Trzy bramy:
   *  • wejście do klubu PÓŹNIEJSZE niż wydanie tokenu (`lastLoginAt` tożsamości, stempel
   *    z logowania Googlem albo z tej trasy) → `unknown`: ten token już zrobił swoje.
   *    Porównanie sekundowe i w stronę odmowy - wejście w tej samej sekundzie, w której
   *    wydano token, liczy się jako późniejsze;
   *  • token wydany PRZED `credentials_valid_from` osoby ALBO członkostwa → `unknown` -
   *    ta sama reguła, co brama panelu: deaktywacja ma odcinać wszystko, także
   *    poświadczenie, które jeszcze nikt nie zrealizował;
   *  • stempel `lastLoginAt` pada PRZED wydaniem: to on zamyka drogę drugiemu wywołaniu.
   */
  async membershipStatus(request: PersonRequest): Promise<MembershipStatusResult> {
    const account = await this.pilots.findById(request.pilotId);
    if (account == null || !account.active) return { kind: 'unknown' };
    if (credentialsRevoked(account.credentialsValidFrom, request.issuedAt)) {
      return { kind: 'unknown' };
    }

    const memberships = await this.pilots.memberships(account.id);
    const active = await this.pickActive(account.id, memberships);
    if (active == null || request.kind === 'club') {
      return { kind: 'clubs', clubs: clubsView(memberships, personOf(account)) };
    }

    const identity = await this.identities.findByPilot(account.id);
    if (identity == null) return { kind: 'unknown' };
    if (enteredSince(identity.lastLoginAt, request.issuedAt)) return { kind: 'unknown' };
    if (credentialsRevoked(active.credentialsValidFrom, request.issuedAt)) {
      return { kind: 'unknown' };
    }

    await this.identities.markLogin(identity.provider, identity.subject, this.clock.now());
    return { kind: 'approved', tokens: await this.issueFor(account, active) };
  }

  /**
   * Przełączenie klubu w TELEFONIE (`POST /auth/switch { orgId }`; wielofirmowość §6,
   * epik F) - NOWA PARA TOKENÓW dla klubu docelowego, nie nagłówek w żądaniu.
   *
   * ══ WYŁĄCZNIE TOKEN KLUBU, NIGDY TOKEN OSOBY ══
   * Kto ma token klubu, już raz wszedł - przełączenie niczego nie otwiera po raz
   * pierwszy. Token OSOBY ma własną, jednorazową drogę do tokenów klubu
   * (`membershipStatus`: stempel `lastLoginAt` zamyka ją po pierwszym wywołaniu);
   * gdyby przechodził tędy, byłby fabryką par tokenów z pominięciem tej bramy -
   * dokładnie ten scenariusz, który audyt 2026-09-05 zamknął przy tokenie rejestracyjnym.
   *
   * ══ CEL SPRAWDZAMY OD ZERA, ŹRÓDŁA PYTAMY WYŁĄCZNIE O TOŻSAMOŚĆ (jak `panelSwitch`) ══
   * Pilot wyłączony w klubie A ma prawo przejść do B: o wejściu rozstrzyga członkostwo
   * w CELU. Reguła unieważnienia poświadczeń jest ta sama - token starszy niż
   * `credentials_valid_from` osoby ALBO celu nie mieni nowej pary, inaczej wyłączenie
   * członkostwa dałoby się obejść przełączeniem tam i z powrotem starym tokenem.
   *
   * ══ STARY REFRESH ZOSTAJE WAŻNY I TO JEST ŚWIADOME ══
   * Trasa uwierzytelnia się tokenem DOSTĘPU, więc refresha porzucanego klubu nie zna
   * i nie ma czego skasować. Nic to nie kupuje atakującemu (to ta sama osoba i to samo
   * konto), a klub aktywny przy następnym logowaniu i tak jest ten, na który
   * przełączono: `lastOrgFor` czyta NAJŚWIEŻSZY wiersz, a ten powstał przed chwilą tutaj.
   */
  async switchClub(request: PersonRequest, orgId: string): Promise<ClubSwitchResult> {
    if (request.kind !== 'club') return { ok: false, reason: 'unauthorized' };

    const account = await this.pilots.findById(request.pilotId);
    if (account == null || !account.active) return { ok: false, reason: 'unauthorized' };
    if (credentialsRevoked(account.credentialsValidFrom, request.issuedAt)) {
      return { ok: false, reason: 'unauthorized' };
    }

    const membership = await this.pilots.membership(account.id, orgId);
    if (
      membership == null ||
      !isActive(membership) ||
      credentialsRevoked(membership.credentialsValidFrom, request.issuedAt)
    ) {
      return { ok: false, reason: 'not_found' };
    }

    return { ok: true, tokens: await this.issueFor(account, membership) };
  }

  /**
   * Rotacja: zużywa refresh i wydaje świeżą parę ATOMOWO, DLA TEGO SAMEGO KLUBU.
   * `null` = token martwy.
   *
   * Ten sam klub, bo refresh jest parą DLA KLUBU (§6): przełączenie to osobna trasa.
   * Członkostwo czytamy Z BAZY, nie ze starego tokenu - odebranie roli i wyłączenie
   * członkostwa mają zadziałać przy najbliższym odświeżeniu, a nie po wygaśnięciu refresha.
   */
  async refresh(refreshToken: string): Promise<AuthTokens | null> {
    const expiresAt = new Date(
      this.clock.now().getTime() + REFRESH_TTL_DAYS * 24 * 3_600_000,
    );
    const rotated = await this.refreshTokens.rotate(refreshToken, expiresAt);
    if (rotated == null) return null;

    const account = await this.pilots.findById(rotated.pilotId);
    // Konto skasowane/wyłączone PO rotacji: token przepada razem z odmową - i dobrze,
    // dezaktywacja ma odcinać dostęp, nie zostawiać zapasowego refresha.
    if (account == null || !account.active) return null;

    const membership = await this.pilots.membership(rotated.pilotId, rotated.orgId);
    if (membership == null || !isActive(membership)) return null;

    return this.tokensFor(account, membership, rotated.token);
  }

  /**
   * Klub AKTYWNY osoby (§5): spośród członkostw `active` w działających klubach - ten
   * ostatnio używany (z najświeższego refresha), inaczej pierwszy alfabetycznie
   * (`memberships()` oddaje porządek po nazwie klubu). `null` = ani jednego.
   *
   * `accept` zawęża kandydatów (panel: wyłącznie członkostwa z rolą panelu) - reguła
   * wyboru zostaje ta sama, zmienia się tylko zbiór, z którego wybiera. Lista przychodzi
   * z zewnątrz, bo wołający i tak ją ma (odpowiedź niesie komplet klubów osoby).
   */
  private async pickActive(
    pilotId: string,
    memberships: readonly Membership[],
    accept: (m: Membership) => boolean = () => true,
  ): Promise<(Membership & { code: string }) | null> {
    const candidates = memberships.filter(
      (m): m is Membership & { code: string } => isActive(m) && accept(m),
    );
    if (candidates.length === 0) return null;
    const last = await this.refreshTokens.lastOrgFor(pilotId);
    return candidates.find((m) => m.orgId === last) ?? candidates[0]!;
  }

  /**
   * Wspólny rdzeń obu logowań: token dostawcy → osoba (istniejąca albo nowa).
   *
   * Tu mieszka PODPIĘCIE KONTA PO ZWERYFIKOWANYM E-MAILU (`docs/logowanie-google.md` §6) -
   * jedyne miejsce w systemie, w którym e-mail cokolwiek uwierzytelnia. Stoi to na dwóch
   * warunkach naraz: dostawca potwierdza adres (`emailVerified`), a adres na osobie BEZ
   * tożsamości wpisał administrator albo seed (superadministrator, pierwszy administrator
   * klubu, członek dopisany zawczasu), więc jest to lista dopuszczonych pod jego kontrolą.
   * Po podpięciu `subject` jest przypięty na stałe i e-mail nie bierze już udziału
   * w logowaniu nigdy więcej.
   *
   * Bez podpięcia powstaje NOWA OSOBA bez klubu (§4). Przegrany wyścig dwóch pierwszych
   * logowań tej samej tożsamości (`createPerson` → `null`) kończy się odczytem wiersza
   * zwycięzcy - obie strony widzą tę samą osobę.
   */
  private async resolve(idToken: string, surface: LoginSurface): Promise<Resolved> {
    const profile = await this.provider.verifyIdToken(idToken, surface);
    if (profile == null) return { kind: 'invalid' };

    let identity = await this.identities.find(profile.provider, profile.subject);
    if (identity == null && profile.emailVerified) {
      identity = await this.identities.claimByVerifiedEmail(profile);
    }
    identity ??=
      (await this.identities.createPerson(profile, this.newId())) ??
      (await this.identities.find(profile.provider, profile.subject));
    if (identity == null) {
      throw new Error(`tożsamość ${profile.provider}:${profile.subject} nie powstała ani nie istnieje`);
    }

    const account = await this.pilots.findById(identity.pilotId);
    // Klucz obcy z CASCADE czyni to stanem niemożliwym; głośno, nie cicho.
    if (account == null) {
      throw new Error(`tożsamość ${identity.provider}:${identity.subject} wskazuje osobę, której nie ma`);
    }
    return { kind: 'linked', identity, account };
  }

  private async issueFor(
    account: PilotAccount,
    membership: Membership & { code: string },
  ): Promise<AuthTokens> {
    const expiresAt = new Date(
      this.clock.now().getTime() + REFRESH_TTL_DAYS * 24 * 3_600_000,
    );
    const refreshToken = await this.refreshTokens.issue(account.id, membership.orgId, expiresAt);
    return this.tokensFor(account, membership, refreshToken);
  }

  /** Para tokenów + tożsamość w klubie + komplet klubów osoby (na przełącznik 13a). */
  private async tokensFor(
    account: PilotAccount,
    membership: Membership & { code: string },
    refreshToken: string,
  ): Promise<AuthTokens> {
    const memberships = (await this.pilots.memberships(account.id))
      .filter((m): m is Membership & { code: string } => isActive(m))
      .map((m) => ({ org: orgRefOf(m), code: m.code, role: m.role }));
    return {
      token: this.tokens.sign(
        { pilotId: account.id, orgId: membership.orgId, code: membership.code, role: membership.role },
        ACCESS_TTL_SEC,
      ),
      refreshToken,
      pilot: { id: account.id, code: membership.code, name: account.name, role: membership.role },
      org: orgRefOf(membership),
      memberships,
    };
  }
}

type Resolved =
  | { kind: 'invalid' }
  | { kind: 'linked'; identity: ExternalIdentity; account: PilotAccount };

/**
 * Członkostwo, które DAJE DOSTĘP: `active` z kodem, w klubie, który działa. Kod jest
 * gwarantowany CHECK-iem bazy (`membership_active_has_code`), ale zawężenie typu robimy
 * tu, żeby token nigdy nie dostał `code: null`.
 */
const isActive = (m: Membership): m is Membership & { code: string } =>
  m.status === 'active' && m.orgActive && m.code != null;

const orgRefOf = (m: Membership): OrgRef => ({ id: m.orgId, slug: m.orgSlug, name: m.orgName });

/** Kto pyta - do plakietki konta na 00C/00D/00E; nic ponad imię i adres. */
const personOf = (account: PilotAccount): { name: string; email: string | null } => ({
  name: account.name,
  email: account.email,
});

/**
 * Czy ktoś WSZEDŁ do klubu tą tożsamością od chwili wydania tokenu osoby (`issuedAt`
 * w sekundach). `lastLoginAt` ma milisekundy, token sekundy - porównanie po sekundach
 * i w stronę odmowy: wejście w tej samej sekundzie liczy się jako późniejsze.
 */
const enteredSince = (lastLoginAt: Date | null, issuedAt: number): boolean =>
  lastLoginAt != null && Math.floor(lastLoginAt.getTime() / 1000) >= issuedAt;

/**
 * Komplet klubów osoby + stan zbiorczy (pierwszeństwo: patrz `ClubsStatus`). Wspólne
 * dla logowania, `GET /auth/memberships` i `POST /auth/join`, żeby trzy odpowiedzi
 * nie mogły powiedzieć o tej samej osobie trzech różnych rzeczy.
 */
/**
 * Zakresy panelu z członkostw osoby - JEDNA definicja dla logowania, `GET /me`
 * i przełączenia (issue #101, E2).
 *
 * Do klubów wchodzą wyłącznie członkostwa AKTYWNE Z ROLĄ PANELU: klub, w którym ta osoba
 * jest tylko pilotem, na listę wyboru NIE wchodzi - karta „bez dostępu" obiecywałaby
 * wejście, którego reguły odmówią (mockup `00a-wybor-klubu`; ta sama zasada, co przy
 * wyszarzonym przycisku - patrz 10B w aplikacji pilota). O takim klubie mówi telefon.
 */
export function panelScopesOf(
  memberships: readonly Membership[],
  platformRole: PlatformRole | null,
): PanelScopes {
  return {
    clubs: memberships
      .filter((m): m is Membership & { code: string } => isActive(m) && can(m.role, 'panel.access'))
      .map((m) => ({ org: orgRefOf(m), code: m.code, role: m.role })),
    platform: platformRole != null,
  };
}

/** Sesja KLUBU - ten sam kształt wydaje logowanie i przełączenie zakresu. */
function orgSession(
  tokens: TokenService,
  account: PilotAccount,
  membership: Membership & { code: string },
  scopes: PanelScopes,
): PanelSession {
  return {
    kind: 'org',
    token: tokens.sign(
      {
        pilotId: account.id,
        orgId: membership.orgId,
        code: membership.code,
        role: membership.role,
      },
      ADMIN_SESSION_TTL_SEC,
    ),
    ttlSec: ADMIN_SESSION_TTL_SEC,
    pilot: {
      id: account.id,
      code: membership.code,
      name: account.name,
      role: membership.role,
      org: orgRefOf(membership),
    },
    capabilities: capabilitiesOf(membership.role),
    scopes,
  };
}

/** Sesja PLATFORMY - bez klubu i bez kodu (kod jest własnością członkostwa). */
function platformSession(
  tokens: TokenService,
  account: PilotAccount,
  platformRole: PlatformRole,
  scopes: PanelScopes,
): PanelSession {
  return {
    kind: 'platform',
    token: tokens.signPlatform({ pilotId: account.id }, ADMIN_SESSION_TTL_SEC),
    ttlSec: ADMIN_SESSION_TTL_SEC,
    pilot: { id: account.id, name: account.name, platformRole },
    capabilities: platformCapabilitiesOf(platformRole),
    scopes,
  };
}

export function clubsView(
  memberships: readonly Membership[],
  person: { name: string; email: string | null },
): ClubsView {
  const status: ClubsStatus = memberships.some(isActive)
    ? 'active'
    : memberships.some((m) => m.status === 'pending')
      ? 'pending'
      : memberships.some((m) => m.status === 'rejected')
        ? 'rejected'
        : 'none';
  return {
    status,
    memberships: memberships.map((m) => ({
      org: orgRefOf(m),
      clubActive: m.orgActive,
      status: m.status,
      code: m.code,
      role: m.role,
      rejectReason: m.rejectReason,
      createdAt: m.createdAt,
      decidedAt: m.decidedAt,
    })),
    person,
  };
}
