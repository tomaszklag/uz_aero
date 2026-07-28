/**
 * UZ Aero (serwer) — hasła przez scrypt z `node:crypto`.
 *
 * DLACZEGO NIE argon2: pakiet `argon2` to natywny addon (node-gyp), który musi się
 * skompilować na każdej maszynie — w tym na Windowsie dewelopera. Scrypt jest wbudowany
 * w Node, jest uznanym KDF-em (RFC 7914) i przy kilkunastu kontach klubu różnica
 * odporności wobec argon2id nie ma praktycznego znaczenia. Zero zależności > odrobina
 * teoretycznej przewagi.
 *
 * Format zapisu: `scrypt$N$r$p$saltB64$hashB64` — parametry W ZAPISIE, żeby dało się
 * je podnieść w przyszłości bez unieważniania istniejących haseł (stare wpisy weryfikują
 * się po swoich parametrach, nowe dostają mocniejsze).
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import type { PasswordHasher } from '../../application/ports.ts';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Parametry dla NOWYCH haseł. N=2^15 ≈ 100 ms na współczesnym laptopie. */
const PARAMS = { N: 32768, r: 8, p: 1 } as const;
const KEY_LEN = 64;
const SALT_LEN = 16;

export class ScryptHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LEN);
    const key = await scrypt(password, salt, KEY_LEN, {
      ...PARAMS,
      maxmem: 128 * PARAMS.N * PARAMS.r * 2,
    });
    return [
      'scrypt',
      PARAMS.N,
      PARAMS.r,
      PARAMS.p,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

    const salt = Buffer.from(saltB64!, 'base64');
    const expected = Buffer.from(hashB64!, 'base64');

    try {
      const actual = await scrypt(password, salt, expected.length, {
        N,
        r,
        p,
        maxmem: 128 * N * r * 2,
      });
      // Porównanie stałoczasowe — zwykłe `equals` przecieka długością wspólnego prefiksu.
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      return false; // uszkodzony wpis ≠ wyjątek na ścieżce logowania
    }
  }
}
