/**
 * Ninerdeck (serwer) - LOGOWANIE HASŁEM (2.1.0, `docs/logowanie-haslem.md` §5.1, §5.2, §5.3,
 * §5.7, §8; issue #132 B5/B7/B9).
 *
 * Tabela odpowiedzi z dokumentu przybita co do kodu, plus trzy własności, które są całą
 * treścią tej metody logowania:
 *  • po ustaleniu osoby hasło kończy się DOKŁADNIE tam, gdzie Google (tokeny klubu /
 *    `202` token osoby / `no_panel_access`) - ten sam kształt odpowiedzi;
 *  • JEDNA odmowa `invalid_credentials` na login nieznany, osobę bez hasła i złe hasło
 *    (co do bajtu), a skrót ZASTĘPCZY liczy się także dla nieznanego loginu - czas
 *    odpowiedzi nie wylicza kont;
 *  • limit prób PRZED skrótem, z `Retry-After`, liczony na login i na adres IP.
 */

import { describe, expect, it, vi } from 'vitest';

import { PASSWORD_LOGIN_PER_LOGIN } from '../src/application/common/commands/auth.ts';
import { PASSWORD_WINDOW_MS } from '../src/application/common/commands/passwords.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_B } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

const PASSWORD = 'zielone-smiglo-leci-2026';

async function googleLogin(app: App, code: string) {
  const res = await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor(code) } });
  expect(res.statusCode).toBe(200);
  return res.json() as { token: string; refreshToken: string };
}

/** Hasło ustawione DROGĄ PRODUKTU: Google → `PUT /me/password` bez `current` (osoba bez hasła). */
async function withPassword(app: App, code: string, password = PASSWORD) {
  const tokens = await googleLogin(app, code);
  const res = await app.inject({
    method: 'PUT',
    url: '/me/password',
    headers: { authorization: `Bearer ${tokens.token}` },
    payload: { next: password },
  });
  expect(res.statusCode, res.body).toBe(204);
  return tokens;
}

const passwordLogin = (app: App, login: string, password: string, orgId?: string) =>
  app.inject({ method: 'POST', url: '/auth/password', payload: { login, password, ...(orgId == null ? {} : { orgId }) } });

const panelLogin = (app: App, email: string, password: string) =>
  app.inject({
    method: 'POST',
    url: '/admin/api/auth/password',
    headers: ADMIN_CSRF_HEADERS,
    payload: { email, password },
  });

describe('logowanie hasłem - telefon (§5.1)', () => {
  it('e-mail + hasło daje DOKŁADNIE te tokeny, co Google: klub, kod, rola, lista klubów', async () => {
    const { app } = await testHarness();
    await withPassword(app, 'AKO');

    const res = await passwordLogin(app, 'adam@ninerdeck.pl', PASSWORD);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.pilot).toMatchObject({ id: 'AKO', code: 'AKO' });
    expect(body.org.id).toBe(ORG_A);
    expect(typeof body.token).toBe('string');
    expect(typeof body.refreshToken).toBe('string');

    // Token działa na trasie klubu - to jest ten sam rdzeń, co po Google.
    const ref = await app.inject({ method: 'GET', url: '/reference', headers: { authorization: `Bearer ${body.token}` } });
    expect(ref.statusCode).toBe(200);
  });

  it('adres bez względu na wielkość liter i odstępy - to ten sam login', async () => {
    const { app } = await testHarness();
    await withPassword(app, 'AKO');
    expect((await passwordLogin(app, '  Adam@Ninerdeck.PL ', PASSWORD)).statusCode).toBe(200);
  });

  it('kod pilota działa WYŁĄCZNIE z klubem urządzenia; bez klubu - jak złe hasło', async () => {
    const { app } = await testHarness();
    await withPassword(app, 'PWI');

    // PWI ma w Alfie kod `PWI`, w Becie `PWB` - klub rozstrzyga, o kogo pytamy.
    expect((await passwordLogin(app, 'PWI', PASSWORD, ORG_A)).statusCode).toBe(200);
    expect((await passwordLogin(app, 'pwb', PASSWORD, ORG_B)).statusCode).toBe(200);
    // Kod Bety pytany w Alfie - nikogo takiego tam nie ma.
    expect((await passwordLogin(app, 'PWB', PASSWORD, ORG_A)).json()).toEqual({ error: 'invalid_credentials' });
    // Bez klubu kod nie ma czego rozwiązać - ta sama odpowiedź, co złe hasło.
    const noOrg = await passwordLogin(app, 'PWI', PASSWORD);
    expect(noOrg.statusCode).toBe(401);
    expect(noOrg.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('login nieznany / osoba bez hasła / złe hasło = JEDNA odpowiedź, co do bajtu', async () => {
    const { app } = await testHarness();
    await withPassword(app, 'AKO');

    const unknown = await passwordLogin(app, 'nikt@ninerdeck.pl', PASSWORD);
    const noPassword = await passwordLogin(app, 'barbara@ninerdeck.pl', PASSWORD);
    const wrong = await passwordLogin(app, 'adam@ninerdeck.pl', 'zupelnie-inne-haslo-123');

    for (const res of [unknown, noPassword, wrong]) {
      expect(res.statusCode).toBe(401);
      expect(res.body).toBe(unknown.body);
    }
    expect(unknown.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('nieznany login też liczy scrypt - na skrócie zastępczym (czas odpowiedzi nie wylicza kont)', async () => {
    const { app, passwordHasher } = await testHarness();
    const verify = vi.spyOn(passwordHasher, 'verify');

    await passwordLogin(app, 'nikt@ninerdeck.pl', PASSWORD);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0]![1]).toBe(passwordHasher.dummyHash());

    // Osoba BEZ hasła - również skrót zastępczy, nie skrót „pusty" ani brak wywołania.
    await passwordLogin(app, 'barbara@ninerdeck.pl', PASSWORD);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[1]![1]).toBe(passwordHasher.dummyHash());
  });

  it('osoba zablokowana platformowo: hasło zgodne → `account_disabled` (tożsamość dowiedziona)', async () => {
    const { app, db } = await testHarness();
    await withPassword(app, 'AKO');
    await db.query(`UPDATE pilots SET active = FALSE WHERE id = 'AKO'`);

    const res = await passwordLogin(app, 'adam@ninerdeck.pl', PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'account_disabled' });
    // …ale ZŁE hasło zablokowanej osoby nadal mówi to samo, co każde złe hasło.
    expect((await passwordLogin(app, 'adam@ninerdeck.pl', 'nie-to-haslo-na-pewno')).json()).toEqual({
      error: 'invalid_credentials',
    });
  });

  it('osoba bez klubu dostaje 202 z tokenem osoby - jak po Google', async () => {
    const { app, db, passwordHasher } = await testHarness();
    await db.query(`INSERT INTO pilots (id, name, email, active) VALUES ('solo', 'Sam Bezklubu', 'solo@x.pl', TRUE)`);
    await db.query(
      `INSERT INTO password_credentials (pilot_id, hash, set_at, set_via) VALUES ('solo', $1, now(), 'link')`,
      [await passwordHasher.hash(PASSWORD)],
    );

    const res = await passwordLogin(app, 'solo@x.pl', PASSWORD);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'none', memberships: [], person: { name: 'Sam Bezklubu', email: 'solo@x.pl' } });
    expect(typeof res.json().personToken).toBe('string');
  });

  it('limit prób: po 10 na login `429` z `Retry-After`, po oknie znów wolno', async () => {
    const { app, clock } = await testHarness();
    await withPassword(app, 'AKO');

    for (let i = 0; i < PASSWORD_LOGIN_PER_LOGIN; i += 1) {
      expect((await passwordLogin(app, 'adam@ninerdeck.pl', 'zle-haslo-numer-' + i)).statusCode).toBe(401);
    }
    // Jedenasta próba - także z POPRAWNYM hasłem - odbija się o limit, bo liczy się login.
    const blocked = await passwordLogin(app, 'adam@ninerdeck.pl', PASSWORD);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: 'too_many_attempts' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // Inny login z tego samego adresu IP nie jest zablokowany (limit IP jest wyższy).
    expect((await passwordLogin(app, 'barbara@ninerdeck.pl', PASSWORD)).statusCode).toBe(401);

    clock.advance(PASSWORD_WINDOW_MS + 1);
    expect((await passwordLogin(app, 'adam@ninerdeck.pl', PASSWORD)).statusCode).toBe(200);
  });

  it('skrót ze słabszych parametrów jest przeliczany po udanym logowaniu (re-hash bez migracji)', async () => {
    const { app, db, passwordHasher } = await testHarness();
    await withPassword(app, 'AKO');
    const before = (await db.query<{ hash: string }>(`SELECT hash FROM password_credentials WHERE pilot_id = 'AKO'`)).rows[0]!.hash;
    expect(before.startsWith('$scrypt$ln=10,')).toBe(true);

    // Udawany „stary" skrót: te same bajty, słabsze parametry w napisie (ln=9) - hasło
    // dalej pasuje, bo skrót liczy się z parametrów Z WIERSZA.
    vi.spyOn(passwordHasher, 'needsRehash').mockReturnValueOnce(true);
    expect((await passwordLogin(app, 'adam@ninerdeck.pl', PASSWORD)).statusCode).toBe(200);
    const after = (await db.query<{ hash: string }>(`SELECT hash FROM password_credentials WHERE pilot_id = 'AKO'`)).rows[0]!.hash;
    expect(after).not.toBe(before);
    expect((await passwordLogin(app, 'adam@ninerdeck.pl', PASSWORD)).statusCode).toBe(200);
  });

  it('`GET /auth/methods` mówi telefonowi, czym się logować - bez pola o sposobie resetu', async () => {
    const { app } = await testHarness();
    const res = await app.inject({ method: 'GET', url: '/auth/methods' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ google: null, password: true });
  });
});

describe('logowanie hasłem - panel (§5.2)', () => {
  it('administrator klubu dostaje ciasteczko sesji i ten sam kształt, co po Google', async () => {
    const { app } = await testHarness();
    await withPassword(app, 'AKO');

    const res = await panelLogin(app, 'adam@ninerdeck.pl', PASSWORD);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ pilot: { id: 'AKO', code: 'AKO' }, org: { id: ORG_A } });
    expect(res.json().capabilities).toContain('accounts.manage');
    const cookie = res.cookies.find((c) => c.name === 'ninerdeck_admin');
    expect(cookie?.httpOnly).toBe(true);
    // Token WYŁĄCZNIE w ciasteczku, nigdy w ciele.
    expect(res.body).not.toContain(cookie!.value);
  });

  it('pilot bez roli panelu: hasło zgodne → 403 `no_panel_access`, bez ciasteczka', async () => {
    const { app } = await testHarness();
    await withPassword(app, 'JSE');

    const res = await panelLogin(app, 'jan@ninerdeck.pl', PASSWORD);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'no_panel_access' });
    expect(res.cookies).toEqual([]);
  });

  it('login nieznany i złe hasło - jedno 401, `429` po limicie', async () => {
    const { app } = await testHarness();
    await withPassword(app, 'AKO');

    const unknown = await panelLogin(app, 'nikt@ninerdeck.pl', PASSWORD);
    const wrong = await panelLogin(app, 'adam@ninerdeck.pl', 'nie-to-haslo-na-pewno');
    expect(unknown.statusCode).toBe(401);
    expect(wrong.body).toBe(unknown.body);

    for (let i = 0; i < PASSWORD_LOGIN_PER_LOGIN - 1; i += 1) {
      await panelLogin(app, 'adam@ninerdeck.pl', 'zle-' + i + '-haslo-dlugie');
    }
    const blocked = await panelLogin(app, 'adam@ninerdeck.pl', PASSWORD);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('superadministrator bez klubu dostaje sesję PLATFORMOWĄ', async () => {
    const { app, db, passwordHasher } = await testHarness();
    await db.query(
      `INSERT INTO password_credentials (pilot_id, hash, set_at, set_via) VALUES ('ROOT', $1, now(), 'link')`,
      [await passwordHasher.hash(PASSWORD)],
    );
    const res = await panelLogin(app, 'platform@ninerdeck.app', PASSWORD);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ org: null, pilot: { id: 'ROOT', role: 'superadmin' } });
  });

  it('`GET /admin/api/auth/methods` niesie klienta Google WEB i hasło', async () => {
    const { app } = await testHarness();
    const res = await app.inject({ method: 'GET', url: '/admin/api/auth/methods' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ google: { clientId: expect.any(String) }, password: true });
  });
});

describe('ustawienie i zmiana hasła (§5.3)', () => {
  it('osoba z hasłem podaje `current`; błędne → 401; bez `current` → 401', async () => {
    const { app } = await testHarness();
    const tokens = await withPassword(app, 'AKO');
    const headers = { authorization: `Bearer ${tokens.token}` };

    const noCurrent = await app.inject({ method: 'PUT', url: '/me/password', headers, payload: { next: 'nowe-dlugie-haslo-2026' } });
    expect(noCurrent.statusCode).toBe(401);
    const wrongCurrent = await app.inject({
      method: 'PUT',
      url: '/me/password',
      headers,
      payload: { current: 'nie-to-haslo-na-pewno', next: 'nowe-dlugie-haslo-2026' },
    });
    expect(wrongCurrent.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'PUT',
      url: '/me/password',
      headers,
      payload: { current: PASSWORD, next: 'nowe-dlugie-haslo-2026' },
    });
    expect(ok.statusCode).toBe(204);
    expect((await passwordLogin(app, 'adam@ninerdeck.pl', PASSWORD)).statusCode).toBe(401);
    expect((await passwordLogin(app, 'adam@ninerdeck.pl', 'nowe-dlugie-haslo-2026')).statusCode).toBe(200);
  });

  it('polityka domeny: słabe hasło → 400 z POWODEM, także z fragmentem nazwiska albo adresu', async () => {
    const { app } = await testHarness();
    const tokens = await googleLogin(app, 'AKO');
    const headers = { authorization: `Bearer ${tokens.token}` };

    const short = await app.inject({ method: 'PUT', url: '/me/password', headers, payload: { next: 'krotkie' } });
    expect(short.statusCode).toBe(400);
    expect(short.json()).toEqual({ error: 'weak_password', reason: 'too_short' });

    const name = await app.inject({ method: 'PUT', url: '/me/password', headers, payload: { next: 'kowalski-lata-wysoko' } });
    expect(name.json()).toEqual({ error: 'weak_password', reason: 'contains_name' });

    const email = await app.inject({ method: 'PUT', url: '/me/password', headers, payload: { next: 'adam@ninerdeck.pl!' } });
    expect(email.json()).toEqual({ error: 'weak_password', reason: 'contains_email' });
  });

  it('osoba bez adresu e-mail nie ustawi hasła - nie miałaby czym się zalogować (409)', async () => {
    const { app, db } = await testHarness();
    const tokens = await googleLogin(app, 'KRZ');
    await db.query(`UPDATE pilots SET email = NULL WHERE id = 'KRZ'`);
    const res = await app.inject({
      method: 'PUT',
      url: '/me/password',
      headers: { authorization: `Bearer ${tokens.token}` },
      payload: { next: 'dlugie-haslo-bez-adresu' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'email_required' });
  });

  it('panel: `PUT /admin/api/me/password` dla sesji klubu i platformy', async () => {
    const { app } = await testHarness();
    const login = await app.inject({ method: 'POST', url: '/admin/api/auth/login', headers: ADMIN_CSRF_HEADERS, payload: { idToken: googleTokenFor('AKO') } });
    const cookie = login.cookies.find((c) => c.name === 'ninerdeck_admin')!;
    const set = await app.inject({
      method: 'PUT',
      url: '/admin/api/me/password',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie.value },
      payload: { next: PASSWORD },
    });
    expect(set.statusCode, set.body).toBe(204);
    expect((await panelLogin(app, 'adam@ninerdeck.pl', PASSWORD)).statusCode).toBe(200);

    const root = await app.inject({ method: 'POST', url: '/admin/api/auth/login', headers: ADMIN_CSRF_HEADERS, payload: { idToken: googleTokenFor('ROOT') } });
    const rootCookie = root.cookies.find((c) => c.name === 'ninerdeck_admin')!;
    const setRoot = await app.inject({
      method: 'PUT',
      url: '/admin/api/me/password',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: rootCookie.value },
      payload: { next: PASSWORD },
    });
    expect(setRoot.statusCode, setRoot.body).toBe(204);
    expect((await panelLogin(app, 'platform@ninerdeck.app', PASSWORD)).statusCode).toBe(200);
  });
});
