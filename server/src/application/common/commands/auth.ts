/**
 * UZ Aero (serwer) - komendy uwierzytelnienia (§3.0, §4.6).
 *
 * Logowanie to jedyna operacja w systemie, która WYMAGA sieci po stronie telefonu
 * (jednorazowe provisioning) - dlatego jej wynik niesie wszystko, czego aplikacja
 * potrzebuje do pracy offline: tożsamość, parę tokenów. Cache referencyjny telefon
 * dociąga osobnym zapytaniem.
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
 * `linked` → tokeny. Wszystko inne → BRAK tokenu pilota. Nie ma tu stanu pośredniego
 * „trochę zalogowany": zgłoszenie dostaje token REJESTRACYJNY, który otwiera jedną
 * trasę i nie jest tożsamością (patrz `TokenService` w portach).
 */

import type {
  Clock,
  ExternalIdentitiesPort,
  ExternalIdentity,
  IdentityProviderPort,
  LoginSurface,
  PilotAccount,
  PilotsPort,
  RefreshTokensPort,
  TokenService,
  VerifiedRegistration,
} from '../ports.ts';
import { can, type PilotRole } from '../../../domain/roles.ts';

/** Czas życia JWT (s) - krótki, bo odświeżenie jest tanie i automatyczne. */
export const ACCESS_TTL_SEC = 60 * 60;

/** Czas życia refresh tokenu (dni) - pokrywa sezon pracy w terenie bez logowania. */
export const REFRESH_TTL_DAYS = 90;

/**
 * Czas życia tokenu ZGŁOSZENIA (dni).
 *
 * Długi, bo mierzy cierpliwość administratora, nie pilota: człowiek, który zgłosił się
 * w piątek, ma po weekendzie zobaczyć swój stan bez przechodzenia przez Google od nowa.
 * Ryzyko jest znikome - token nie jest tożsamością i otwiera jedną trasę tylko do odczytu.
 */
export const REGISTRATION_TTL_DAYS = 30;

/**
 * Czas życia sesji panelu (s) - jeden dzień pracy przy biurku.
 *
 * Przeglądarka NIE dostaje refresh tokenu (`docs/architektura-panelu-serwer.md` §8.4):
 * obietnica §3.0 „wygasły token ≠ wylogowanie" istnieje dla pilota w terenie, a nie
 * dla administratora przy biurku - panelowi wolno powiedzieć „zaloguj się ponownie".
 * Drugie długożyciowe poświadczenie w przeglądarce kupiłoby wyłącznie powierzchnię ataku.
 */
export const ADMIN_SESSION_TTL_SEC = 8 * 60 * 60;

export interface AuthTokens {
  token: string;
  refreshToken: string;
  /**
   * `role` jedzie w odpowiedzi, a nie tylko w tokenie: panel musi wiedzieć od razu po
   * zalogowaniu, które sekcje pokazać, a nie zgadywać po odmowach z kolejnych tras.
   * Aplikacja pilota pole ignoruje - dla niej nic się nie zmienia.
   */
  pilot: { id: string; code: string; name: string; role: PilotRole };
}

/**
 * Zgłoszenie tak, jak widzi je EKRAN `00c`/`00d` - imię i e-mail Z GOOGLE, nie z konta
 * pilota (konta jeszcze nie ma). Powód odrzucenia jedzie razem, bo `00d` go cytuje.
 */
export interface RegistrationView {
  provider: string;
  name: string;
  email: string;
  status: 'pending' | 'rejected';
  rejectReason: string | null;
  createdAt: Date;
  /** Chwila decyzji administratora - `00d` cytuje ją przy odrzuceniu; `null` gdy czeka. */
  decidedAt: Date | null;
}

export type ProviderLoginResult =
  | { ok: true; tokens: AuthTokens }
  /** Podpis, `iss`, `aud` albo termin nie przeszły - albo to nie jest nasz token. */
  | { ok: false; reason: 'invalid_token' }
  | { ok: false; reason: 'account_disabled' }
  /** Zgłoszenie przyjęte i czeka (202) - jedyny wynik z tokenem rejestracyjnym. */
  | { ok: false; reason: 'pending'; registration: RegistrationView; registrationToken: string }
  | { ok: false; reason: 'rejected'; registration: RegistrationView };

/** Konto tak, jak widzi je panel po zalogowaniu - bez pól technicznych. */
export interface PanelPilot {
  id: string;
  code: string;
  name: string;
  role: PilotRole;
}

/** Sesja przeglądarkowa: token do CIASTECZKA (nie do ciała odpowiedzi) + kto się zalogował. */
export interface PanelSession {
  token: string;
  ttlSec: number;
  pilot: PanelPilot;
}

export type PanelLoginResult =
  | { ok: true; session: PanelSession }
  | { ok: false; reason: 'invalid_token' }
  | { ok: false; reason: 'account_disabled' }
  /**
   * Konto Google BEZ konta pilota - zgłoszenie czeka albo zostało odrzucone.
   * Odrębne od `no_panel_access`, bo to są dwie różne wiadomości: „nie ma jeszcze
   * takiego konta" kontra „konto jest, ale panel go nie obejmuje".
   */
  | { ok: false; reason: 'not_registered' }
  /**
   * `no_panel_access` jest ODRĘBNY i to jest decyzja produktowa z mockupu A00: konto
   * pilota loguje się POPRAWNIE, a odbija się o rolę - i ma zobaczyć dlaczego („panel
   * jest dla administratora; pilot pracuje w aplikacji na telefonie").
   */
  | { ok: false; reason: 'no_panel_access' };

/**
 * Odpowiedź `GET /auth/registration`. `approved` niesie TOKENY, bo pilot zatwierdzony
 * w międzyczasie ma wejść do aplikacji bez ponownego przechodzenia przez Google.
 * `unknown` = zgłoszenia nie ma (odwołane, konto skasowane albo wyłączone).
 */
export type RegistrationStatus =
  | { kind: 'pending' | 'rejected'; registration: RegistrationView }
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
  ) {}

  /** Logowanie telefonu (§3.0) - prowisioning urządzenia albo zgłoszenie do zatwierdzenia. */
  async loginWithProvider(idToken: string): Promise<ProviderLoginResult> {
    const resolved = await this.resolve(idToken, 'mobile');
    if (resolved.kind === 'invalid') return { ok: false, reason: 'invalid_token' };
    if (resolved.kind === 'rejected') {
      return { ok: false, reason: 'rejected', registration: viewOf(resolved.identity) };
    }
    if (resolved.kind === 'pending') {
      return {
        ok: false,
        reason: 'pending',
        registration: viewOf(resolved.identity),
        registrationToken: this.tokens.signRegistration(
          { provider: resolved.identity.provider, subject: resolved.identity.subject },
          REGISTRATION_TTL_DAYS * 24 * 3600,
        ),
      };
    }
    if (!resolved.account.active) return { ok: false, reason: 'account_disabled' };

    await this.identities.markLogin(
      resolved.identity.provider,
      resolved.identity.subject,
      this.clock.now(),
    );
    return { ok: true, tokens: await this.issueFor(resolved.account) };
  }

  /**
   * Logowanie do PANELU: ten sam dostawca, inny wynik.
   *
   * Różnice wobec telefonu są dwie i obie są istotne:
   *  • brama `panel.access` - konto bez roli panelu NIE DOSTAJE sesji (nie tylko
   *    pustego ekranu): token, którym nic nie wolno, byłby poświadczeniem bez powodu;
   *  • brak refresh tokenu - przeglądarka nie dostaje drugiego poświadczenia (§8.4).
   *    Wołanie `loginWithProvider()` „dla wygody" i porzucanie refresha zostawiałoby
   *    wiersz w `refresh_tokens` po każdym wejściu do panelu, czyli martwe sesje bez końca.
   *
   * Zgłoszenie NIE dostaje tu tokenu rejestracyjnego: ekran oczekiwania jest funkcją
   * aplikacji pilota, a nie back-office'u.
   */
  async panelLoginWithProvider(idToken: string): Promise<PanelLoginResult> {
    const resolved = await this.resolve(idToken, 'panel');
    if (resolved.kind === 'invalid') return { ok: false, reason: 'invalid_token' };
    if (resolved.kind !== 'linked') return { ok: false, reason: 'not_registered' };
    if (!resolved.account.active) return { ok: false, reason: 'account_disabled' };

    const { id, code, name, role } = resolved.account;
    if (!can(role, 'panel.access')) return { ok: false, reason: 'no_panel_access' };

    await this.identities.markLogin(
      resolved.identity.provider,
      resolved.identity.subject,
      this.clock.now(),
    );
    return {
      ok: true,
      session: {
        token: this.tokens.sign({ pilotId: id, code, role }, ADMIN_SESSION_TTL_SEC),
        ttlSec: ADMIN_SESSION_TTL_SEC,
        pilot: { id, code, name, role },
      },
    };
  }

  /**
   * Odczyt tokenu ZGŁOSZENIA - `null`, gdy to nie jest token rejestracyjny.
   *
   * Metoda stoi tutaj, a nie w trasie z wstrzykniętym `TokenService`, żeby warstwa HTTP
   * została cienka i żeby istniało jedno miejsce, w którym widać komplet: kto wydaje
   * ten token (`loginWithProvider`) i kto go przyjmuje.
   */
  verifyRegistrationToken(token: string): VerifiedRegistration | null {
    return this.tokens.verifyRegistration(token);
  }

  /**
   * Stan zgłoszenia dla ekranu `00c` - odpowiedź na token REJESTRACYJNY.
   *
   * Zwraca też wynik `approved`, i to jest cała wartość tej trasy: pilot zatwierdzony
   * w międzyczasie ma wejść do aplikacji bez przechodzenia przez Google od nowa.
   *
   * ══ WYDAJE TOKENY PILOTA DOKŁADNIE RAZ (audyt 2026-09-05) ══
   * Pierwsza wersja wydawała nową parę przy KAŻDYM wywołaniu przez 30 dni życia tokenu -
   * czyli skopiowany token rejestracyjny był fabryką refreshów, której nie zrywała nawet
   * deaktywacja konta (jedyna droga unieważnienia po usunięciu haseł). Dwie bramy:
   *  • `lastLoginAt` tożsamości ustawione = ktoś już wszedł na to konto (tym tokenem albo
   *    Googlem) → `unknown`. Telefon dostaje 404, czyści zgłoszenie i pokazuje logowanie;
   *    zwykłe wejście przez Google to jedno tapnięcie, a token nie ma czego otwierać;
   *  • token wydany PRZED `credentials_valid_from` konta → `unknown` - ta sama reguła,
   *    co brama panelu (`http/authorize.ts`): deaktywacja ma odcinać wszystko, także
   *    poświadczenie, które jeszcze nikt nie zrealizował.
   */
  async registrationStatus(
    provider: string,
    subject: string,
    issuedAt: number,
  ): Promise<RegistrationStatus> {
    const identity = await this.identities.find(provider, subject);
    if (identity == null) return { kind: 'unknown' };

    if (identity.status === 'linked' && identity.pilotId != null) {
      if (identity.lastLoginAt != null) return { kind: 'unknown' };

      const snapshot = await this.pilots.authSnapshot(identity.pilotId);
      // Konto zatwierdzone, a potem wyłączone: nie ma tokenów i nie ma zgłoszenia -
      // z punktu widzenia ekranu to jest stan „to konto już nie działa".
      if (snapshot == null || !snapshot.active) return { kind: 'unknown' };
      if (
        snapshot.credentialsValidFrom != null &&
        issuedAt * 1000 < snapshot.credentialsValidFrom.getTime()
      ) {
        return { kind: 'unknown' };
      }

      const account = await this.pilots.findById(identity.pilotId);
      if (account == null) return { kind: 'unknown' };
      // Stempel PRZED wydaniem: to on zamyka tę drogę dla drugiego wywołania.
      await this.identities.markLogin(provider, subject, this.clock.now());
      return { kind: 'approved', tokens: await this.issueFor(account) };
    }

    return {
      kind: identity.status === 'rejected' ? 'rejected' : 'pending',
      registration: viewOf(identity),
    };
  }

  /** Rotacja: zużywa refresh i wydaje świeżą parę ATOMOWO. `null` = token martwy. */
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

    // Rola idzie z KONTA, nie ze starego tokenu: odebranie uprawnień ma zadziałać
    // przy najbliższym odświeżeniu, a nie dopiero po wygaśnięciu refresha.
    return {
      token: this.tokens.sign(
        { pilotId: account.id, code: account.code, role: account.role },
        ACCESS_TTL_SEC,
      ),
      refreshToken: rotated.token,
      pilot: { id: account.id, code: account.code, name: account.name, role: account.role },
    };
  }

  /**
   * Wspólny rdzeń obu logowań: token dostawcy → stan tożsamości.
   *
   * Tu mieszka PODPIĘCIE KONTA PO ZWERYFIKOWANYM E-MAILU (`docs/logowanie-google.md` §6) -
   * jedyne miejsce w systemie, w którym e-mail cokolwiek uwierzytelnia. Stoi to na dwóch
   * warunkach naraz: dostawca potwierdza adres (`emailVerified`), a `pilots.email` wpisuje
   * wyłącznie administrator w panelu albo seed, więc jest to lista dopuszczonych pod jego
   * kontrolą, nie dane od użytkownika. Po podpięciu `subject` jest przypięty na stałe
   * i e-mail nie bierze już udziału w logowaniu nigdy więcej.
   */
  private async resolve(idToken: string, surface: LoginSurface): Promise<Resolved> {
    const profile = await this.provider.verifyIdToken(idToken, surface);
    if (profile == null) return { kind: 'invalid' };

    let identity = await this.identities.find(profile.provider, profile.subject);

    // Podpięcie próbujemy dla konta NIEZNANEGO i dla zgłoszenia, które JESZCZE CZEKA
    // (audyt 2026-09-05): administrator naprawia „konto z tym adresem już istnieje"
    // wpisując adres w istniejącym koncie albo zakładając je w A06 - a nie zatwierdzając
    // zgłoszenie - i następne logowanie musi to zobaczyć. Odrzuconego nie podpinamy:
    // decyzja zapadła (pilnuje tego też `WHERE status = 'pending'` w adapterze).
    if ((identity == null || identity.status === 'pending') && profile.emailVerified) {
      const claimed = await this.identities.claimByVerifiedEmail(profile);
      if (claimed != null) identity = claimed;
    }
    identity ??= await this.identities.createPending(profile);

    if (identity.status === 'rejected') return { kind: 'rejected', identity };
    if (identity.status !== 'linked' || identity.pilotId == null) {
      return { kind: 'pending', identity };
    }

    const account = await this.pilots.findById(identity.pilotId);
    // Tożsamość wskazuje konto, którego nie ma: `ON DELETE CASCADE` czyni to stanem
    // niemożliwym, ale odpowiedź „czekaj na zatwierdzenie" jest tu jedyną sensowną -
    // dostępu nie ma, a zgłoszenie fizycznie istnieje.
    if (account == null) return { kind: 'pending', identity };

    return { kind: 'linked', identity, account };
  }

  private async issueFor(account: PilotAccount): Promise<AuthTokens> {
    const expiresAt = new Date(
      this.clock.now().getTime() + REFRESH_TTL_DAYS * 24 * 3_600_000,
    );
    const { id, code, name, role } = account;
    return {
      token: this.tokens.sign({ pilotId: id, code, role }, ACCESS_TTL_SEC),
      refreshToken: await this.refreshTokens.issue(id, expiresAt),
      pilot: { id, code, name, role },
    };
  }
}

type Resolved =
  | { kind: 'invalid' }
  | { kind: 'pending'; identity: ExternalIdentity }
  | { kind: 'rejected'; identity: ExternalIdentity }
  | { kind: 'linked'; identity: ExternalIdentity; account: PilotAccount };

const viewOf = (identity: ExternalIdentity): RegistrationView => ({
  provider: identity.provider,
  name: identity.name,
  email: identity.email,
  status: identity.status === 'rejected' ? 'rejected' : 'pending',
  rejectReason: identity.rejectReason,
  createdAt: identity.createdAt,
  decidedAt: identity.decidedAt,
});
