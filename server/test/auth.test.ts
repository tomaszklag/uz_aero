/**
 * Ninerdeck (serwer) - testy uwierzytelnienia przez PRAWDZIWE endpointy.
 *
 * `app.inject()` przechodzi pełną ścieżkę Fastify (routing, walidacja, handler) bez
 * otwierania portu. Baza to PGlite, tożsamości i reguła podpięcia po e-mailu jadą
 * prawdziwym adapterem; jedyną atrapą jest weryfikacja podpisu Google - uzasadnienie
 * i granica w `testIdentityProvider.ts`, a sama weryfikacja ma własny plik testów.
 *
 * ══ CO TU JEST NAJWAŻNIEJSZE (2026-09-04, przepisane w epiku D 2026-09-09) ══
 * Dwa stany logowania, których nie wolno pomylić: osoba z aktywnym CZŁONKOSTWEM dostaje
 * tokeny klubu, osoba BEZ klubu (nieznajomy, czekający, odrzucony) dostaje 202 z tokenem
 * OSOBY i stanem, po którym aplikacja wybiera ekran. Do tego rozdział typów tokenu:
 * token osoby NIE JEST tożsamością klubu. Dołączanie kodem klubu: `joinClub.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { ACCESS_TTL_SEC } from '../src/application/common/commands/auth.ts';
import { testHarness } from './helpers.ts';
import { googleTokenFor, googleTokenForStranger } from './testIdentityProvider.ts';
import { ORG_A } from './testWorld.ts';

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
      // KLUB w tokenie (wielofirmowość §6): trasy klubowe pracują w klubie z claimu.
      orgId: ORG_A,
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

    const { rows } = await db.query<{ pilot_id: string; subject: string }>(
      `SELECT pilot_id, subject FROM external_identities`,
    );
    expect(rows).toEqual([{ pilot_id: 'PWI', subject: 'google-sub-PWI' }]);

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

    // Tożsamość podpięła się do ISTNIEJĄCEGO konta - nie powstała druga osoba.
    const { rows } = await db.query<{ pilot_id: string }>(
      `SELECT pilot_id FROM external_identities WHERE subject = 'google-sub-JSE'`,
    );
    expect(rows).toEqual([{ pilot_id: 'JSE' }]);
  });
});

describe('POST /auth/google - osoba BEZ klubu (wielofirmowość §4, epik D)', () => {
  const stranger = (app: Awaited<ReturnType<typeof testHarness>>['app'], subject: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger(subject) },
    });

  /** Osoba założona przy pierwszym logowaniu tożsamością `subject`. */
  const personOf = async (db: Awaited<ReturnType<typeof testHarness>>['db'], subject: string) => {
    const { rows } = await db.query<{ pilot_id: string }>(
      'SELECT pilot_id FROM external_identities WHERE subject = $1',
      [subject],
    );
    return rows[0]!.pilot_id;
  };

  it('202 z tokenem OSOBY, stanem `none` i pustą listą klubów - NIE tokeny pilota', async () => {
    const { app } = await testHarness();

    const res = await stranger(app, 'nowy1');

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe('none');
    expect(body.memberships).toEqual([]);
    expect(typeof body.personToken).toBe('string');
    // Najważniejsze zdanie tego przypadku: osoba bez klubu NIE dostaje tożsamości klubu.
    expect(body.token).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
  });

  it('pierwsze logowanie ZAKŁADA osobę bez klubu z Google; drugie nie zakłada drugiej', async () => {
    // Bramką jest brak CZŁONKOSTWA, piętro nad brakiem konta: osoba istnieje od pierwszego
    // logowania, żeby miała do czego przypiąć zgłoszenie kodem klubu (`POST /auth/join`).
    const { app, db } = await testHarness();
    const before = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');

    expect((await stranger(app, 'nowy2')).statusCode).toBe(202);

    const after = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');
    expect(Number(after.rows[0]?.count)).toBe(Number(before.rows[0]?.count) + 1);

    const person = await personOf(db, 'nowy2');
    const { rows } = await db.query<{ name: string; email: string | null; active: boolean }>(
      'SELECT name, email, active FROM pilots WHERE id = $1',
      [person],
    );
    // Nazwisko i POTWIERDZONY adres z Google; adres jest listą, po której panel dopisze
    // członkostwo do tej samej osoby, gdy administrator wpisze go zawczasu.
    expect(rows[0]).toEqual({ name: 'Nieznajomy nowy2', email: 'nowy2@gmail.com', active: true });
    expect(await db.query('SELECT 1 FROM memberships WHERE pilot_id = $1', [person])).toMatchObject({
      rows: [],
    });

    // Drugie logowanie idzie po `subject` - ta sama osoba, zero nowych wierszy.
    expect((await stranger(app, 'nowy2')).statusCode).toBe(202);
    const again = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');
    expect(Number(again.rows[0]?.count)).toBe(Number(after.rows[0]?.count));
    expect(await personOf(db, 'nowy2')).toBe(person);
  });

  it('adres NIEPOTWIERDZONY przez dostawcę nie trafia na osobę', async () => {
    // `pilots.email` jest listą dopuszczonych: administrator wpisuje adres, a osoba pod
    // nim dostaje członkostwo. Adres, którego Google nie potwierdził, byłby drogą do
    // podszycia się pod kogoś, komu klub dopiero ten adres wpisze.
    const { app, db, identityProvider } = await testHarness();
    identityProvider.register('niepotwierdzony', {
      provider: 'google',
      subject: 'niepotw',
      email: 'anna@ninerdeck.pl',
      emailVerified: false,
      name: 'Ktoś Podszywający',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: 'niepotwierdzony' },
    });
    expect(res.statusCode).toBe(202);

    const person = await personOf(db, 'niepotw');
    const { rows } = await db.query<{ email: string | null }>('SELECT email FROM pilots WHERE id = $1', [person]);
    expect(rows[0]?.email).toBeNull();
    // A konto AKO zostało przy swojej właścicielce.
    expect(await db.query('SELECT 1 FROM external_identities WHERE pilot_id = $1', ['AKO'])).toMatchObject({
      rows: [],
    });
  });

  it('token osoby NIE otwiera tras pilota - to nie jest tożsamość klubu', async () => {
    // Własność bezpieczeństwa z portów: bez rozdziału `verify`/`verifyPerson` token osoby
    // byłby ważną tożsamością bez `org`, a `POST /events` pisałby zdarzenia do klubu,
    // którego w tokenie nie ma.
    const { app, tokens } = await testHarness();
    const personToken = (await stranger(app, 'nowy3')).json().personToken as string;

    const reference = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${personToken}` },
    });
    expect(reference.statusCode).toBe(401);

    // Rozłączność w OBIE strony, na samych tokenach.
    expect(tokens.verify(personToken)).toBeNull();
    const clubToken = (await loginAs(app, 'TMK')).json().token as string;
    expect(tokens.verifyPerson(clubToken)).toBeNull();
  });

  it('`GET /auth/memberships` czyta stan TYM tokenem', async () => {
    const { app } = await testHarness();
    const personToken = (await stranger(app, 'nowy4')).json().personToken as string;

    const res = await app.inject({
      method: 'GET',
      url: '/auth/memberships',
      headers: { authorization: `Bearer ${personToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'none',
      memberships: [],
      // Plakietka konta na 00E: pod którym adresem człowiek czeka (issue #102).
      person: { name: 'Nieznajomy nowy4', email: 'nowy4@gmail.com' },
    });
  });

  it('osoba, która CZEKA w klubie, dostaje przy logowaniu 202 ze stanem `pending` i nazwą klubu', async () => {
    const { app, db } = await testHarness();
    await stranger(app, 'nowy7');
    const person = await personOf(db, 'nowy7');
    await db.query(
      `INSERT INTO memberships (org_id, pilot_id, status, joined_via) VALUES ($1, $2, 'pending', 'code')`,
      [ORG_A, person],
    );

    const res = await stranger(app, 'nowy7');
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('pending');
    expect(res.json().memberships).toMatchObject([
      { org: { id: ORG_A, name: 'Aeroklub Alfa' }, status: 'pending', code: null, rejectReason: null },
    ]);
  });

  it('po przyjęciu do klubu token osoby wydaje tokeny pilota RAZ - drugi raz dostaje 404', async () => {
    // Audyt 2026-09-05 (wtedy o tokenie rejestracyjnym): pierwsza wersja wydawała nową
    // parę przy KAŻDYM wywołaniu przez 30 dni, więc skopiowany token był fabryką
    // refreshów. Skopiowany token po przyjęciu ma być bezużyteczny zaraz po pierwszym wejściu.
    const { app, db } = await testHarness();
    const personToken = (await stranger(app, 'nowy5')).json().personToken as string;
    const person = await personOf(db, 'nowy5');

    // Przyjęcie „ręką administratora" - wprost w bazie, bo komendy panelu to epik D2;
    // tu liczy się wyłącznie zachowanie tokenu osoby.
    await db.query(
      `INSERT INTO memberships (org_id, pilot_id, code, role, status, joined_via)
       VALUES ($1, $2, 'NW5', 'pilot', 'active', 'code')`,
      [ORG_A, person],
    );

    const first = await app.inject({
      method: 'GET',
      url: '/auth/memberships',
      headers: { authorization: `Bearer ${personToken}` },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe('approved');
    expect(first.json().tokens.pilot).toMatchObject({ id: person, code: 'NW5' });
    expect(typeof first.json().tokens.refreshToken).toBe('string');

    const second = await app.inject({
      method: 'GET',
      url: '/auth/memberships',
      headers: { authorization: `Bearer ${personToken}` },
    });
    expect(second.statusCode).toBe(404);
  });

  it('token osoby wydany PRZED unieważnieniem poświadczeń członkostwa jest martwy', async () => {
    // Wyłączenie (+ ponowne włączenie) jest po usunięciu haseł JEDYNĄ drogą zerwania
    // sesji - musi obejmować także poświadczenie, którego jeszcze nikt nie zrealizował.
    const { app, db, clock } = await testHarness();
    const personToken = (await stranger(app, 'nowy6')).json().personToken as string;
    const person = await personOf(db, 'nowy6');
    await db.query(
      `INSERT INTO memberships (org_id, pilot_id, code, role, status, joined_via)
       VALUES ($1, $2, 'NW6', 'pilot', 'active', 'code')`,
      [ORG_A, person],
    );

    // `iat` ma rozdzielczość sekundy - unieważnienie musi być od niego późniejsze.
    clock.advance(1000);
    await db.query(
      `UPDATE memberships SET credentials_valid_from = $1 WHERE pilot_id = $2 AND org_id = $3`,
      [clock.now(), person, ORG_A],
    );

    const res = await app.inject({
      method: 'GET',
      url: '/auth/memberships',
      headers: { authorization: `Bearer ${personToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('`GET /auth/memberships` z tokenem KLUBU oddaje listę klubów, ale NIE wydaje tokenów', async () => {
    // Trasa bez klubu przyjmuje token dowolnego klubu (§6): 13A pokazuje z niej listę.
    // Kto ma token klubu, już wszedł - nowy klub bierze przełączeniem, nie tą trasą.
    const { app } = await testHarness();
    const clubToken = (await loginAs(app, 'TMK')).json().token as string;

    const res = await app.inject({
      method: 'GET',
      url: '/auth/memberships',
      headers: { authorization: `Bearer ${clubToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('active');
    expect(res.json().tokens).toBeUndefined();
    expect(res.json().memberships).toMatchObject([
      { org: { id: ORG_A }, status: 'active', code: 'TMK', role: 'admin', clubActive: true },
    ]);
  });

  it('`GET /auth/memberships` bez poświadczenia albo z tokenem platformowym → 401', async () => {
    const { app, tokens } = await testHarness();
    expect((await app.inject({ method: 'GET', url: '/auth/memberships' })).statusCode).toBe(401);

    const platform = tokens.signPlatform({ pilotId: 'admin' }, 3600);
    const res = await app.inject({
      method: 'GET',
      url: '/auth/memberships',
      headers: { authorization: `Bearer ${platform}` },
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
