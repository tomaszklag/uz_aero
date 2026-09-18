/**
 * Ninerdeck (serwer) - skrót hasła: scrypt z `node:crypto` w zapisie PHC
 * (`PasswordHasher`; 2.1.0, `docs/logowanie-haslem.md` §3 D3, §8 pkt 1).
 *
 * ══ DLACZEGO SCRYPT, NIE ARGON2ID ══
 * Argon2id byłby pierwszym wyborem, ale wymaga modułu natywnego, a projekt ich nie
 * dokłada (ta sama reguła, przez którą mapa śladu ma własny renderer). scrypt jest
 * w stdlib Node i przy N=2¹⁷, r=8, p=1 (zalecenie OWASP) kosztuje ~100 ms i 128 MiB
 * na próbę - dość, żeby słownik po wycieku tabeli był nieopłacalny.
 *
 * ══ PARAMETRY W NAPISIE, NIE W KODZIE ══
 * `$scrypt$ln=17,r=8,p=1$<sól b64>$<skrót b64>` - zapis PHC. Gdy composition root
 * podniesie koszt, stare skróty dalej się weryfikują (parametry czyta się z wiersza),
 * a `needsRehash` mówi logowaniu, że po udanej weryfikacji ma policzyć skrót od nowa.
 * Migracji hasła nie da się zrobić inaczej: serwer nie zna hasła, dopóki człowiek go
 * nie wpisze.
 *
 * ══ SKRÓT ZASTĘPCZY ══
 * `dummyHash()` to prawdziwy skrót losowego hasła policzony raz przy starcie. Logowanie
 * porównuje z nim, gdy loginu nie ma albo osoba nie ma hasła - koszt jest ten sam, co
 * przy prawdziwym skrócie, więc czas odpowiedzi nie wylicza kont. Wynik jest zawsze
 * `false`: hasła, którym go policzono, nikt nie zna.
 *
 * Testy podają `{ ln: 10 }` - kilkaset razy taniej i ten sam kod; produkcja bierze
 * domyślne parametry z tego pliku.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import type { PasswordHasher } from '../../application/common/ports.ts';

export interface ScryptParams {
  /** log₂ N - koszt CPU i pamięci naraz (N=2^ln bloków po 128·r bajtów). */
  ln: number;
  r: number;
  p: number;
}

/** OWASP (2023): N=2¹⁷, r=8, p=1 - ~128 MiB i ~100 ms na współczesnym serwerze. */
export const SCRYPT_DEFAULT_PARAMS: ScryptParams = { ln: 17, r: 8, p: 1 };

const SALT_BYTES = 16;
const KEY_BYTES = 32;

interface Parsed {
  params: ScryptParams;
  salt: Buffer;
  hash: Buffer;
}

export class ScryptHasher implements PasswordHasher {
  private readonly params: ScryptParams;
  private dummyPhc: string | null = null;

  constructor(params: Partial<ScryptParams> = {}) {
    this.params = { ...SCRYPT_DEFAULT_PARAMS, ...params };
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(password, salt, this.params);
    const { ln, r, p } = this.params;
    return `$scrypt$ln=${ln},r=${r},p=${p}$${b64(salt)}$${b64(key)}`;
  }

  async verify(password: string, phc: string): Promise<boolean> {
    const parsed = parsePhc(phc);
    if (parsed == null) return false;
    const key = await derive(password, parsed.salt, parsed.params);
    return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash);
  }

  needsRehash(phc: string): boolean {
    const parsed = parsePhc(phc);
    if (parsed == null) return true;
    const { ln, r, p } = this.params;
    return parsed.params.ln < ln || parsed.params.r !== r || parsed.params.p !== p;
  }

  /** Składany RAZ, leniwie, z losowej soli i losowego „skrótu" - patrz `makeDummy`. */
  dummyHash(): string {
    return (this.dummyPhc ??= makeDummy(this.params));
  }
}

/**
 * Skrót zastępczy to zapis PHC o właściwym kształcie i LOSOWEJ treści - nie trzeba liczyć
 * do niego scryptu, bo nikt nigdy nie ma się z nim zgodzić. `verify` przeciw niemu
 * wykonuje pełny scrypt na bieżących parametrach (ten sam koszt, co przy prawdziwym
 * wierszu) i zawsze kończy się `false`: hasła, które dałoby te bajty, nie ma.
 */
function makeDummy(params: ScryptParams): string {
  const { ln, r, p } = params;
  return `$scrypt$ln=${ln},r=${r},p=${p}$${b64(randomBytes(SALT_BYTES))}$${b64(randomBytes(KEY_BYTES))}`;
}

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const N = 2 ** params.ln;
  // `maxmem` domyślnie 32 MiB - za mało dla N=2¹⁷, r=8 (128 MiB); liczymy z zapasem.
  const maxmem = 128 * N * params.r * 2;
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N, r: params.r, p: params.p, maxmem }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

const PHC = /^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** Zapis obcy albo uszkodzony → `null`; wołający traktuje to jak niezgodne hasło. */
export function parsePhc(phc: string): Parsed | null {
  const m = PHC.exec(phc);
  if (m == null) return null;
  const ln = Number(m[1]);
  const r = Number(m[2]);
  const p = Number(m[3]);
  if (!Number.isInteger(ln) || ln < 1 || ln > 30 || r < 1 || p < 1) return null;
  return {
    params: { ln, r, p },
    salt: Buffer.from(m[4]!, 'base64'),
    hash: Buffer.from(m[5]!, 'base64'),
  };
}

/** PHC używa base64 BEZ dopełnienia `=`. */
const b64 = (bytes: Buffer): string => bytes.toString('base64').replace(/=+$/, '');
