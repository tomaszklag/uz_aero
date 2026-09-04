/**
 * UZ Aero (serwer) - weryfikacja tokenu tożsamości Google (RS256 + JWKS).
 *
 * Ta sama zasada, co w `hs256Tokens.ts`: bez biblioteki JWT, bo potrzebujemy DOKŁADNIE
 * jednego wariantu (RS256, klucze Google, znany zbiór odbiorców), a kryptografię bierzemy
 * z `node:crypto`. Historyczne CVE bibliotek JWT to w większości confusion algorytmów -
 * tutaj niemożliwa, bo akceptujemy wyłącznie `alg: 'RS256'` i wyłącznie klucze pobrane
 * z punktu Google.
 *
 * ══ CO SPRAWDZAMY I DLACZEGO AKURAT TO ══
 *  • **podpis** kluczem o `kid` z nagłówka - pobranym z JWKS Google, nigdy z tokenu;
 *  • **`iss`** - jedna z dwóch form, które Google wydaje (z `https://` i bez);
 *  • **`aud`** - MUSI być jednym z NASZYCH identyfikatorów klienta. To jest kontrola,
 *    która oddziela „ktoś zalogował się do UZ Aero" od „ktoś ma dowolny token Google":
 *    bez niej token wydany innej aplikacji otwierałby nasze konta;
 *  • **`exp`** (i `iat` z tolerancją) - token Google żyje godzinę.
 *
 * ══ CZEGO NIE SPRAWDZAMY: `nonce` ══
 * I to jest decyzja, nie przeoczenie. `nonce` broni przed powtórzeniem odpowiedzi
 * autoryzacyjnej i weryfikuje go ten, KTO GO WYGENEROWAŁ - czyli aplikacja: porównuje
 * wartość z tokenu z tą, którą sama wysłała. Serwer nie zna tej wartości, więc mógłby
 * co najwyżej porównać `nonce` z `nonce` przysłanym w tym samym żądaniu - co nie
 * dowodzi niczego, bo napastnik dostarczyłby zgodną parę. Sensowna kontrola po tej
 * stronie wymagałaby, żeby to SERWER wydawał nonce i pamiętał go między żądaniami;
 * przy `aud` + podpisie + godzinnym `exp` nie kupuje to tyle, ile kosztuje stan.
 */

import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';

import type {
  Clock,
  IdentityProviderPort,
  ProviderProfile,
} from '../../application/common/ports.ts';

/** Punkt kluczy publicznych Google (OpenID Connect Discovery). */
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** Obie formy wydawcy, jakie Google wypisuje w tokenach. */
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/** Tolerancja rozjazdu zegarów (s) - ta sama, którą stosuje biblioteka Google. */
const CLOCK_SKEW_SEC = 300;

/** Awaryjny czas życia cache kluczy, gdy odpowiedź nie niesie `Cache-Control`. */
const FALLBACK_TTL_MS = 60 * 60 * 1000;

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface GoogleClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}

const decodeSegment = (segment: string): unknown => {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;
  } catch {
    return null;
  }
};

/**
 * Pobieranie JWKS wstrzykiwane, żeby test nie chodził do sieci. Domyślnie `fetch`.
 */
export type JwksFetch = () => Promise<{ keys: Jwk[]; ttlMs: number } | null>;

const defaultJwksFetch: JwksFetch = async () => {
  const res = await fetch(JWKS_URL);
  if (!res.ok) return null;
  const body = (await res.json()) as { keys?: Jwk[] };
  if (!Array.isArray(body.keys)) return null;

  // Google podaje `max-age` i rotuje klucze rzadko - trzymamy się jego terminu,
  // zamiast zgadywać własny. Odświeżenie ZA WCZEŚNIE kosztuje żądanie, ZA PÓŹNO
  // kosztuje odrzucone logowania po rotacji, więc źródłem prawdy jest nagłówek.
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '');
  const ttlMs = maxAge?.[1] != null ? Number(maxAge[1]) * 1000 : FALLBACK_TTL_MS;
  return { keys: body.keys, ttlMs };
};

export class GoogleIdTokens implements IdentityProviderPort {
  private cached: { keys: Jwk[]; expiresAt: number } | null = null;
  /** Jedno pobranie naraz - zimny start nie ma zasypywać Google N żądaniami. */
  private inFlight: Promise<Jwk[] | null> | null = null;

  /**
   * @param audiences NASZE identyfikatory klienta - Web i Android mają OSOBNE, a token
   *   niesie ten, dla którego został wydany. Zbiór, nie pojedyncza wartość, bo obie
   *   powierzchnie logują się do tego samego serwera.
   */
  constructor(
    private readonly audiences: readonly string[],
    private readonly clock: Clock,
    private readonly fetchJwks: JwksFetch = defaultJwksFetch,
  ) {
    if (audiences.length === 0) {
      // Pusty zbiór odbiorców przepuszczałby KAŻDY token Google - lepiej nie wstać.
      throw new Error('GoogleIdTokens: potrzebny co najmniej jeden GOOGLE_CLIENT_ID.');
    }
  }

  async verifyIdToken(idToken: string): Promise<ProviderProfile | null> {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const header = decodeSegment(parts[0]!) as { alg?: unknown; kid?: unknown } | null;
    if (header == null || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

    const key = await this.publicKey(header.kid);
    if (key == null) return null;

    const signed = `${parts[0]}.${parts[1]}`;
    let signature: Buffer;
    try {
      signature = Buffer.from(parts[2]!, 'base64url');
    } catch {
      return null;
    }
    if (!createVerify('RSA-SHA256').update(signed).verify(key, signature)) return null;

    const claims = decodeSegment(parts[1]!) as GoogleClaims | null;
    if (claims == null) return null;

    if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) return null;
    if (typeof claims.aud !== 'string' || !this.audiences.includes(claims.aud)) return null;
    if (typeof claims.sub !== 'string' || claims.sub === '') return null;

    const nowSec = Math.floor(this.clock.now().getTime() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SEC <= nowSec) return null;
    if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_SEC > nowSec) return null;

    // Bez e-maila nie ma czego pokazać administratorowi przy decyzji ani po czym
    // podpiąć istniejącego konta - a token bez `email` znaczy, że nie poprosiliśmy
    // o zakres `email`. To błąd konfiguracji klienta, nie stan do obsłużenia.
    if (typeof claims.email !== 'string' || claims.email === '') return null;

    return {
      provider: 'google',
      subject: claims.sub,
      email: claims.email,
      // Domyślna wartość idzie w stronę BEZPIECZNĄ: brak claimu znaczy „niezweryfikowany",
      // więc konto NIE podepnie się po e-mailu (§6).
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === 'string' && claims.name !== '' ? claims.name : claims.email,
    };
  }

  /**
   * Klucz o danym `kid` - z cache, a po jego wygaśnięciu (albo przy nieznanym `kid`)
   * po świeżym pobraniu. Nieznany `kid` przy WAŻNYM cache znaczy zwykle rotację kluczy
   * przed terminem, więc jedna próba odświeżenia jest tańsza niż odrzucone logowania.
   */
  private async publicKey(kid: string): Promise<KeyObject | null> {
    const fromCache = this.findKey(this.cached?.keys, kid);
    if (fromCache != null && (this.cached?.expiresAt ?? 0) > this.clock.now().getTime()) {
      return toKeyObject(fromCache);
    }

    const fresh = await this.load();
    const jwk = this.findKey(fresh ?? undefined, kid);
    return jwk == null ? null : toKeyObject(jwk);
  }

  private findKey(keys: Jwk[] | undefined, kid: string): Jwk | null {
    return keys?.find((k) => k.kid === kid && k.kty === 'RSA') ?? null;
  }

  private async load(): Promise<Jwk[] | null> {
    this.inFlight ??= (async () => {
      try {
        const fetched = await this.fetchJwks();
        if (fetched == null) return null;
        this.cached = {
          keys: fetched.keys,
          expiresAt: this.clock.now().getTime() + fetched.ttlMs,
        };
        return fetched.keys;
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }
}

function toKeyObject(jwk: Jwk): KeyObject | null {
  if (typeof jwk.n !== 'string' || typeof jwk.e !== 'string') return null;
  try {
    return createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
  } catch {
    return null;
  }
}
