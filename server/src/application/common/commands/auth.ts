/**
 * UZ Aero (serwer) — komendy uwierzytelnienia (§3.0, §4.6).
 *
 * `login` to jedyna operacja w systemie, która WYMAGA sieci po stronie telefonu
 * (jednorazowe provisioning) — dlatego jej wynik niesie wszystko, czego aplikacja
 * potrzebuje do pracy offline: tożsamość, parę tokenów. Cache referencyjny telefon
 * dociąga osobnym zapytaniem.
 *
 * Model tokenów (decyzja 2026-07-22): JWT krótki (praca z API), refresh długi
 * i ROTOWANY (jednorazowy — zużycie wydaje następny). Wygasły JWT nie wylogowuje:
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
import type { PilotRole } from '../../domain/roles.ts';

/** Czas życia JWT (s) — krótki, bo odświeżenie jest tanie i automatyczne. */
export const ACCESS_TTL_SEC = 60 * 60;

/** Czas życia refresh tokenu (dni) — pokrywa sezon pracy w terenie bez logowania. */
export const REFRESH_TTL_DAYS = 90;

export interface AuthTokens {
  token: string;
  refreshToken: string;
  /**
   * `role` jedzie w odpowiedzi, a nie tylko w tokenie: panel musi wiedzieć od razu po
   * zalogowaniu, które sekcje pokazać, a nie zgadywać po odmowach z kolejnych tras.
   * Aplikacja pilota pole ignoruje — dla niej nic się nie zmienia.
   */
  pilot: { id: string; code: string; name: string; role: PilotRole };
}

export type LoginResult =
  | { ok: true; tokens: AuthTokens }
  /** Jeden kod dla złego loginu i złego hasła — nie zdradzamy, które konta istnieją. */
  | { ok: false; reason: 'invalid_credentials' | 'account_disabled' };

export class AuthCommands {
  constructor(
    private readonly pilots: PilotsPort,
    private readonly refreshTokens: RefreshTokensPort,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async login(login: string, password: string): Promise<LoginResult> {
    const account = await this.pilots.findByLogin(login);
    // Hasło weryfikujemy także dla nieistniejącego konta (stały koszt odpowiedzi) —
    // inaczej czas odpowiedzi zdradzałby, które loginy istnieją.
    const valid =
      account != null
        ? await this.hasher.verify(password, account.passwordHash)
        : ((await this.hasher.verify(password, DUMMY_HASH)), false);

    if (account == null || !valid) return { ok: false, reason: 'invalid_credentials' };
    if (!account.active) return { ok: false, reason: 'account_disabled' };

    return { ok: true, tokens: await this.issueFor(account) };
  }

  /** Rotacja: zużywa refresh i wydaje świeżą parę ATOMOWO. `null` = token martwy. */
  async refresh(refreshToken: string): Promise<AuthTokens | null> {
    const expiresAt = new Date(
      this.clock.now().getTime() + REFRESH_TTL_DAYS * 24 * 3_600_000,
    );
    const rotated = await this.refreshTokens.rotate(refreshToken, expiresAt);
    if (rotated == null) return null;

    const account = await this.pilots.findById(rotated.pilotId);
    // Konto skasowane/wyłączone PO rotacji: token przepada razem z odmową — i dobrze,
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
