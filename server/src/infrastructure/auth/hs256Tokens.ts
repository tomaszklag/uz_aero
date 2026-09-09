/**
 * UZ Aero (serwer) - JWT HS256 na `node:crypto`.
 *
 * Świadomie bez biblioteki: potrzebujemy DOKŁADNIE jednego wariantu (HS256, jeden
 * sekret, kilka claims), a historyczne CVE bibliotek JWT to w większości confusion
 * algorytmów, które tu jest niemożliwe - weryfikacja przyjmuje wyłącznie nagłówek
 * o stałej treści. To nie jest „własna kryptografia": HMAC-SHA256 bierzemy z Node,
 * my tylko składamy kopertę wg RFC 7519.
 *
 * `verify` nigdy nie rzuca - zły token to `null`, a decyzję (401) podejmuje warstwa HTTP.
 *
 * ══ TRZY RODZAJE TOKENÓW, ROZŁĄCZNE PRZEZ CLAIM `purpose` ══
 *  • token KLUBU (bez `purpose`): `sub` + `org` + `code` + `role` - tożsamość pilota
 *    W KLUBIE, jedyny token otwierający trasy telefonu i panelu klubu;
 *  • token OSOBY (`purpose: 'person'`): osoba bez aktywnego członkostwa - czeka na
 *    decyzję klubu albo dopiero wpisze kod klubu (wielofirmowość §4, epik D);
 *  • token PLATFORMOWY (`purpose: 'platform'`): superadministrator bez klubu.
 * Każda z trzech weryfikacji odrzuca dwa pozostałe rodzaje - inaczej poświadczenie
 * wystawione w jednym celu otwierałoby trasy innego.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  Clock,
  Identity,
  PersonIdentity,
  PlatformIdentity,
  TokenService,
  VerifiedIdentity,
  VerifiedPersonIdentity,
  VerifiedPlatformIdentity,
} from '../../application/common/ports.ts';
import { DEFAULT_ROLE, isPilotRole } from '../../domain/roles.ts';

const b64url = (data: Buffer | string): string =>
  Buffer.from(data).toString('base64url');

/** Stały nagłówek - jedyny, jaki podpisujemy i jedyny, jaki akceptujemy. */
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

/** Wartości claimu `purpose`, jakie ten serwer wydaje i rozpoznaje. */
const PERSON_PURPOSE = 'person';
const PLATFORM_PURPOSE = 'platform';

interface Claims {
  sub: string;
  /**
   * KLUB tokenu (wielofirmowość §6, decyzja właściciela 2026-09-08). Obowiązkowy
   * w tokenie klubu: token bez `org` - w tym każdy wydany przed 2.0.0 - jest dla tego
   * serwera NIEWAŻNY i telefon odświeża go z refresha, który klub zna (`refresh_tokens.org_id`).
   * Przełączenie klubu to nowa para tokenów, nie nagłówek żądania.
   */
  org?: string;
  code?: string;
  /**
   * PRZEZNACZENIE tokenu. Nieobecne = token klubu (pilota/panelu). `'person'` = osoba
   * BEZ aktywnego członkostwa (czeka na decyzję klubu albo dopiero wpisze kod klubu);
   * `'platform'` = superadministrator bez klubu.
   *
   * Claim istnieje wyłącznie po to, żeby trzy weryfikacje były ROZŁĄCZNE (patrz
   * `TokenService` w portach). Kontrola nie może opierać się na tym, że token osoby
   * nie niesie `code` ani `org` - to prawda przypadkowa, którą pierwsza zmiana
   * kształtu claimów cicho unieważni.
   */
  purpose?: string;
  /** Rola panelu W KLUBIE. Nieobecna w tokenach wydanych przed wprowadzeniem ról - patrz `verify`. */
  role?: string;
  /**
   * CHWILA WYDANIA w sekundach epoki (RFC 7519 `iat`). Dołożona 2026-08-01 razem
   * z `pilots.credentials_valid_from`: bez niej nie da się odpowiedzieć na pytanie
   * „czy to poświadczenie
   * jest starsze niż reset hasła", a JWT z natury nie ma jak unieważnić inaczej.
   * Nieobecna w tokenach wydanych wcześniej - patrz `verify`.
   */
  iat?: number;
  exp: number;
}

export class Hs256Tokens implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly clock: Clock,
  ) {
    // Krótki sekret czyni HMAC zgadywalnym - lepiej nie wystartować niż udawać podpis.
    if (secret.length < 32) {
      throw new Error('JWT_SECRET musi mieć co najmniej 32 znaki.');
    }
  }

  private hmac(input: string): Buffer {
    return createHmac('sha256', this.secret).update(input).digest();
  }

  /**
   * Wspólny rdzeń WSZYSTKICH weryfikacji: kształt koperty, podpis, `sub` i termin
   * ważności.
   *
   * Jedna implementacja, bo to są własności KOPERTY, a nie przeznaczenia tokenu -
   * druga kopia prędzej czy później zgubiłaby `timingSafeEqual` albo kontrolę `exp`
   * po jednej stronie, a różnicy nie widać w żadnym teście funkcjonalnym. Co RÓŻNI
   * te drogi, rozstrzygają wołający: claim `purpose`.
   */
  private claimsOf(token: string): Claims | null {
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
    if (typeof claims.sub !== 'string') return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= this.clock.now().getTime()) {
      return null;
    }
    return claims;
  }

  private seal(payload: Claims): string {
    const body = `${HEADER}.${b64url(JSON.stringify(payload))}`;
    return `${body}.${this.hmac(body).toString('base64url')}`;
  }

  private issuedNow(): number {
    return Math.floor(this.clock.now().getTime() / 1000);
  }

  sign(claims: Identity, ttlSec: number): string {
    const issuedAt = this.issuedNow();
    return this.seal({
      sub: claims.pilotId,
      org: claims.orgId,
      code: claims.code,
      role: claims.role,
      iat: issuedAt,
      exp: issuedAt + ttlSec,
    });
  }

  signPerson(claims: PersonIdentity, ttlSec: number): string {
    const issuedAt = this.issuedNow();
    return this.seal({
      sub: claims.pilotId,
      purpose: PERSON_PURPOSE,
      iat: issuedAt,
      exp: issuedAt + ttlSec,
    });
  }

  signPlatform(claims: PlatformIdentity, ttlSec: number): string {
    const issuedAt = this.issuedNow();
    return this.seal({
      sub: claims.pilotId,
      purpose: PLATFORM_PURPOSE,
      iat: issuedAt,
      exp: issuedAt + ttlSec,
    });
  }

  verifyPerson(token: string): VerifiedPersonIdentity | null {
    const claims = this.claimsOf(token);
    if (claims == null) return null;
    // Odwrotna strona rozdziału: token KLUBU ani PLATFORMOWY nie jest tokenem osoby.
    if (claims.purpose !== PERSON_PURPOSE) return null;
    // `iat` jak w `verify`: brak → 0, czyli „wydany przed czasem" - przegrywa z każdym
    // unieważnieniem poświadczeń, które ten token miałby otworzyć.
    const issuedAt = typeof claims.iat === 'number' ? claims.iat : 0;
    return { pilotId: claims.sub, issuedAt };
  }

  verifyPlatform(token: string): VerifiedPlatformIdentity | null {
    const claims = this.claimsOf(token);
    if (claims == null) return null;
    if (claims.purpose !== PLATFORM_PURPOSE) return null;
    const issuedAt = typeof claims.iat === 'number' ? claims.iat : 0;
    return { pilotId: claims.sub, issuedAt };
  }

  verify(token: string): VerifiedIdentity | null {
    const claims = this.claimsOf(token);
    if (claims == null) return null;

    // ══ TOKEN O INNYM PRZEZNACZENIU NIE JEST TOŻSAMOŚCIĄ ══
    // Token osoby i platformowy są podpisane naszym sekretem, więc HMAC je
    // przepuszcza - odróżnia je wyłącznie ten claim. Bez tej linii poświadczenie osoby
    // BEZ klubu (albo superadministratora bez klubu) otwierałoby trasy telefonu,
    // a `POST /events` pisałby zdarzenia do klubu, którego w tokenie nie ma.
    if (claims.purpose != null) return null;

    if (typeof claims.code !== 'string') return null;
    // ══ TOKEN BEZ KLUBU JEST NIEWAŻNY (wielofirmowość §6, §11) ══
    // Dotyczy każdego tokenu wydanego przed 2.0.0. Odrzucenie jest tu ŚWIADOME
    // i przyjęte: telefon odświeża go refreshem, który klub zna (backfill wpisał klub
    // domyślny w `refresh_tokens.org_id`), a do tego czasu chip pokazuje zwykłe
    // „OFFLINE · n". Alternatywa - domyślać się klubu - byłaby zgadywaniem, do czyich
    // danych ten token ma prawo.
    if (typeof claims.org !== 'string' || claims.org === '') return null;

    // Rola nieznana → `pilot`, czyli zero uprawnień w panelu. Cichy awans do wyższej
    // roli byłby luką - stąd domyślną jest NAJMNIEJSZA rola, nie żadna heurystyka.
    // Podpis HMAC gwarantuje, że nierozpoznana wartość może pochodzić tylko od nas.
    const role = isPilotRole(claims.role) ? claims.role : DEFAULT_ROLE;
    // Brak `iat` → `0`, czyli „wydany przed czasem": wobec znacznika unieważnienia
    // poświadczeń taki token przegrywa - domyślną wartością jest ta, która odbiera
    // dostęp, nigdy ta, która go przyznaje.
    const issuedAt = typeof claims.iat === 'number' ? claims.iat : 0;
    return { pilotId: claims.sub, orgId: claims.org, code: claims.code, role, issuedAt };
  }
}
