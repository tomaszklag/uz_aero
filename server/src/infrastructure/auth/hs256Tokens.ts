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

import type { Clock, TokenService } from '../../application/ports.ts';

const b64url = (data: Buffer | string): string =>
  Buffer.from(data).toString('base64url');

/** Stały nagłówek — jedyny, jaki podpisujemy i jedyny, jaki akceptujemy. */
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

interface Claims {
  sub: string;
  code: string;
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

  sign(claims: { pilotId: string; code: string }, ttlSec: number): string {
    const payload: Claims = {
      sub: claims.pilotId,
      code: claims.code,
      exp: Math.floor(this.clock.now().getTime() / 1000) + ttlSec,
    };
    const body = `${HEADER}.${b64url(JSON.stringify(payload))}`;
    return `${body}.${this.hmac(body).toString('base64url')}`;
  }

  verify(token: string): { pilotId: string; code: string } | null {
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

    return { pilotId: claims.sub, code: claims.code };
  }
}
