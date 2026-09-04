/**
 * UZ Aero (serwer) - testy uwierzytelnienia przez PRAWDZIWE endpointy.
 *
 * `app.inject()` przechodzi pełną ścieżkę Fastify (routing, walidacja, handler) bez
 * otwierania portu. Baza to PGlite, tożsamości i reguła podpięcia po e-mailu jadą
 * prawdziwym adapterem; jedyną atrapą jest weryfikacja podpisu Google - uzasadnienie
 * i granica w `testIdentityProvider.ts`, a sama weryfikacja ma własny plik testów.
 *
 * ══ CO TU JEST NAJWAŻNIEJSZE (2026-09-04) ══
 * Trzy stany logowania, których nie wolno pomylić: konto ZATWIERDZONE dostaje tokeny,
 * konto NIEZNANE dostaje zgłoszenie i token rejestracyjny (202), konto ODRZUCONE -
 * 403 z powodem. Do tego rozdział typów tokenu: rejestracyjny NIE JEST tożsamością.
 */

import { describe, expect, it } from 'vitest';

import { ACCESS_TTL_SEC } from '../src/application/common/commands/auth.ts';
import { testHarness } from './helpers.ts';
import { googleTokenFor, googleTokenForStranger } from './testIdentityProvider.ts';

const loginAs = (app: Awaited<ReturnType<typeof testHarness>>['app'], code: string) =>
  app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor(code) } });

describe('POST /auth/google - konto ZATWIERDZONE', () => {
  it('token Google konta z klubu → para tokenów i tożsamość pilota', async () => {
    const { app, tokens, clock } = await testHarness();

    const res = await loginAs(app, 'TMK');

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
      // CHWILA WYDANIA (`iat`, sekundy epoki) - bez niej brama panelu nie umiałaby
      // odpowiedzieć na pytanie „czy to poświadczenie jest starsze niż unieważnienie".
      issuedAt: Math.floor(clock.now().getTime() / 1000),
    });
    // …a refresh wystarczająco długi, żeby nie dało się go zgadywać.
    expect(String(body.refreshToken).length).toBeGreaterThanOrEqual(40);
  });

  it('PIERWSZE logowanie podpina konto po zweryfikowanym e-mailu - i tylko pierwsze', async () => {
    // To jest droga, którą po wdrożeniu wchodzą wszyscy dotychczasowi piloci razem
    // ze swoją historią lotów (`docs/logowanie-google.md` §6).
    const { app, db } = await testHarness();

    expect((await loginAs(app, 'PWI')).statusCode).toBe(200);

    const { rows } = await db.query<{ pilot_id: string; status: string; subject: string }>(
      `SELECT pilot_id, status, subject FROM external_identities`,
    );
    expect(rows).toEqual([
      { pilot_id: 'PWI', status: 'linked', subject: 'google-sub-PWI' },
    ]);

    // Drugie logowanie idzie już po `subject`, nie po e-mailu - i nie dokłada wiersza.
    expect((await loginAs(app, 'PWI')).statusCode).toBe(200);
    const after = await db.query<{ count: unknown }>(
      'SELECT count(*) AS count FROM external_identities',
    );
    expect(Number(after.rows[0]?.count)).toBe(1);
  });

  it('konto WYŁĄCZONE nie dostaje tokenów, choć token Google jest poprawny', async () => {
    const { app, db } = await testHarness();
    await loginAs(app, 'PWI'); // najpierw podpięcie
    await db.query(`UPDATE pilots SET active = FALSE WHERE id = 'PWI'`);

    const res = await loginAs(app, 'PWI');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'account_disabled' });
  });

  it('konto WYŁĄCZONE PRZED pierwszym logowaniem: odmowa, a NIE świeże zgłoszenie', async () => {
    // Regresja po pierwszym przebiegu testów Etapu B: z `AND p.active` w podpięciu
    // wyłączony pilot spadał do ścieżki „konto nieznane" i dostawał 202 ze zgłoszeniem,
    // które administrator mógłby zatwierdzić - zakładając mu drugie konto.
    const { app, db } = await testHarness();
    await db.query(`UPDATE pilots SET active = FALSE WHERE id = 'JSE'`);

    const res = await loginAs(app, 'JSE');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'account_disabled' });

    // Tożsamość podpięła się do ISTNIEJĄCEGO konta - w tabeli nie ma żadnego `pending`.
    const { rows } = await db.query<{ status: string; pilot_id: string | null }>(
      `SELECT status, pilot_id FROM external_identities WHERE subject = 'google-sub-JSE'`,
    );
    expect(rows).toEqual([{ status: 'linked', pilot_id: 'JSE' }]);
  });
});

describe('POST /auth/google - konto NIEZNANE zakłada zgłoszenie', () => {
  it('202 z tokenem rejestracyjnym i danymi z Google - NIE tokeny pilota', async () => {
    const { app } = await testHarness();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('nowy1') },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe('pending');
    expect(body.registration).toMatchObject({
      email: 'nowy1@gmail.com',
      name: 'Nieznajomy nowy1',
      status: 'pending',
    });
    expect(typeof body.registrationToken).toBe('string');
    // Najważniejsze zdanie tego przypadku: zgłoszenie NIE dostaje tożsamości.
    expect(body.token).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
  });

  it('zgłoszenie NIE zakłada konta pilota - bo brak konta JEST bramą dostępu', async () => {
    const { app, db } = await testHarness();
    const before = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');

    await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('nowy2') },
    });

    const after = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');
    expect(Number(after.rows[0]?.count)).toBe(Number(before.rows[0]?.count));
  });

  it('token rejestracyjny NIE otwiera tras pilota - to nie jest tożsamość', async () => {
    // Własność bezpieczeństwa z §5: bez rozdziału `verify`/`verifyRegistration` token
    // zgłoszenia byłby ważną tożsamością wskazującą nieistniejące konto, a `POST /events`
    // pisałby zdarzenia z `pilot_id`, za którym nikt nie stoi.
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('nowy3') },
    });
    const registrationToken = res.json().registrationToken as string;

    const reference = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${registrationToken}` },
    });
    expect(reference.statusCode).toBe(401);
  });

  it('`GET /auth/registration` czyta stan zgłoszenia TYM tokenem', async () => {
    const { app } = await testHarness();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('nowy4') },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/auth/registration',
      headers: { authorization: `Bearer ${login.json().registrationToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'pending',
      registration: { email: 'nowy4@gmail.com' },
    });
  });

  it('`GET /auth/registration` odrzuca token PILOTA - rozłączność działa w obie strony', async () => {
    const { app } = await testHarness();
    const pilotToken = (await loginAs(app, 'TMK')).json().token as string;

    const res = await app.inject({
      method: 'GET',
      url: '/auth/registration',
      headers: { authorization: `Bearer ${pilotToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /auth/google - token nie do przyjęcia', () => {
  it('nierozpoznany token → 401, bez zdradzania czegokolwiek o kontach', async () => {
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: 'to-nie-jest-nasz-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_token' });
  });

  it('brak pól → 400, nie 500', async () => {
    const { app } = await testHarness();
    const res = await app.inject({ method: 'POST', url: '/auth/google', payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /auth/refresh - rotacja', () => {
  it('zużycie refresha wydaje NOWĄ parę i unieważnia stary token', async () => {
    const { app } = await testHarness();
    const first = (await loginAs(app, 'TMK')).json().refreshToken as string;

    const rotated = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first },
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().refreshToken).not.toBe(first);

    // Stary token po rotacji jest martwy - skradziony-i-użyty unieważnia się sam.
    const replay = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first },
    });
    expect(replay.statusCode).toBe(401);
  });

  it('wygasły refresh nie odnawia sesji', async () => {
    const { app, clock } = await testHarness();
    const login = await loginAs(app, 'TMK');

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
  it('wygasa po ACCESS_TTL_SEC - weryfikacja zależy od zegara, nie od łaski', async () => {
    const { app, clock, tokens } = await testHarness();
    const jwt = (await loginAs(app, 'TMK')).json().token as string;

    expect(tokens.verify(jwt)).not.toBeNull();
    clock.advance((ACCESS_TTL_SEC + 1) * 1000);
    expect(tokens.verify(jwt)).toBeNull();
  });

  it('podpis z innym sekretem i przerobiony payload są odrzucane', async () => {
    const { app, clock } = await testHarness();
    const jwt = (await loginAs(app, 'TMK')).json().token as string;
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
