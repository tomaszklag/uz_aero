/**
 * UZ Aero (serwer) — JWT HS256 na `node:crypto`.
 *
 * Świadomie bez biblioteki: potrzebujemy DOKŁADNIE jednego wariantu (HS256, jeden
 * sekret, dwa claims), a historyczne CVE bibliotek JWT to w większości confusion
 * algorytmów, które tu jest niemożliwe — weryfikacja przyjmuje wyłącznie nagłówek
 * o stałej treści. To nie jest „własna kryptografia": HMAC-SHA256 bierzemy z Node,
 * my tylko składamy kopertę wg RFC 7519.
 *
 * `verify` nigdy nie rzuca — zły token to `null`, a decyzję (401) podejmuje warstwa HTTP.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  Clock,
  Identity,
  TokenService,
  VerifiedIdentity,
} from '../../application/common/ports.ts';
import { DEFAULT_ROLE, isPilotRole } from '../../domain/roles.ts';

const b64url = (data: Buffer | string): string =>
  Buffer.from(data).toString('base64url');

/** Stały nagłówek — jedyny, jaki podpisujemy i jedyny, jaki akceptujemy. */
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

interface Claims {
  sub: string;
  code: string;
  /** Rola panelu. Nieobecna w tokenach wydanych przed wprowadzeniem ról — patrz `verify`. */
  role?: string;
  /**
   * CHWILA WYDANIA w sekundach epoki (RFC 7519 `iat`). Dołożona 2026-08-01 razem
   * z `pilots.credentials_valid_from`: bez niej nie da się odpowiedzieć na pytanie
   * „czy to poświadczenie
   * jest starsze niż reset hasła", a JWT z natury nie ma jak unieważnić inaczej.
   * Nieobecna w tokenach wydanych wcześniej — patrz `verify`.
   */
  iat?: number;
  exp: number;
}

export class Hs256Tokens implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly clock: Clock,
  ) {
    // Krótki sekret czyni HMAC zgadywalnym — lepiej nie wystartować niż udawać podpis.
    if (secret.length < 32) {
      throw new Error('JWT_SECRET musi mieć co najmniej 32 znaki.');
    }
  }

  private hmac(input: string): Buffer {
    return createHmac('sha256', this.secret).update(input).digest();
  }

  sign(claims: Identity, ttlSec: number): string {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    const payload: Claims = {
      sub: claims.pilotId,
      code: claims.code,
      role: claims.role,
      iat: issuedAt,
      exp: issuedAt + ttlSec,
    };
    const body = `${HEADER}.${b64url(JSON.stringify(payload))}`;
    return `${body}.${this.hmac(body).toString('base64url')}`;
  }

  verify(token: string): VerifiedIdentity | null {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== HEADER) return null;

    const body = `${parts[0]}.${parts[1]}`;
    const expected = this.hmac(body);
    let actual: Buffer;
    try {
      actual = Buffer.from(parts[2]!, 'base64url');
    } catch {
      return null;
    }
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    let claims: Claims;
    try {
      claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Claims;
    } catch {
      return null;
    }
    if (typeof claims.sub !== 'string' || typeof claims.code !== 'string') return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= this.clock.now().getTime()) {
      return null;
    }

    // Rola nieznana → `pilot`, czyli zero uprawnień w panelu. Dotyczy tokenów wydanych
    // przed wprowadzeniem ról: mają poprawny podpis, więc odrzucenie wylogowałoby telefony
    // w terenie bez powodu. Cichy awans do wyższej roli byłby natomiast luką — stąd
    // domyślną jest NAJMNIEJSZA rola, nie żadna heurystyka. Podpis HMAC gwarantuje,
    // że nierozpoznana wartość może pochodzić tylko od nas, nigdy od napastnika.
    const role = isPilotRole(claims.role) ? claims.role : DEFAULT_ROLE;
    // Brak `iat` → `0`, czyli „wydany przed czasem". Tokeny sprzed 2026-08-01 mają
    // poprawny podpis i mają dalej działać na trasach telefonu, ale wobec znacznika
    // unieważnienia poświadczeń muszą przegrywać: domyślną wartością jest ta, która
    // odbiera dostęp, nigdy ta, która go przyznaje.
    const issuedAt = typeof claims.iat === 'number' ? claims.iat : 0;
    return { pilotId: claims.sub, code: claims.code, role, issuedAt };
  }
}
