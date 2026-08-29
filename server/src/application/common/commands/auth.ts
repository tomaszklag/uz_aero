/**
 * UZ Aero (serwer) - komendy uwierzytelnienia (§3.0, §4.6).
 *
 * `login` to jedyna operacja w systemie, która WYMAGA sieci po stronie telefonu
 * (jednorazowe provisioning) - dlatego jej wynik niesie wszystko, czego aplikacja
 * potrzebuje do pracy offline: tożsamość, parę tokenów. Cache referencyjny telefon
 * dociąga osobnym zapytaniem.
 *
 * Model tokenów (decyzja 2026-07-22): JWT krótki (praca z API), refresh długi
 * i ROTOWANY (jednorazowy - zużycie wydaje następny). Wygasły JWT nie wylogowuje:
 * telefon po prostu odświeża przy najbliższej sieci.
 */

import type {
  Clock,
  PasswordHasher,
  PilotAccount,
  PilotsPort,
  RefreshTokensPort,
  TokenService,
} from '../ports.ts';
import { can, type PilotRole } from '../../../domain/roles.ts';

/** Czas życia JWT (s) - krótki, bo odświeżenie jest tanie i automatyczne. */
export const ACCESS_TTL_SEC = 60 * 60;

/** Czas życia refresh tokenu (dni) - pokrywa sezon pracy w terenie bez logowania. */
export const REFRESH_TTL_DAYS = 90;

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

export type LoginResult =
  | { ok: true; tokens: AuthTokens }
  /** Jeden kod dla złego loginu i złego hasła - nie zdradzamy, które konta istnieją. */
  | { ok: false; reason: 'invalid_credentials' | 'account_disabled' };

/** Konto tak, jak widzi je panel po zalogowaniu - bez hasła i bez pól technicznych. */
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
  /**
   * `no_panel_access` jest ODRĘBNY od `invalid_credentials` i to jest decyzja
   * produktowa z mockupu A00: konto pilota loguje się POPRAWNIE, a odbija się o rolę -
   * i ma zobaczyć dlaczego („panel jest dla administratora i szefa wyszkolenia; pilot
   * pracuje w aplikacji na telefonie"), zamiast dostać nieprawdziwe „złe hasło".
   * Enumeracji kont to nie otwiera: żeby zobaczyć ten komunikat, trzeba już znać hasło.
   */
  | { ok: false; reason: 'invalid_credentials' | 'account_disabled' | 'no_panel_access' };

export class AuthCommands {
  constructor(
    private readonly pilots: PilotsPort,
    private readonly refreshTokens: RefreshTokensPort,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async login(login: string, password: string): Promise<LoginResult> {
    const checked = await this.verifyCredentials(login, password);
    if (!checked.ok) return checked;

    return { ok: true, tokens: await this.issueFor(checked.account) };
  }

  /**
   * Logowanie do PANELU: te same poświadczenia, inny wynik.
   *
   * Panel loguje się tą samą komendą co telefon (`application/common/` znaczy „obie
   * powierzchnie"), bo weryfikacja hasła - razem z wyrównaniem czasu odpowiedzi przy
   * nieznanym loginie - ma jedną implementację. Różnice są dwie i obie są istotne:
   *  • brama `panel.access` - konto bez roli panelu NIE DOSTAJE sesji (nie tylko
   *    pustego ekranu): token, którym nic nie wolno, byłby poświadczeniem bez powodu;
   *  • brak refresh tokenu - przeglądarka nie dostaje drugiego poświadczenia (§8.4).
   *    Wołanie `login()` „dla wygody" i porzucanie refresha zostawiałoby wiersz
   *    w `refresh_tokens` po każdym wejściu do panelu, czyli martwe sesje bez końca.
   */
  async panelLogin(login: string, password: string): Promise<PanelLoginResult> {
    const checked = await this.verifyCredentials(login, password);
    if (!checked.ok) return checked;

    const { id, code, name, role } = checked.account;
    if (!can(role, 'panel.access')) return { ok: false, reason: 'no_panel_access' };

    return {
      ok: true,
      session: {
        token: this.tokens.sign({ pilotId: id, code, role }, ADMIN_SESSION_TTL_SEC),
        ttlSec: ADMIN_SESSION_TTL_SEC,
        pilot: { id, code, name, role },
      },
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
   * Wspólny rdzeń obu logowań: konto + hasło → konto ALBO powód odmowy.
   *
   * Hasło weryfikujemy TAKŻE dla nieistniejącego konta (stały koszt odpowiedzi) -
   * inaczej czas odpowiedzi zdradzałby, które loginy istnieją. To zabezpieczenie ma
   * jedną implementację właśnie dlatego, że druga kopia prędzej czy później zgubiłaby
   * ten `else`, a różnicy czasów nie widać w żadnym teście funkcjonalnym.
   */
  private async verifyCredentials(
    login: string,
    password: string,
  ): Promise<
    | { ok: true; account: PilotAccount }
    | { ok: false; reason: 'invalid_credentials' | 'account_disabled' }
  > {
    const account = await this.pilots.findByLogin(login);
    const valid =
      account != null
        ? await this.hasher.verify(password, account.passwordHash)
        : ((await this.hasher.verify(password, DUMMY_HASH)), false);

    if (account == null || !valid) return { ok: false, reason: 'invalid_credentials' };
    if (!account.active) return { ok: false, reason: 'account_disabled' };
    return { ok: true, account };
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

/**
 * Hash-wydmuszka do wyrównania czasu odpowiedzi przy nieznanym loginie.
 * Poprawny format scrypt; hasła, które by go spełniało, nikt nie zna.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
