/**
 * Ninerdeck (serwer) - komendy uwierzytelnienia (§3.0, §4.6).
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
 * ══ HASŁA ZNIKŁY (2026-09-04) I WRÓCIŁY JAKO DRUGA METODA (2.1.0, issue #132) ══
 * Od 2026-09-04 jedyną drogą do konta był dostawca zewnętrzny. Wspólny tablet w kabinie
 * (`docs/logowanie-haslem.md` §1) przywrócił hasło - jako DRUGI dowód TEJ SAMEJ osoby
 * (`password_credentials`), nie jako drugą osobę. Reguła jest jedna: logowanie hasłem
 * kończy się DOKŁADNIE tam, gdzie Google - od chwili ustalenia osoby jedzie ten sam
 * rdzeń (`enterMobile` / `enterPanel`). Różni je wyłącznie sposób dowodzenia:
 * `verifyPassword` z limitem PRZED skrótem, JEDNĄ odpowiedzią na trzy stany (login
 * nieznany / bez hasła / złe hasło) i skrótem ZASTĘPCZYM przy nieznanym loginie -
 * to jest ta kontrola czasu odpowiedzi, którą 2026-09-04 wycięto razem z hasłami.
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
  platformCapabilitiesOf,
  type Capability,
  type PlatformRole,
} from '../../../domain/roles.ts';
import type { AttemptLimiter } from '../attemptLimiter.ts';
import type {
  Clock,
  Database,
  ExternalIdentitiesPort,
  ExternalIdentity,
  IdentityProviderPort,
  LoginEntry,
  LoginSessionsPort,
  LoginSurface,
  Membership,
  PasswordCredentialsPort,
  PasswordHasher,
  PilotAccount,
  PilotsPort,
  RefreshTokensPort,
  SessionDevice,
  TokenService,
} from '../ports.ts';
import type { LoginMethod } from '../../../domain/loginSessions.ts';

/** Próby logowania hasłem w oknie `PASSWORD_WINDOW_MS` (§5.1): na login i na adres IP. */
export const PASSWORD_LOGIN_PER_LOGIN = 10;
export const PASSWORD_LOGIN_PER_IP = 30;

/**
 * Zależności logowania HASŁEM - w jednym worku, bo są trzy i przychodzą razem: poświadczenie
 * (tabela), skrót (koszt scryptu) i limit (pamięć procesu, ten sam egzemplarz, co
 * `PasswordCommands`). Osobno od pozostałych argumentów konstruktora, żeby było widać,
 * co jest DRUGĄ metodą, a co wspólnym rdzeniem.
 */
export interface PasswordLoginDeps {
  credentials: PasswordCredentialsPort;
  hasher: PasswordHasher;
  limiter: AttemptLimiter;
}

export interface PasswordLoginInput {
  /** E-mail (z `@`) albo kod pilota w klubie `orgId` (bez `@`). */
  login: string;
  password: string;
  /** Bieżący klub URZĄDZENIA - bez niego kod pilota nie ma czego rozwiązać (§5.1). */
  orgId: string | null;
  /**
   * Skąd przyszło żądanie. Adres IP jest tu podwójnie potrzebny: najpierw jako klucz
   * limitu prób (§5.1), a po udanym dowodzie - jako kolumna sesji. Jedna wartość zamiast
   * dwóch pól, żeby te dwa zastosowania nie mogły się rozjechać.
   */
  device: SessionDevice;
}

/**
 * Wynik logowania hasłem TELEFONU: po ustaleniu osoby ten sam, co przy Google (`ok`,
 * `no_club`, `account_disabled`); przed - dwie odmowy własne hasła. `invalid_credentials`
 * jest JEDNĄ odpowiedzią na login nieznany, osobę bez hasła i złe hasło (§8 pkt 2).
 */
export type PasswordLoginResult =
  | MobileEntry
  | { ok: false; reason: 'invalid_credentials' }
  | { ok: false; reason: 'rate_limited'; retryAfterSec: number };

/** To samo dla PANELU (§5.2) - loguje wyłącznie e-mailem, bo przed sesją nie ma klubu. */
export type PanelPasswordLoginResult =
  | PanelEntry
  | { ok: false; reason: 'invalid_credentials' }
  | { ok: false; reason: 'rate_limited'; retryAfterSec: number };

/** Wynik wspólnego rdzenia OD CHWILI USTALENIA OSOBY - bez odmów dowodu tożsamości. */
type MobileEntry = Exclude<ProviderLoginResult, { reason: 'invalid_token' }>;
type PanelEntry = Exclude<PanelLoginResult, { reason: 'invalid_token' }>;

type PasswordVerdict =
  | { kind: 'ok'; account: PilotAccount }
  | { kind: 'invalid_credentials' }
  | { kind: 'account_disabled' }
  | { kind: 'rate_limited'; retryAfterSec: number };

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
  /** `code` jest kodem Z CZŁONKOSTWA w klubie `org` (wielofirmowość §3.2). */
  pilot: { id: string; code: string; name: string };
  /** Klub, DLA KTÓREGO wydano tę parę (wielofirmowość §6). */
  org: OrgRef;
  /**
   * Komplet klubów osoby - z tego telefon wie, czy rysować przełącznik na 13a
   * (wyłącznie przy więcej niż jednym członkostwie, §7.3) i plakietkę klubu na 01e.
   */
  memberships: { org: OrgRef; code: string }[];
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
  /** Klub sesji panelu (wielofirmowość §8.2) - w SESJI, nie w nagłówku. */
  org: OrgRef;
}

/**
 * Klub, do którego ta osoba może PRZEŁĄCZYĆ sesję panelu (mockup `00a-wybor-klubu`).
 *
 * Kod i ZAKRES są tu po to, żeby karta wyboru mogła napisać drugą linię („administrator ·
 * Twój kod TMK") - a nie po to, żeby panel cokolwiek z nich wnioskował: o tym, co wolno
 * w klubie, rozstrzyga zbiór z sesji WYDANEJ dla tego klubu, czytany przy każdym żądaniu.
 *
 * Nazwę zakresu składa PANEL ze zbioru (epik #197) - serwer nie zna języka interfejsu,
 * dokładnie jak przy kodach `AccountRefusal`.
 */
export interface PanelScopeClub {
  org: OrgRef;
  code: string;
  capabilities: readonly Capability[];
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
  /**
   * Sesja, z której to żądanie przyszło - WYŁĄCZNIE przy `kind: 'club'` (token osoby
   * sesji nie zakłada). `null` też przy tokenie klubu sprzed 2.1.0. Przełączenie klubu
   * kopiuje z niej metodę do sesji docelowej, żeby lista urządzeń nie zapomniała, czym
   * ten człowiek się zalogował.
   */
  sessionId: string | null;
  /**
   * Metoda zapisana w TOKENIE OSOBY - jedyne miejsce, które ją zna, dopóki sesja nie
   * powstanie (`GET /auth/memberships` dopiero ją zakłada). `null` przy tokenie klubu
   * i przy tokenie osoby sprzed 2.1.0.
   */
  method: LoginMethod | null;
}

/**
 * Kto stoi za CIASTECZKIEM sesji panelu - bez rozstrzygania, którego rodzaju jest.
 *
 * Przełączenie zakresu (`POST /admin/api/auth/switch`) zadaje pytanie o osobę, a nie
 * o jej bieżący klub: administrator klubu A przechodzi do B, a superadministrator
 * schodzi z platformy do klubu. Rodzaj tokenu, którym przyszedł, nie ma tu znaczenia -
 * znaczenie ma to, czy w CELU jest aktywne członkostwo z rolą panelu.
 */
/**
 * Wynik rotacji. Do 2.1.0 było tu `AuthTokens | null`, a telefon miał na jedno `null`
 * dwie różne odpowiedzi do napisania: „token wygasł, zaloguj się" i „administrator
 * zakończył tę sesję". Odmowa z POWODEM jest warunkiem D7 - telefon ma powiedzieć,
 * DLACZEGO sync stoi, zamiast pokazywać zwykłe „OFFLINE".
 */
export type RefreshResult =
  | { ok: true; tokens: AuthTokens }
  | { ok: false; reason: 'invalid_refresh' | 'session_revoked' };

export interface PanelRequest {
  pilotId: string;
  issuedAt: number;
  /** Sesja ciasteczka; `null` = ciasteczko sprzed 2.1.0. Wylogowanie stempluje właśnie ją. */
  sessionId: string | null;
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
    /** Druga metoda logowania (2.1.0) - patrz `PasswordLoginDeps`. */
    private readonly passwords: PasswordLoginDeps,
    /**
     * Sesje logowania (2.1.0, issue #133). Każde wejście - Googlem, hasłem, z tokenu
     * osoby i przez przełączenie klubu - zakłada wiersz, a `sid` jedzie w tokenie.
     */
    private readonly sessions: LoginSessionsPort,
    /**
     * Uchwyt do bazy - WYŁĄCZNIE dla wylogowania (§5.5): skasowanie refresha i stempel
     * sesji to jedna decyzja i muszą wejść jedną transakcją. Reszta tej klasy pracuje
     * portami, bo reszta pisze do jednej tabeli naraz.
     */
    private readonly db: Database,
  ) {}

  /**
   * Wylogowanie TELEFONU (§5.5, `POST /auth/logout`): refresh znika z bazy, a sesja
   * dostaje stempel `self`.
   *
   * Do 2.1.0 telefon przy wylogowaniu NIE WOŁAŁ serwera wcale - kasował magazyn u siebie,
   * a refresh żył po nim jeszcze 90 dni. Odtąd znika po obu stronach.
   *
   * Nieznany token kończy się CISZĄ, nie błędem: „wyloguj" to jedyna operacja, którą
   * człowiek robi także wtedy, gdy jego poświadczenie jest już martwe, a odmowa
   * zostawiałaby go zalogowanym w aplikacji, z której właśnie chciał wyjść.
   */
  async logout(refreshToken: string): Promise<void> {
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const revoked = await this.refreshTokens.revoke(tx, refreshToken);
      if (revoked == null) return;
      await this.sessions.revoke(
        tx,
        { id: revoked.sessionId, pilotId: revoked.pilotId },
        now,
        'self',
      );
    });
  }

  /**
   * „Wyloguj to urządzenie" z listy WŁASNYCH sesji (`#/konto`, §5.6).
   *
   * Stoi tutaj, a nie w komendach panelu, z dwóch powodów naraz: to nie jest decyzja
   * o innym człowieku (więc nie ma audytu, a komendy panelu z definicji piszą przez
   * `AuditedWrite`), i zakres jest OSOBY, nie klubu - „moje urządzenia" obejmują
   * wszystkie kluby i obie powierzchnie.
   *
   * BIEŻĄCEJ sesji wyłączyć się nie da. Panel jej nie oferuje (kontrakt oznacza ją
   * `current`), ale serwer nie ma prawa na to liczyć: od wylogowania siebie jest
   * „Wyloguj" w pasku, a ta sama czynność zrobiona tędy zostawiłaby człowieka na ekranie,
   * który po cichu przestał działać.
   */
  async revokeOwnSession(
    pilotId: string,
    sessionId: string,
    currentSessionId: string | null,
  ): Promise<boolean> {
    if (sessionId === currentSessionId) return false;
    return this.sessions.revoke(this.db, { id: sessionId, pilotId }, this.clock.now(), 'self');
  }

  /**
   * Wylogowanie PANELU (§5.5) - ciasteczko kasuje trasa, a tu ginie wiersz sesji.
   *
   * Ciasteczka wygasłego albo uszkodzonego nie ma po czym rozpoznać, więc `null` jest
   * normalnym wejściem i kończy się ciszą: trasa i tak wyczyści ciasteczko. Ta sama
   * zasada, co przy telefonie.
   */
  async panelLogout(request: PanelRequest | null): Promise<void> {
    const sessionId = request?.sessionId;
    if (request == null || sessionId == null) return;
    await this.sessions.revoke(
      this.db,
      { id: sessionId, pilotId: request.pilotId },
      this.clock.now(),
      'self',
    );
  }

  /** Logowanie telefonu (§3.0) - prowisioning urządzenia albo token osoby bez klubu. */
  async loginWithProvider(idToken: string, device: SessionDevice): Promise<ProviderLoginResult> {
    const resolved = await this.resolve(idToken, 'mobile');
    if (resolved.kind === 'invalid') return { ok: false, reason: 'invalid_token' };
    const { account, identity } = resolved;

    const result = await this.enterMobile(account, { method: 'google', device });
    if (result.ok) await this.identities.markLogin(identity.provider, identity.subject, this.clock.now());
    return result;
  }

  /**
   * Logowanie telefonu HASŁEM (2.1.0, `docs/logowanie-haslem.md` §5.1): e-mail albo kod
   * pilota w klubie urządzenia + hasło. Po `verifyPassword` jedzie TEN SAM rdzeń, co
   * przy Google - stąd ten sam kształt wyniku od chwili ustalenia osoby.
   */
  async loginWithPassword(input: PasswordLoginInput): Promise<PasswordLoginResult> {
    const verdict = await this.verifyPassword(
      input.login,
      input.password,
      input.orgId,
      input.device.ip,
    );
    if (verdict.kind !== 'ok') return refusalOf(verdict);
    return this.enterMobile(verdict.account, { method: 'password', device: input.device });
  }

  /**
   * Logowanie PANELU hasłem (§5.2) - wyłącznie e-mailem: przed sesją panel nie ma klubu,
   * w którym kod pilota cokolwiek by znaczył.
   */
  async panelLoginWithPassword(input: {
    email: string;
    password: string;
    device: SessionDevice;
  }): Promise<PanelPasswordLoginResult> {
    const verdict = await this.verifyPassword(input.email, input.password, null, input.device.ip);
    if (verdict.kind !== 'ok') return refusalOf(verdict);
    return this.enterPanel(verdict.account, { method: 'password', device: input.device });
  }

  /**
   * Wspólny rdzeń wejścia TELEFONU od chwili ustalenia osoby - dla Google i dla hasła.
   * Aktywne członkostwo → tokeny klubu; brak → token OSOBY na 00C/00D/00E.
   */
  private async enterMobile(account: PilotAccount, entry: LoginEntry): Promise<MobileEntry> {
    if (!account.active) return { ok: false, reason: 'account_disabled' };

    const memberships = await this.pilots.memberships(account.id);
    const active = await this.pickActive(account.id, memberships);
    if (active == null) {
      // Osoba bez klubu (§4): token OSOBY na ekrany 00C/00D/00E. Nie stemplujemy
      // `lastLoginAt` - ten stempel jest JEDNORAZOWOŚCIĄ tokenu osoby (patrz
      // `membershipStatus`), więc pada dopiero przy wejściu do klubu.
      //
      // SESJI TEŻ NIE ZAKŁADAMY (§4.3): token osoby nie jest tożsamością w klubie
      // i nie ma czego wylogowywać. METODĘ niesie jednak on sam - to jedyne miejsce,
      // które ją zna, gdy `GET /auth/memberships` będzie zakładać sesję właściwą.
      return {
        ok: false,
        reason: 'no_club',
        personToken: this.tokens.signPerson(
          { pilotId: account.id, method: entry.method },
          PERSON_TTL_DAYS * 24 * 3600,
        ),
        clubs: clubsView(memberships, personOf(account)),
      };
    }

    return { ok: true, tokens: await this.issueFor(account, active, entry) };
  }

  /**
   * Dowód hasłem (§5.1, §8 pkt 1–3) - w tej kolejności i ŻADNEJ innej:
   *  1. limit PRZED skrótem (10 na login, 30 na adres IP w 15 min) - odbicie `429`
   *     nie zdradza istnienia konta, bo pada na sam login;
   *  2. osoba: e-mail (z `@`) albo kod pilota w klubie urządzenia (bez `orgId` kod
   *     nie ma czego rozwiązać i kończy się jak złe hasło);
   *  3. scrypt ZAWSZE - także dla loginu nieznanego i osoby bez hasła, na skrócie
   *     zastępczym: czas odpowiedzi ma być ten sam w każdym z trzech stanów;
   *  4. JEDNA odmowa `invalid_credentials` na te trzy stany; `account_disabled` dopiero
   *     PO dowodzie (tożsamość jest już dowiedziona, jak przy Google);
   *  5. re-hash po udanym dowodzie, gdy skrót jest ze słabszych parametrów.
   */
  private async verifyPassword(
    login: string,
    password: string,
    orgId: string | null,
    ip: string | null,
  ): Promise<PasswordVerdict> {
    const normalized = login.trim().toLowerCase();
    const verdict = this.passwords.limiter.attempt([
      { key: `password:login:${normalized}`, limit: PASSWORD_LOGIN_PER_LOGIN },
      { key: `password:ip:${ip ?? 'unknown'}`, limit: PASSWORD_LOGIN_PER_IP },
    ]);
    if (!verdict.allowed) {
      return { kind: 'rate_limited', retryAfterSec: Math.ceil(verdict.retryAfterMs / 1000) };
    }

    const account = normalized.includes('@')
      ? await this.pilots.findByEmail(normalized)
      : orgId != null
        ? await this.pilots.findByCode(orgId, login.trim())
        : null;
    const credential = account == null ? null : await this.passwords.credentials.find(account.id);

    const matches = await this.passwords.hasher.verify(
      password,
      credential?.hash ?? this.passwords.hasher.dummyHash(),
    );
    if (account == null || credential == null || !matches) return { kind: 'invalid_credentials' };
    if (!account.active) return { kind: 'account_disabled' };

    if (this.passwords.hasher.needsRehash(credential.hash)) {
      await this.passwords.credentials.rehash(account.id, await this.passwords.hasher.hash(password), this.clock.now());
    }
    return { kind: 'ok', account };
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
  async panelLoginWithProvider(
    idToken: string,
    device: SessionDevice,
  ): Promise<PanelLoginResult> {
    const resolved = await this.resolve(idToken, 'panel');
    if (resolved.kind === 'invalid') return { ok: false, reason: 'invalid_token' };
    const { account, identity } = resolved;

    const result = await this.enterPanel(account, { method: 'google', device });
    if (result.ok) await this.identities.markLogin(identity.provider, identity.subject, this.clock.now());
    return result;
  }

  /** Wspólny rdzeń wejścia do PANELU od chwili ustalenia osoby - dla Google i dla hasła. */
  private async enterPanel(account: PilotAccount, entry: LoginEntry): Promise<PanelEntry> {
    if (!account.active) return { ok: false, reason: 'account_disabled' };

    const memberships = await this.pilots.memberships(account.id);
    const admin = await this.pickActive(account.id, memberships, (m) => can(m.capabilities, 'panel.access'));
    const scopes = panelScopesOf(memberships, account.platformRole);

    if (admin == null) {
      if (account.platformRole == null) return { ok: false, reason: 'no_panel_access' };
      const sid = await this.openPanelSession(account.id, null, entry);
      return {
        ok: true,
        session: platformSession(this.tokens, account, account.platformRole, scopes, sid),
      };
    }
    const sid = await this.openPanelSession(account.id, admin.orgId, entry);
    return { ok: true, session: orgSession(this.tokens, account, admin, scopes, sid) };
  }

  /**
   * Sesja PANELU - żyje tyle, co ciasteczko (§4.3), bo panel nie ma pary tokenów ani
   * rotacji: jedno ciasteczko, jeden token, jeden termin. `orgId: null` = sesja
   * platformowa. Oddaje `sid`, bo to on musi wejść do claimów podpisywanych zaraz potem.
   */
  private async openPanelSession(
    pilotId: string,
    orgId: string | null,
    entry: LoginEntry,
  ): Promise<string> {
    const id = this.newId();
    await this.sessions.open({
      id,
      pilotId,
      orgId,
      surface: 'panel',
      method: entry.method,
      device: entry.device,
      expiresAt: new Date(this.clock.now().getTime() + ADMIN_SESSION_TTL_SEC * 1000),
    });
    return id;
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
    if (club != null) {
      return { pilotId: club.pilotId, issuedAt: club.issuedAt, sessionId: club.sessionId };
    }
    const platform = this.tokens.verifyPlatform(token);
    if (platform != null) {
      return {
        pilotId: platform.pilotId,
        issuedAt: platform.issuedAt,
        sessionId: platform.sessionId,
      };
    }
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
  async panelSwitch(
    request: PanelRequest,
    target: string | null,
    device: SessionDevice,
  ): Promise<PanelSwitchResult> {
    const account = await this.pilots.findById(request.pilotId);
    if (account == null || !account.active) return { ok: false, reason: 'unauthorized' };
    if (credentialsRevoked(account.credentialsValidFrom, request.issuedAt)) {
      return { ok: false, reason: 'unauthorized' };
    }

    const memberships = await this.pilots.memberships(account.id);
    const scopes = panelScopesOf(memberships, account.platformRole);
    // Przełączenie zakresu wydaje NOWE ciasteczko, więc i nową sesję - jak przy telefonie.
    // Poprzedniej NIE unieważniamy: to ta sama karta przeglądarki, a stare ciasteczko
    // zostaje nadpisane w tej samej odpowiedzi i nikt go już nie zobaczy.
    const entry: LoginEntry = { method: await this.inheritedMethod(request), device };

    if (target == null) {
      if (account.platformRole == null) return { ok: false, reason: 'not_found' };
      const sid = await this.openPanelSession(account.id, null, entry);
      return {
        ok: true,
        session: platformSession(this.tokens, account, account.platformRole, scopes, sid),
      };
    }

    const membership = memberships.find((m) => m.orgId === target);
    if (
      membership == null ||
      !isActive(membership) ||
      !can(membership.capabilities, 'panel.access') ||
      credentialsRevoked(membership.credentialsValidFrom, request.issuedAt)
    ) {
      return { ok: false, reason: 'not_found' };
    }

    const sid = await this.openPanelSession(account.id, membership.orgId, entry);
    return { ok: true, session: orgSession(this.tokens, account, membership, scopes, sid) };
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
    if (person != null) {
      return {
        pilotId: person.pilotId,
        issuedAt: person.issuedAt,
        kind: 'person',
        sessionId: null,
        method: person.method,
      };
    }
    const club = this.tokens.verify(token);
    if (club != null) {
      return {
        pilotId: club.pilotId,
        issuedAt: club.issuedAt,
        kind: 'club',
        sessionId: club.sessionId,
        method: null,
      };
    }
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
  /**
   * Metoda dla sesji zakładanej Z ISTNIEJĄCEGO poświadczenia - przy przełączeniu klubu
   * i przy wymianie tokenu osoby na tokeny klubu (§4.3: „`method` skopiowany ze źródłowej").
   *
   * Trzy źródła w kolejności pewności: claim tokenu OSOBY (on jeden ją pamięta, zanim
   * jakakolwiek sesja powstanie) → sesja, z której przyszło żądanie → `legacy`. Ostatnia
   * wartość opisuje poświadczenie sprzed 2.1.0 i jest uczciwsza niż zgadywanie: serwer
   * naprawdę nie wie, czym ten człowiek się wtedy zalogował.
   */
  private async inheritedMethod(request: PersonRequest | PanelRequest): Promise<LoginMethod> {
    if ('method' in request && request.method != null) return request.method;
    if (request.sessionId == null) return 'legacy';
    const source = await this.sessions.find(request.sessionId, this.clock.now());
    return source?.method ?? 'legacy';
  }

  async membershipStatus(
    request: PersonRequest,
    device: SessionDevice,
  ): Promise<MembershipStatusResult> {
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
    return {
      kind: 'approved',
      tokens: await this.issueFor(account, active, {
        method: await this.inheritedMethod(request),
        device,
      }),
    };
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
  async switchClub(
    request: PersonRequest,
    orgId: string,
    device: SessionDevice,
  ): Promise<ClubSwitchResult> {
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

    // NOWA sesja dla klubu docelowego - para tokenów jest parą DLA KLUBU, więc sesja też
    // (§4.3). Metoda idzie ze źródłowej: człowiek nie logował się po raz drugi, tylko
    // zmienił klub, a lista urządzeń ma o tym mówić prawdę.
    return {
      ok: true,
      tokens: await this.issueFor(account, membership, {
        method: await this.inheritedMethod(request),
        device,
      }),
    };
  }

  /**
   * Rotacja: zużywa refresh i wydaje świeżą parę ATOMOWO, DLA TEGO SAMEGO KLUBU.
   * `null` = token martwy.
   *
   * Ten sam klub, bo refresh jest parą DLA KLUBU (§6): przełączenie to osobna trasa.
   * Członkostwo czytamy Z BAZY, nie ze starego tokenu - odebranie roli i wyłączenie
   * członkostwa mają zadziałać przy najbliższym odświeżeniu, a nie po wygaśnięciu refresha.
   */
  async refresh(refreshToken: string, device: SessionDevice): Promise<RefreshResult> {
    const now = this.clock.now();
    // ══ SESJĘ SPRAWDZAMY PRZED ROTACJĄ ══
    // Rotacja KASUJE stary refresh i wydaje nowy; gdyby sesja okazała się martwa dopiero
    // po niej, każda próba synca wylogowanego telefonu zostawiałaby w bazie świeży,
    // nikomu niedoręczony token na kolejne 90 dni. Odmowa ma przy tym własny POWÓD:
    // telefon musi umieć napisać „sesja zakończona przez administratora", a nie „zły
    // token" - to jest cała różnica między D7 a wyrzuceniem pilota do logowania.
    const sessionId = await this.refreshTokens.sessionOf(refreshToken);
    if (sessionId != null) {
      const session = await this.sessions.find(sessionId, now);
      if (session == null || !session.live) return { ok: false, reason: 'session_revoked' };
    }

    const expiresAt = new Date(now.getTime() + REFRESH_TTL_DAYS * 24 * 3_600_000);
    const rotated = await this.refreshTokens.rotate(refreshToken, expiresAt);
    if (rotated == null) return { ok: false, reason: 'invalid_refresh' };

    const account = await this.pilots.findById(rotated.pilotId);
    // Konto skasowane/wyłączone PO rotacji: token przepada razem z odmową - i dobrze,
    // dezaktywacja ma odcinać dostęp, nie zostawiać zapasowego refresha.
    if (account == null || !account.active) return { ok: false, reason: 'invalid_refresh' };

    const membership = await this.pilots.membership(rotated.pilotId, rotated.orgId);
    if (membership == null || !isActive(membership)) {
      return { ok: false, reason: 'invalid_refresh' };
    }

    // Odświeżenie jest znakiem życia urządzenia - i jedynym, jaki serwer widzi od telefonu
    // bez ruchu. Bez przepustnicy, bo rotacja pada raz na godzinę, a nie przy każdym żądaniu.
    await this.sessions.touch(rotated.sessionId, now, device);
    return {
      ok: true,
      tokens: await this.tokensFor(account, membership, rotated.token, rotated.sessionId),
    };
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
    entry: LoginEntry,
  ): Promise<AuthTokens> {
    const expiresAt = new Date(
      this.clock.now().getTime() + REFRESH_TTL_DAYS * 24 * 3_600_000,
    );
    // Sesja POWSTAJE PIERWSZA, refresh jest jej śladem: `refresh_tokens.session_id` jest
    // `NOT NULL`, a i tak nie byłoby czym podpisać tokenu dostępu bez `sid`. Termin sesji
    // = termin refresha: para żyje tak długo, jak jej dłuższy koniec.
    const sessionId = this.newId();
    await this.sessions.open({
      id: sessionId,
      pilotId: account.id,
      orgId: membership.orgId,
      surface: 'mobile',
      method: entry.method,
      device: entry.device,
      expiresAt,
    });
    const refreshToken = await this.refreshTokens.issue(
      account.id,
      membership.orgId,
      sessionId,
      expiresAt,
    );
    return this.tokensFor(account, membership, refreshToken, sessionId);
  }

  /** Para tokenów + tożsamość w klubie + komplet klubów osoby (na przełącznik 13a). */
  private async tokensFor(
    account: PilotAccount,
    membership: Membership & { code: string },
    refreshToken: string,
    sessionId: string,
  ): Promise<AuthTokens> {
    const memberships = (await this.pilots.memberships(account.id))
      .filter((m): m is Membership & { code: string } => isActive(m))
      .map((m) => ({ org: orgRefOf(m), code: m.code }));
    return {
      token: this.tokens.sign(
        {
          pilotId: account.id,
          orgId: membership.orgId,
          code: membership.code,
          sessionId,
        },
        ACCESS_TTL_SEC,
      ),
      refreshToken,
      pilot: { id: account.id, code: membership.code, name: account.name },
      org: orgRefOf(membership),
      memberships,
    };
  }
}

type Resolved =
  | { kind: 'invalid' }
  | { kind: 'linked'; identity: ExternalIdentity; account: PilotAccount };

/** Odmowa hasła → wynik logowania; jeden kształt dla telefonu i panelu. */
function refusalOf(
  verdict: Exclude<PasswordVerdict, { kind: 'ok' }>,
): { ok: false; reason: 'invalid_credentials' | 'account_disabled' } | { ok: false; reason: 'rate_limited'; retryAfterSec: number } {
  if (verdict.kind === 'rate_limited') {
    return { ok: false, reason: 'rate_limited', retryAfterSec: verdict.retryAfterSec };
  }
  return { ok: false, reason: verdict.kind };
}

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
      .filter((m): m is Membership & { code: string } => isActive(m) && can(m.capabilities, 'panel.access'))
      .map((m) => ({ org: orgRefOf(m), code: m.code, capabilities: m.capabilities })),
    platform: platformRole != null,
  };
}

/** Sesja KLUBU - ten sam kształt wydaje logowanie i przełączenie zakresu. */
function orgSession(
  tokens: TokenService,
  account: PilotAccount,
  membership: Membership & { code: string },
  scopes: PanelScopes,
  sessionId: string,
): PanelSession {
  return {
    kind: 'org',
    token: tokens.sign(
      {
        pilotId: account.id,
        orgId: membership.orgId,
        code: membership.code,
        sessionId,
      },
      ADMIN_SESSION_TTL_SEC,
    ),
    ttlSec: ADMIN_SESSION_TTL_SEC,
    pilot: {
      id: account.id,
      code: membership.code,
      name: account.name,
      org: orgRefOf(membership),
    },
    capabilities: membership.capabilities,
    scopes,
  };
}

/** Sesja PLATFORMY - bez klubu i bez kodu (kod jest własnością członkostwa). */
function platformSession(
  tokens: TokenService,
  account: PilotAccount,
  platformRole: PlatformRole,
  scopes: PanelScopes,
  sessionId: string,
): PanelSession {
  return {
    kind: 'platform',
    token: tokens.signPlatform({ pilotId: account.id, sessionId }, ADMIN_SESSION_TTL_SEC),
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
      rejectReason: m.rejectReason,
      createdAt: m.createdAt,
      decidedAt: m.decidedAt,
    })),
    person,
  };
}
