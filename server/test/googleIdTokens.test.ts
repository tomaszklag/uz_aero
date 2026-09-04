/**
 * UZ Aero (serwer) - weryfikacja tokenu tożsamości Google (`GoogleIdTokens`).
 *
 * ══ TO JEST TEN PLIK, KTÓREGO ATRAPA DOSTAWCY NIE ZASTĘPUJE ══
 * Wszystkie pozostałe testy logowania biorą `TestIdentityProvider` i sprawdzają, co
 * dzieje się PO weryfikacji (podpięcie konta, zgłoszenie, brama panelu). Tutaj jest
 * druga połowa: czy weryfikacja w ogóle coś odrzuca. Kluczy Google nie mamy, więc
 * generujemy WŁASNĄ parę RSA w procesie i podstawiamy ją jako JWKS - podpis, `iss`,
 * `aud` i termin sprawdza dokładnie ten kod, który pojedzie na produkcję.
 *
 * Każdy przypadek niżej opisuje sposób, w jaki ktoś mógłby wejść na cudze konto.
 */

import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { GoogleIdTokens, type JwksFetch } from '../src/infrastructure/auth/googleIdTokens.ts';
import { TestClock } from './helpers.ts';

const CLIENT_ID = '1234567890-uzaero.apps.googleusercontent.com';
const KID = 'test-key-1';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const jwks: JwksFetch = async () => ({ keys: [jwk as never], ttlMs: 3_600_000 });

const b64 = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** Token podpisany NASZYM kluczem - poza tym w pełni prawdziwej budowy. */
function signToken(
  claims: Record<string, unknown>,
  options: { kid?: string; alg?: string; key?: typeof privateKey } = {},
): string {
  const header = b64({ alg: options.alg ?? 'RS256', typ: 'JWT', kid: options.kid ?? KID });
  const payload = b64(claims);
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(options.key ?? privateKey)
    .toString('base64url');
  return `${header}.${payload}.${signature}`;
}

const clock = new TestClock();
const nowSec = Math.floor(clock.now().getTime() / 1000);

const validClaims = {
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '117512345678901234567',
  email: 'pilot@gmail.com',
  email_verified: true,
  name: 'Jan Pilot',
  iat: nowSec,
  exp: nowSec + 3600,
};

const verifier = () => new GoogleIdTokens([CLIENT_ID], clock, jwks);

describe('GoogleIdTokens - token poprawny', () => {
  it('oddaje profil z `sub`, e-mailem i znacznikiem weryfikacji adresu', async () => {
    expect(await verifier().verifyIdToken(signToken(validClaims))).toEqual({
      provider: 'google',
      subject: '117512345678901234567',
      email: 'pilot@gmail.com',
      emailVerified: true,
      name: 'Jan Pilot',
    });
  });

  it('przyjmuje obie formy wydawcy, które Google naprawdę wypisuje', async () => {
    const short = signToken({ ...validClaims, iss: 'accounts.google.com' });
    expect(await verifier().verifyIdToken(short)).not.toBeNull();
  });

  it('bez `name` bierze e-mail - administrator musi mieć co zobaczyć na liście', async () => {
    const { name, ...bezImienia } = validClaims;
    expect((await verifier().verifyIdToken(signToken(bezImienia)))?.name).toBe('pilot@gmail.com');
  });

  it('`email_verified` inne niż `true` schodzi do FAŁSZU - domyślna jest strona bezpieczna', async () => {
    // Od tego pola zależy podpięcie konta po e-mailu (§6), więc „brak informacji"
    // nie ma prawa znaczyć „zweryfikowany".
    const bez = signToken({ ...validClaims, email_verified: undefined });
    expect((await verifier().verifyIdToken(bez))?.emailVerified).toBe(false);

    const napis = signToken({ ...validClaims, email_verified: 'true' });
    expect((await verifier().verifyIdToken(napis))?.emailVerified).toBe(false);
  });
});

describe('GoogleIdTokens - odmowy', () => {
  it('ODRZUCA token dla CUDZEJ aplikacji - to jest ta kontrola, na której stoi wszystko', async () => {
    // Bez sprawdzenia `aud` każdy token Google z dowolnej aplikacji na świecie
    // otwierałby konta w UZ Aero.
    const obcy = signToken({ ...validClaims, aud: 'inna-aplikacja.apps.googleusercontent.com' });
    expect(await verifier().verifyIdToken(obcy)).toBeNull();
  });

  it('ODRZUCA podpis obcym kluczem, choć wszystkie claims się zgadzają', async () => {
    const inny = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const podrobiony = signToken(validClaims, { key: inny.privateKey });
    expect(await verifier().verifyIdToken(podrobiony)).toBeNull();
  });

  it('ODRZUCA podmieniony payload przy zachowanym podpisie', async () => {
    const [h, , s] = signToken(validClaims).split('.');
    const evil = b64({ ...validClaims, sub: 'ktos-inny' });
    expect(await verifier().verifyIdToken(`${h}.${evil}.${s}`)).toBeNull();
  });

  it('ODRZUCA `alg` inny niż RS256 - w tym `none`', async () => {
    // Klasyczne CVE bibliotek JWT: token z `alg: none` przechodzi bez podpisu.
    const none = `${b64({ alg: 'none', typ: 'JWT', kid: KID })}.${b64(validClaims)}.`;
    expect(await verifier().verifyIdToken(none)).toBeNull();
    expect(await verifier().verifyIdToken(signToken(validClaims, { alg: 'HS256' }))).toBeNull();
  });

  it('ODRZUCA obcego wydawcę', async () => {
    const obcy = signToken({ ...validClaims, iss: 'https://zly.example.com' });
    expect(await verifier().verifyIdToken(obcy)).toBeNull();
  });

  it('ODRZUCA token PRZETERMINOWANY - z tolerancją zegarów, ale skończoną', async () => {
    const stary = signToken({ ...validClaims, exp: nowSec - 3600 });
    expect(await verifier().verifyIdToken(stary)).toBeNull();

    // Tuż po terminie, w oknie tolerancji 300 s, token jeszcze działa - rozjazd
    // zegarów telefonu i serwera jest normalny i nie może wywracać logowania.
    const ledwo = signToken({ ...validClaims, exp: nowSec - 60 });
    expect(await verifier().verifyIdToken(ledwo)).not.toBeNull();
  });

  it('ODRZUCA token bez `sub` i bez `email` - nie ma czego zapisać ani pokazać', async () => {
    const { sub, ...bezSub } = validClaims;
    expect(await verifier().verifyIdToken(signToken(bezSub))).toBeNull();

    const { email, ...bezEmail } = validClaims;
    expect(await verifier().verifyIdToken(signToken(bezEmail))).toBeNull();
  });

  it('ODRZUCA token o NIEZNANYM `kid`, gdy Google go nie zna', async () => {
    expect(await verifier().verifyIdToken(signToken(validClaims, { kid: 'obcy-kid' }))).toBeNull();
  });

  it('ODRZUCA, gdy kluczy nie da się pobrać - brak kluczy to nie jest zgoda', async () => {
    const bezKluczy = new GoogleIdTokens([CLIENT_ID], clock, async () => null);
    expect(await bezKluczy.verifyIdToken(signToken(validClaims))).toBeNull();
  });

  it('ODRZUCA napis, który nie jest tokenem', async () => {
    expect(await verifier().verifyIdToken('zupelnie-nie-token')).toBeNull();
    expect(await verifier().verifyIdToken('a.b')).toBeNull();
  });
});

describe('GoogleIdTokens - klucze i konfiguracja', () => {
  it('NIE WSTAJE bez ani jednego identyfikatora klienta', async () => {
    // Pusty zbiór odbiorców przepuszczałby każdy token Google - lepiej nie wystartować
    // niż udawać kontrolę.
    expect(() => new GoogleIdTokens([], clock, jwks)).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('przyjmuje token dla DRUGIEGO z naszych klientów (Web i Android mają osobne)', async () => {
    const android = 'android.apps.googleusercontent.com';
    const dwa = new GoogleIdTokens([CLIENT_ID, android], clock, jwks);
    expect(await dwa.verifyIdToken(signToken({ ...validClaims, aud: android }))).not.toBeNull();
  });

  it('pobiera JWKS RAZ i korzysta z cache przy kolejnych tokenach', async () => {
    let pobrania = 0;
    const liczacy: JwksFetch = async () => {
      pobrania += 1;
      return { keys: [jwk as never], ttlMs: 3_600_000 };
    };
    const v = new GoogleIdTokens([CLIENT_ID], clock, liczacy);

    await v.verifyIdToken(signToken(validClaims));
    await v.verifyIdToken(signToken(validClaims));
    await v.verifyIdToken(signToken(validClaims));

    expect(pobrania).toBe(1);
  });

  it('po ROTACJI kluczy pobiera je ponownie i przyjmuje nowy `kid`', async () => {
    // Google rotuje klucze; gdyby cache nie odświeżał się przy nieznanym `kid`,
    // wszystkie logowania padałyby do końca jego ważności.
    const nowa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    let aktualny = jwk;
    const rotujacy: JwksFetch = async () => ({ keys: [aktualny as never], ttlMs: 3_600_000 });
    const v = new GoogleIdTokens([CLIENT_ID], clock, rotujacy);

    expect(await v.verifyIdToken(signToken(validClaims))).not.toBeNull();

    aktualny = {
      ...nowa.publicKey.export({ format: 'jwk' }),
      kid: 'test-key-2',
      alg: 'RS256',
      use: 'sig',
    };
    const poRotacji = signToken(validClaims, { kid: 'test-key-2', key: nowa.privateKey });
    expect(await v.verifyIdToken(poRotacji)).not.toBeNull();
  });
});
