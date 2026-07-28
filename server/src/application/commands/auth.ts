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
  PilotsPort,
  RefreshTokensPort,
  TokenService,
} from '../ports.ts';

/** Czas życia JWT (s) — krótki, bo odświeżenie jest tanie i automatyczne. */
export const ACCESS_TTL_SEC = 60 * 60;

/** Czas życia refresh tokenu (dni) — pokrywa sezon pracy w terenie bez logowania. */
export const REFRESH_TTL_DAYS = 90;

export interface AuthTokens {
  token: string;
  refreshToken: string;
  pilot: { id: string; code: string; name: string };
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

    return { ok: true, tokens: await this.issueFor(account.id, account.code, account.name) };
  }

  /** Rotacja: zużywa refresh, wydaje świeżą parę. `null` = token nieznany/wygasły. */
  async refresh(refreshToken: string): Promise<AuthTokens | null> {
    const consumed = await this.refreshTokens.consume(refreshToken);
    if (consumed == null) return null;

    const account = await this.pilots.findById(consumed.pilotId);
    if (account == null || !account.active) return null;

    return this.issueFor(account.id, account.code, account.name);
  }

  private async issueFor(id: string, code: string, name: string): Promise<AuthTokens> {
    const expiresAt = new Date(
      this.clock.now().getTime() + REFRESH_TTL_DAYS * 24 * 3_600_000,
    );
    return {
      token: this.tokens.sign({ pilotId: id, code }, ACCESS_TTL_SEC),
      refreshToken: await this.refreshTokens.issue(id, expiresAt),
      pilot: { id, code, name },
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
