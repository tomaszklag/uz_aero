/**
 * UZ Aero (serwer) — testy uwierzytelnienia przez PRAWDZIWE endpointy.
 *
 * `app.inject()` przechodzi pełną ścieżkę Fastify (routing, walidacja, handler) bez
 * otwierania portu. Baza to PGlite, hasła to prawdziwy scrypt — atrap nie ma wcale.
 */

import { describe, expect, it } from 'vitest';

import { ACCESS_TTL_SEC } from '../src/application/common/commands/auth.ts';
import { TEST_PASSWORD, testHarness } from './helpers.ts';

describe('POST /auth/login', () => {
  it('poprawne dane → para tokenów i tożsamość pilota', async () => {
    const { app, tokens, clock } = await testHarness();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pilot).toEqual({
      id: 'TMK',
      code: 'TMK',
      name: 'Tomasz Małkiewicz',
      role: 'admin',
    });
    // JWT ma być od razu użyteczny…
    expect(tokens.verify(body.token)).toEqual({
      pilotId: 'TMK',
      code: 'TMK',
      role: 'admin',
      // CHWILA WYDANIA (`iat`, sekundy epoki) — dołożona 2026-08-01 razem
      // z `pilots.credentials_valid_from`.
      // Bez niej brama panelu nie umiałaby odpowiedzieć na pytanie „czy to poświadczenie
      // jest starsze niż reset hasła", bo JWT nie ma jak unieważnić inaczej.
      issuedAt: Math.floor(clock.now().getTime() / 1000),
    });
    // …a refresh wystarczająco długi, żeby nie dało się go zgadywać.
    expect(String(body.refreshToken).length).toBeGreaterThanOrEqual(40);
  });

  it('login działa też e-mailem i bez rozróżniania wielkości liter', async () => {
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'ToMaSz@uzaero.pl', password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
  });

  it('złe hasło i nieistniejące konto dają IDENTYCZNĄ odpowiedź', async () => {
    // Różnica treści zdradzałaby, które loginy istnieją — enumeracja kont.
    const { app } = await testHarness();

    const wrongPass = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'TMK', password: 'zle-haslo' },
    });
    const noAccount = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'GHOST', password: 'zle-haslo' },
    });

    expect(wrongPass.statusCode).toBe(401);
    expect(noAccount.statusCode).toBe(401);
    expect(wrongPass.body).toBe(noAccount.body);
  });

  it('brak pól → 400, nie 500', async () => {
    const { app } = await testHarness();
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /auth/refresh — rotacja', () => {
  it('zużycie refresha wydaje NOWĄ parę i unieważnia stary token', async () => {
    const { app } = await testHarness();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });
    const first = login.json().refreshToken as string;

    const rotated = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first },
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().refreshToken).not.toBe(first);

    // Stary token po rotacji jest martwy — skradziony-i-użyty unieważnia się sam.
    const replay = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first },
    });
    expect(replay.statusCode).toBe(401);
  });

  it('wygasły refresh nie odnawia sesji', async () => {
    const { app, clock } = await testHarness();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });

    clock.advance(91 * 24 * 3_600_000); // za horyzontem REFRESH_TTL_DAYS

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: login.json().refreshToken },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('JWT', () => {
  it('wygasa po ACCESS_TTL_SEC — weryfikacja zależy od zegara, nie od łaski', async () => {
    const { app, clock, tokens } = await testHarness();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });
    const jwt = login.json().token as string;

    expect(tokens.verify(jwt)).not.toBeNull();
    clock.advance((ACCESS_TTL_SEC + 1) * 1000);
    expect(tokens.verify(jwt)).toBeNull();
  });

  it('podpis z innym sekretem i przerobiony payload są odrzucane', async () => {
    const { app, clock } = await testHarness();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });
    const jwt = login.json().token as string;
    const { Hs256Tokens } = await import('../src/infrastructure/auth/hs256Tokens.ts');
    const forged = new Hs256Tokens('inny-sekret-o-dlugosci-32-znakow!!', clock);

    expect(forged.verify(jwt)).toBeNull();

    // Podmiana środkowej części (payload) bez przeliczenia podpisu.
    const [h, , s] = jwt.split('.');
    const evil = Buffer.from(JSON.stringify({ sub: 'KRZ', code: 'KRZ', exp: 9e9 })).toString(
      'base64url',
    );
    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${h}.${evil}.${s}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
