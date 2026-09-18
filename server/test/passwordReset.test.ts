/**
 * Ninerdeck (serwer) - LINK „USTAW HASŁO" Z E-MAILA (2.1.0, `docs/logowanie-haslem.md` §4.2,
 * §5.4, D8; issue #132 B4/B6/B7/B9).
 *
 * Jeden mechanizm, cztery wyzwalacze - i ten test pilnuje obu połówek tego zdania:
 *  • `forgot` odpowiada IDENTYCZNIE dla adresu znanego i nieznanego, a list wychodzi
 *    wyłącznie dla znanego; limit wysyłek nie zmienia odpowiedzi;
 *  • link jest jednorazowy, ma termin, nowy zużywa stary, a realizacja ustawia hasło,
 *    zrywa WSZYSTKIE sesje osoby i NIE wydaje sesji w odpowiedzi;
 *  • przycisk administratora i zaproszenie z platformy to TEN SAM list (poza treścią
 *    zaproszenia), z wpisem audytu, w którym tokenu nie ma.
 *
 * Poczta jest tu atrapą (`FakeMail`) - test czyta list i wyjmuje z niego link, czyli
 * robi dokładnie to, co człowiek ze skrzynką.
 */

import { describe, expect, it } from 'vitest';

import { RESET_LINK_TTL_MS, SEND_PER_ADDRESS } from '../src/application/common/commands/passwords.ts';
import { tokenIn } from './fakeMail.ts';
import { ADMIN_CSRF_HEADERS, TEST_BASE_URL, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_B } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

const PASSWORD = 'nowe-haslo-z-linku-2026';

const forgot = (app: App, email: string) => app.inject({ method: 'POST', url: '/auth/password/forgot', payload: { email } });
const reset = (app: App, token: string, password: string) =>
  app.inject({ method: 'POST', url: '/auth/password/reset', payload: { token, password } });
const passwordLogin = (app: App, login: string, password: string) =>
  app.inject({ method: 'POST', url: '/auth/password', payload: { login, password } });

async function googleLogin(app: App, code: string) {
  const res = await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor(code) } });
  expect(res.statusCode).toBe(200);
  return res.json() as { token: string; refreshToken: string };
}

async function panelCookie(app: App, code: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/admin/api/auth/login', headers: ADMIN_CSRF_HEADERS, payload: { idToken: googleTokenFor(code) } });
  expect(res.statusCode).toBe(200);
  return res.cookies.find((c) => c.name === 'ninerdeck_admin')!.value;
}

describe('„Nie pamiętam hasła" (§5.4)', () => {
  it('adres znany i nieznany dostają IDENTYCZNĄ odpowiedź; list wychodzi tylko do znanego', async () => {
    const { app, mail } = await testHarness();

    const known = await forgot(app, 'tomasz@ninerdeck.pl');
    const unknown = await forgot(app, 'nikogo-takiego@ninerdeck.pl');
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(unknown.body).toBe(known.body);

    expect(mail.sent).toHaveLength(1);
    const letter = mail.lastTo('tomasz@ninerdeck.pl')!;
    expect(letter.subject).toBe('Ninerdeck - ustaw hasło');
    expect(letter.text).toContain(`${TEST_BASE_URL}/haslo/#`);
    expect(letter.text).toContain('60 minut');
  });

  it('link ustawia hasło, zrywa WSZYSTKIE sesje osoby i nie wydaje sesji w odpowiedzi', async () => {
    const { app, clock, mail } = await testHarness();
    const before = await googleLogin(app, 'TMK');
    clock.advance(60_000);

    await forgot(app, 'Tomasz@Ninerdeck.pl');
    const token = tokenIn(mail.lastTo('tomasz@ninerdeck.pl')!);

    const res = await reset(app, token, PASSWORD);
    expect(res.statusCode, res.body).toBe(204);
    expect(res.body).toBe('');
    expect(res.cookies).toEqual([]);

    // Stara para tokenów jest martwa: refresh skasowany, token dostępu sprzed unieważnienia.
    const refresh = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: before.refreshToken } });
    expect(refresh.statusCode).toBe(401);
    const access = await app.inject({ method: 'GET', url: '/reference', headers: { authorization: `Bearer ${before.token}` } });
    expect(access.statusCode).toBe(401);

    // Nowe hasło loguje - i dopiero to wydaje sesję.
    const login = await passwordLogin(app, 'tomasz@ninerdeck.pl', PASSWORD);
    expect(login.statusCode, login.body).toBe(200);
    expect(login.json().org.id).toBe(ORG_A);
  });

  it('token jest jednorazowy; obcy, zużyty i po terminie dają JEDNO `invalid_token`', async () => {
    const { app, clock, mail } = await testHarness();
    await forgot(app, 'tomasz@ninerdeck.pl');
    const token = tokenIn(mail.lastTo('tomasz@ninerdeck.pl')!);

    expect((await reset(app, token, PASSWORD)).statusCode).toBe(204);
    const reused = await reset(app, token, PASSWORD + '-2');
    expect(reused.statusCode).toBe(401);
    expect(reused.json()).toEqual({ error: 'invalid_token' });

    const foreign = await reset(app, 'zmyslony-token-ktorego-nie-ma', PASSWORD);
    expect(foreign.body).toBe(reused.body);

    mail.clear();
    await forgot(app, 'anna@ninerdeck.pl');
    const expiring = tokenIn(mail.lastTo('anna@ninerdeck.pl')!);
    clock.advance(RESET_LINK_TTL_MS + 1);
    const late = await reset(app, expiring, PASSWORD);
    expect(late.statusCode).toBe(401);
    expect(late.body).toBe(reused.body);
  });

  it('nowy link zużywa stary - działa wyłącznie ten z ostatniego listu', async () => {
    const { app, mail } = await testHarness();
    await forgot(app, 'tomasz@ninerdeck.pl');
    const first = tokenIn(mail.lastTo('tomasz@ninerdeck.pl')!);
    await forgot(app, 'tomasz@ninerdeck.pl');
    const second = tokenIn(mail.lastTo('tomasz@ninerdeck.pl')!);
    expect(second).not.toBe(first);

    expect((await reset(app, first, PASSWORD)).statusCode).toBe(401);
    expect((await reset(app, second, PASSWORD)).statusCode).toBe(204);
  });

  it('słabe hasło oddaje powód i NIE spala linku', async () => {
    const { app, mail } = await testHarness();
    await forgot(app, 'tomasz@ninerdeck.pl');
    const token = tokenIn(mail.lastTo('tomasz@ninerdeck.pl')!);

    const weak = await reset(app, token, 'krotkie');
    expect(weak.statusCode).toBe(400);
    expect(weak.json()).toEqual({ error: 'weak_password', reason: 'too_short' });
    // Polityka zna OSOBĘ z tokenu: fragment nazwiska blokuje.
    expect((await reset(app, token, 'malkiewicz-lata-wysoko')).json()).toEqual({ error: 'weak_password', reason: 'contains_name' });

    expect((await reset(app, token, PASSWORD)).statusCode).toBe(204);
  });

  it('limit wysyłek: 3 listy na adres w oknie, potem to samo 202 BEZ listu', async () => {
    const { app, mail } = await testHarness();
    for (let i = 0; i < SEND_PER_ADDRESS; i += 1) {
      expect((await forgot(app, 'tomasz@ninerdeck.pl')).statusCode).toBe(202);
    }
    expect(mail.sent).toHaveLength(SEND_PER_ADDRESS);
    const over = await forgot(app, 'tomasz@ninerdeck.pl');
    expect(over.statusCode).toBe(202);
    expect(over.json()).toEqual({ status: 'accepted' });
    expect(mail.sent).toHaveLength(SEND_PER_ADDRESS);
  });

  it('adres nie jest walidowany kształtem - byt adresu rozstrzyga baza, odpowiedź zawsze ta sama', async () => {
    const { app } = await testHarness();
    expect((await forgot(app, 'to-nie-adres')).statusCode).toBe(202);
    expect((await app.inject({ method: 'POST', url: '/auth/password/forgot', payload: {} })).statusCode).toBe(400);
  });
});

describe('link z PANELU - członek klubu (`accounts.manage`, §5.4)', () => {
  it('administrator wysyła TEN SAM list członkowi swojego klubu; odpowiedź bez linku; wpis audytu bez tokenu', async () => {
    const { app, db, mail } = await testHarness();
    const cookie = await panelCookie(app, 'TMK');

    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/pilots/JSE/password-link',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ sentTo: 'jan@ninerdeck.pl', expiresAt: expect.any(String) });
    expect(res.body).not.toContain('haslo/#');

    const letter = mail.lastTo('jan@ninerdeck.pl')!;
    expect(letter.subject).toBe('Ninerdeck - ustaw hasło');
    const token = tokenIn(letter);

    // Dziennik: fakt wysłania - i ani śladu tokenu.
    const { rows } = await db.query<{ action: string; target_id: string; details: unknown; org_id: string }>(
      `SELECT action, target_id, details, org_id FROM admin_audit WHERE action = 'password.link_sent'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target_id: 'JSE', org_id: ORG_A });
    expect(rows[0]!.details).toMatchObject({ triggeredBy: 'admin', sentTo: 'jan@ninerdeck.pl', code: 'JSE' });
    expect(JSON.stringify(rows[0]!.details)).not.toContain(token);

    // Link działa dokładnie tak, jak z „Nie pamiętam hasła".
    expect((await reset(app, token, PASSWORD)).statusCode).toBe(204);
    expect((await passwordLogin(app, 'jan@ninerdeck.pl', PASSWORD)).statusCode).toBe(200);
  });

  it('list z panelu jest CO DO ZNAKU tym samym listem, co „Nie pamiętam hasła" (F4)', async () => {
    // To jest cała treść decyzji D5: administrator NIE dyktuje kodu i nie wysyła
    // niczego własnego - uruchamia TEN SAM mechanizm, tylko z innego miejsca. Gdyby
    // listy się rozjechały, „inny punkt triggera" zamieniłby się w drugą drogę do hasła,
    // a przy drugiej drodze pilnowanie jednej przestaje cokolwiek znaczyć.
    const { app, mail } = await testHarness();

    expect((await forgot(app, 'jan@ninerdeck.pl')).statusCode).toBe(202);
    const bySelf = mail.lastTo('jan@ninerdeck.pl')!;

    const cookie = await panelCookie(app, 'TMK');
    const sent = await app.inject({
      method: 'POST',
      url: '/admin/api/pilots/JSE/password-link',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
    });
    expect(sent.statusCode, sent.body).toBe(200);
    const byAdmin = mail.lastTo('jan@ninerdeck.pl')!;

    expect(byAdmin.subject).toBe(bySelf.subject);
    // Tokeny MUSZĄ się różnić (drugi link zużywa pierwszy), więc porównujemy treść
    // z wyciętym tokenem - reszta ma być identyczna, ze zdaniem o wylogowaniu włącznie.
    const withoutToken = (text: string): string => text.replace(/\/haslo\/#[A-Za-z0-9_-]+/, '/haslo/#');
    expect(withoutToken(byAdmin.text)).toBe(withoutToken(bySelf.text));
    expect(tokenIn(byAdmin)).not.toBe(tokenIn(bySelf));
  });

  it('członek bez adresu → 409 `email_required` (tu wolno powiedzieć wprost)', async () => {
    const { app, db, mail } = await testHarness();
    const cookie = await panelCookie(app, 'TMK');
    await db.query(`UPDATE pilots SET email = NULL WHERE id = 'KRZ'`);
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/pilots/KRZ/password-link',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'email_required' });
    expect(mail.sent).toHaveLength(0);
  });

  it('bez `accounts.manage` (pilot) → 403; awaria poczty → 502, a token i wpis zostają', async () => {
    const { app, db, mail } = await testHarness();
    // JSE jest pilotem - do panelu nie wchodzi wcale.
    const pilot = await app.inject({ method: 'POST', url: '/admin/api/auth/login', headers: ADMIN_CSRF_HEADERS, payload: { idToken: googleTokenFor('JSE') } });
    expect(pilot.statusCode).toBe(403);

    const cookie = await panelCookie(app, 'TMK');
    mail.failing = true;
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/pilots/JSE/password-link',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'mail_failed' });
    const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'password.link_sent'`);
    expect(Number(rows[0]!.n)).toBe(1);
  });
});

describe('zaproszenie administratora klubu z PLATFORMY (`platform.manage`, D8)', () => {
  it('założenie klubu wysyła zaproszenie (72 h, z nazwą klubu) i oddaje `invite` w odpowiedzi', async () => {
    const { app, clock, mail } = await testHarness();
    const cookie = await panelCookie(app, 'ROOT');

    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/organizations',
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
      payload: { name: 'Aeroklub Gamma', slug: 'aeroklub-gamma', admin: { name: 'Grażyna Gamma', email: 'grazyna@gamma.pl', code: 'GGA' } },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().invite).toEqual({ sentTo: 'grazyna@gamma.pl', expiresAt: expect.any(String) });
    const expiresAt = new Date(res.json().invite.expiresAt).getTime();
    expect(expiresAt - clock.now().getTime()).toBe(72 * 3_600_000);

    const letter = mail.lastTo('grazyna@gamma.pl')!;
    expect(letter.subject).toBe('Klub Aeroklub Gamma w Ninerdeck - ustaw hasło');
    expect(letter.text).toContain('72 godzin');

    // Administratorka ustawia hasło i wchodzi do panelu SWOJEGO klubu.
    expect((await reset(app, tokenIn(letter), PASSWORD)).statusCode).toBe(204);
    const login = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/password',
      headers: ADMIN_CSRF_HEADERS,
      payload: { email: 'grazyna@gamma.pl', password: PASSWORD },
    });
    expect(login.statusCode, login.body).toBe(200);
    expect(login.json()).toMatchObject({ org: { slug: 'aeroklub-gamma' }, pilot: { code: 'GGA', role: 'admin' } });
  });

  it('„Wyślij ponownie" - ten sam list dla administratora TEGO klubu; cudza osoba → 404', async () => {
    const { app, db, mail } = await testHarness();
    const cookie = await panelCookie(app, 'ROOT');

    const again = await app.inject({
      method: 'POST',
      url: `/admin/api/organizations/${ORG_B}/admins/BAD/invite`,
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
    });
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().sentTo).toBe('barbara@beta.pl');
    expect(mail.lastTo('barbara@beta.pl')!.subject).toContain('Aeroklub Beta');

    // Pilot Bety nie jest jej administratorem - platforma nie pisze do członków klubu.
    const member = await app.inject({
      method: 'POST',
      url: `/admin/api/organizations/${ORG_B}/admins/BPI/invite`,
      headers: ADMIN_CSRF_HEADERS,
      cookies: { ninerdeck_admin: cookie },
    });
    expect(member.statusCode).toBe(404);

    const { rows } = await db.query<{ details: { triggeredBy: string; orgId: string } }>(
      `SELECT details FROM admin_audit WHERE action = 'password.link_sent' AND org_id IS NULL`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details).toMatchObject({ triggeredBy: 'platform', orgId: ORG_B });
  });
});
