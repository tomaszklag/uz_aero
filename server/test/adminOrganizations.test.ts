/**
 * Ninerdeck (serwer) - MODUŁ ORGANIZACJE: zakładanie i wyłączanie klubów
 * (`/admin/api/organizations*`, zdolność `platform.manage`; mockupy `organizacje-lista`,
 * `organizacje-klub`; wielofirmowość §8.1; issue #100, D3).
 *
 * Własności, których złamanie jest luką, a nie usterką:
 *  1. **to trasy PLATFORMY** - sesja klubu ich nie otwiera (401), a superadministrator
 *     nie dostaje przez nie ani jednego wiersza danych klubu: tylko liczby i administratorzy;
 *  2. **klub powstaje RAZEM z pierwszym administratorem i kodem klubu** - inaczej byłby
 *     klubem, do którego nikt nie wejdzie (kodem nie miałby kto zatwierdzić zgłoszeń);
 *  3. **pierwszy administrator wchodzi BEZ kolejki** - przy pierwszym logowaniu Googlem
 *     tym adresem podpina się tożsamość i od razu ma panel swojego klubu;
 *  4. **wyłączenie klubu odcina jego ludzi NATYCHMIAST**, a danych nie kasuje;
 *  5. **wpis audytu akcji platformowej ma PUSTY `org_id`** - dziennik klubu go nie widzi.
 */

import { describe, expect, it } from 'vitest';

import { CLUB_CODE_ALPHABET, CLUB_CODE_LENGTH } from '../src/domain/clubCode.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_B, seedBetaFleet } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type Session = { cookie: string };

/** Sesja PANELU (ciasteczko) - tak loguje się i administrator klubu, i superadministrator. */
async function panelCookie(app: Harness['app'], who: string): Promise<Session> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'ninerdeck_admin')!;
  return { cookie: `ninerdeck_admin=${cookie.value}` };
}

const writer = (session: Session) => ({ ...session, ...ADMIN_CSRF_HEADERS });

const list = (app: Harness['app'], session: Session, query = '') =>
  app.inject({ method: 'GET', url: `/admin/api/organizations${query}`, headers: session });

const card = (app: Harness['app'], session: Session, id: string) =>
  app.inject({ method: 'GET', url: `/admin/api/organizations/${id}`, headers: session });

const create = (app: Harness['app'], session: Session, body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/admin/api/organizations',
    headers: writer(session),
    payload: body,
  });

const patch = (app: Harness['app'], session: Session, id: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'PATCH',
    url: `/admin/api/organizations/${id}`,
    headers: writer(session),
    payload: body,
  });

const setActive = (app: Harness['app'], session: Session, id: string, active: boolean) =>
  app.inject({
    method: 'POST',
    url: `/admin/api/organizations/${id}/active`,
    headers: writer(session),
    payload: { active },
  });

const NEW_CLUB = {
  name: 'Klub Spadochronowy Gliwice',
  slug: 'ks-gliwice',
  admin: { name: 'Piotr Wróbel', email: 'piotr.wrobel@gmail.com', code: 'pwr' },
};

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{
    action: string;
    target_id: string;
    org_id: string | null;
    actor_pilot_id: string;
    actor_role: string;
    details: Record<string, unknown>;
  }>(
    'SELECT action, target_id, org_id, actor_pilot_id, actor_role, details FROM admin_audit ORDER BY id',
  );
  return rows;
}

describe('GET /admin/api/organizations - lista klubów', () => {
  it('oddaje LICZBY z wnętrza klubu i administratorów, nigdy wierszy danych', async () => {
    const { app, db } = await testHarness();
    await seedBetaFleet(db);
    const root = await panelCookie(app, 'ROOT');

    const res = await list(app, root);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.counts).toEqual({ total: 2, active: 2 });
    const [alfa, beta] = body.items as {
      id: string;
      name: string;
      slug: string;
      members: number;
      aircraft: number;
      admins: { code: string; email: string; signedIn: boolean }[];
    }[];
    expect(alfa).toMatchObject({ id: ORG_A, slug: 'aeroklub-alfa', members: 5, aircraft: 4 });
    expect(beta).toMatchObject({ id: ORG_B, slug: 'aeroklub-beta', members: 3, aircraft: 1 });
    // Administratorzy - jedyne osoby z wnętrza klubu, jakie ta lista pokazuje
    // („do kogo dzwonić"). Zwykłych członków nie ma ani jednego.
    expect(alfa!.admins.map((a) => a.code).sort()).toEqual(['AKO', 'TMK']);
    expect(res.body).not.toContain('PWI');
    // Ani jednego wiersza dziennika, floty czy kolejki - tylko liczby.
    expect(res.body).not.toContain('SP-AXA');
  });

  it('`signedIn` odróżnia administratora, który jeszcze nie wszedł', async () => {
    // Jedyny stan, w którym superadministrator ma coś do zrobienia: klub stoi,
    // członkostwo `admin` jest, a konto Google nie podpięło się pod ten adres.
    const { app } = await testHarness();
    const root = await panelCookie(app, 'ROOT');
    await create(app, root, NEW_CLUB);
    // TMK loguje się, AKO nie - `signedIn` czyta obecność tożsamości Google, a nie
    // członkostwo, więc ta para musi się różnić w obrębie JEDNEGO klubu.
    await panelCookie(app, 'TMK');

    const items = (await list(app, root)).json().items as {
      slug: string;
      admins: { code: string; name: string; signedIn: boolean }[];
    }[];
    const gliwice = items.find((i) => i.slug === 'ks-gliwice')!;
    expect(gliwice.admins).toEqual([
      {
        pilotId: expect.any(String),
        name: 'Piotr Wróbel',
        email: 'piotr.wrobel@gmail.com',
        code: 'PWR',
        signedIn: false,
      },
    ]);
    const alfa = items.find((i) => i.slug === 'aeroklub-alfa')!;
    expect(alfa.admins.map((a) => [a.code, a.signedIn])).toEqual([
      ['AKO', false],
      ['TMK', true],
    ]);
  });

  it('klub WYŁĄCZONY stoi na końcu listy, a chip „Aktywne" go nie pokazuje', async () => {
    const { app } = await testHarness();
    const root = await panelCookie(app, 'ROOT');
    await setActive(app, root, ORG_A, false);

    const all = (await list(app, root)).json();
    expect(all.items.map((i: { id: string }) => i.id)).toEqual([ORG_B, ORG_A]);
    // Liczniki opisują CAŁY serwer, nie bieżący filtr - stąd 2 i 1 naraz.
    expect(all.counts).toEqual({ total: 2, active: 1 });

    const onlyActive = (await list(app, root, '?active=true')).json();
    expect(onlyActive.items.map((i: { id: string }) => i.id)).toEqual([ORG_B]);
    expect(onlyActive.counts).toEqual({ total: 2, active: 1 });
  });

  it('szuka po nazwie ALBO adresie, bez znaczenia wielkości liter', async () => {
    const { app } = await testHarness();
    const root = await panelCookie(app, 'ROOT');

    expect((await list(app, root, '?q=BETA')).json().items).toHaveLength(1);
    expect((await list(app, root, '?q=aeroklub-alfa')).json().items).toHaveLength(1);
    expect((await list(app, root, '?q=nie-ma-takiego')).json().items).toEqual([]);
  });

  it('sesja KLUBU nie otwiera modułu platformy - 401, nie 403', async () => {
    // Administrator klubu ma sesję klubu, a to nie jest ten rodzaj tokenu
    // (`authorizePlatform`). Ta sama asymetria, co przy zgłoszeniach błędów.
    const { app } = await testHarness();
    const admin = await panelCookie(app, 'TMK');

    expect((await list(app, admin)).statusCode).toBe(401);
    expect((await card(app, admin, ORG_A)).statusCode).toBe(401);
    expect((await create(app, admin, NEW_CLUB)).statusCode).toBe(401);
    expect((await setActive(app, admin, ORG_A, false)).statusCode).toBe(401);
  });
});

describe('POST /admin/api/organizations - założenie klubu', () => {
  it('tworzy klub, kod klubu i PIERWSZEGO administratora w jednym ruchu', async () => {
    const { app, db } = await testHarness();
    const root = await panelCookie(app, 'ROOT');

    const res = await create(app, root, NEW_CLUB);

    expect(res.statusCode).toBe(201);
    const { organization } = res.json();
    expect(organization).toMatchObject({
      name: 'Klub Spadochronowy Gliwice',
      slug: 'ks-gliwice',
      active: true,
      members: 1,
      aircraft: 0,
    });
    // Kod klubu powstaje RAZEM z klubem, żeby administrator miał od pierwszego dnia
    // co podać pilotom - i jedzie DO ODCZYTU, w zapisie kanonicznym.
    expect(organization.joinCode).toHaveLength(CLUB_CODE_LENGTH);
    expect([...organization.joinCode].every((ch: string) => CLUB_CODE_ALPHABET.includes(ch))).toBe(
      true,
    );
    expect(organization.joinCodeFormatted).toBe(
      `${organization.joinCode.slice(0, 3)}-${organization.joinCode.slice(3)}`,
    );
    expect(organization.joinCodeSince).not.toBeNull();

    // Członkostwo `admin` `active` od razu, `joined_via = 'platform'` - bootstrap,
    // nie droga dla pilotów.
    const { rows } = await db.query<{
      code: string;
      role: string;
      status: string;
      joined_via: string;
    }>(
      `SELECT m.code, m.role, m.status, m.joined_via FROM memberships m
        JOIN organizations o ON o.id = m.org_id WHERE o.slug = 'ks-gliwice'`,
    );
    expect(rows).toEqual([
      { code: 'PWR', role: 'admin', status: 'active', joined_via: 'platform' },
    ]);
    // Sekret adresu kart arkusza losuje BAZA - klub dostaje go przy założeniu.
    const secret = await db.query<{ sheets_key: string }>(
      `SELECT sheets_key FROM organizations WHERE slug = 'ks-gliwice'`,
    );
    expect(secret.rows[0]!.sheets_key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('pierwszy administrator wchodzi do SWOJEGO panelu bez kolejki', async () => {
    // Sedno bootstrapu: tożsamość Google podpina się po zweryfikowanym adresie przy
    // PIERWSZYM logowaniu, a człowiek jest od razu administratorem - kodem klubu nie
    // miałby go kto zatwierdzić.
    const { app, identityProvider } = await testHarness();
    const root = await panelCookie(app, 'ROOT');
    const created = await create(app, root, NEW_CLUB);
    const orgId = created.json().organization.id as string;

    identityProvider.register('token-wrobel', {
      provider: 'google',
      subject: 'google-sub-wrobel',
      email: 'piotr.wrobel@gmail.com',
      emailVerified: true,
      name: 'Piotr Wróbel',
    });
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: 'token-wrobel' },
    });

    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({
      pilot: { code: 'PWR', role: 'admin' },
      org: { id: orgId, slug: 'ks-gliwice' },
    });

    // I ma panel SWOJEGO klubu - a nie Alfy.
    const session = await panelCookie(app, 'TMK');
    expect(session.cookie).not.toBe('');
    const pilots = await app.inject({
      method: 'GET',
      url: '/admin/api/pilots',
      headers: { authorization: `Bearer ${login.json().token}` },
    });
    expect(pilots.json().items.map((i: { code: string }) => i.code)).toEqual(['PWR']);
  });

  it('klub z adresem osoby, która JUŻ jest na serwerze, dopisuje jej członkostwo', async () => {
    // Osoba jest jedna na serwerze (§3.6), więc administrator nowego klubu może być
    // pilotem innego. Druga osoba pod tym samym adresem rozdwoiłaby człowieka.
    const { app, db } = await testHarness();
    const root = await panelCookie(app, 'ROOT');

    const res = await create(app, root, {
      ...NEW_CLUB,
      admin: { name: 'Piotr Wiśniewski', email: 'piotr@ninerdeck.pl', code: 'PW2' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().organization.admins[0].pilotId).toBe('PWI');
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM pilots WHERE lower(email) = 'piotr@ninerdeck.pl'`,
    );
    expect(Number(rows[0]!.n)).toBe(1);
    // Nazwisko OSOBY zostaje jej - klub, który ją dopisuje, go nie przemalowuje.
    const person = await db.query<{ name: string }>(`SELECT name FROM pilots WHERE id = 'PWI'`);
    expect(person.rows[0]!.name).toBe('Piotr Wiśniewski');

    const audit = (await auditRows(db))[0]!;
    expect(audit.details).toMatchObject({ existingPerson: true });
  });

  it('zajęty adres klubu → 409 z nazwą pola, klub nie powstaje', async () => {
    const { app, db } = await testHarness();
    const root = await panelCookie(app, 'ROOT');

    const res = await create(app, root, { ...NEW_CLUB, slug: 'aeroklub-alfa' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'conflict', field: 'slug' });
    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM organizations');
    expect(Number(rows[0]!.n)).toBe(2);
    // Odbita transakcja nie zostawia wpisu w dzienniku.
    expect(await auditRows(db)).toEqual([]);
  });

  it('wpis audytu ma PUSTY `org_id` i niesie komplet pierwszego administratora', async () => {
    const { app, db } = await testHarness();
    const root = await panelCookie(app, 'ROOT');
    const created = await create(app, root, NEW_CLUB);

    const rows = await auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'organization.create',
      target_id: created.json().organization.id,
      // Akcja platformowa nie dzieje się w żadnym klubie - dziennik klubu jej nie widzi.
      org_id: null,
      actor_pilot_id: 'ROOT',
      actor_role: 'superadmin',
    });
    expect(rows[0]!.details).toMatchObject({
      name: 'Klub Spadochronowy Gliwice',
      slug: 'ks-gliwice',
      admin: { name: 'Piotr Wróbel', email: 'piotr.wrobel@gmail.com', code: 'PWR' },
      existingPerson: false,
    });
  });

  it('walidacja: adres z wielkimi literami i spacją, brak administratora, zły kod → 400', async () => {
    const { app } = await testHarness();
    const root = await panelCookie(app, 'ROOT');

    for (const body of [
      { ...NEW_CLUB, slug: 'KS Gliwice' },
      { ...NEW_CLUB, slug: '-ks-' },
      { name: 'Bez administratora', slug: 'bez-admina' },
      { ...NEW_CLUB, admin: { ...NEW_CLUB.admin, email: 'nie-email' } },
      { ...NEW_CLUB, admin: { ...NEW_CLUB.admin, code: 'A B' } },
      { ...NEW_CLUB, name: 'X' },
    ]) {
      expect((await create(app, root, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('karta klubu: zmiana nazwy i wyłączenie', () => {
  it('zmienia nazwę, a ADRESU nie - slug jest adresem kart arkusza', async () => {
    const { app, db } = await testHarness();
    const root = await panelCookie(app, 'ROOT');

    const res = await patch(app, root, ORG_A, { name: 'Aeroklub Alfa i Omega', slug: 'inny' });

    expect(res.statusCode).toBe(200);
    expect(res.json().organization).toMatchObject({
      name: 'Aeroklub Alfa i Omega',
      slug: 'aeroklub-alfa',
    });
    const rows = await auditRows(db);
    expect(rows[0]).toMatchObject({ action: 'organization.update', org_id: null });
    expect(rows[0]!.details).toMatchObject({
      slug: 'aeroklub-alfa',
      changes: { name: { from: 'Aeroklub Alfa', to: 'Aeroklub Alfa i Omega' } },
    });
  });

  it('żądanie bez zmiany → 400 `no_changes`, bez wpisu w dzienniku', async () => {
    const { app, db } = await testHarness();
    const root = await panelCookie(app, 'ROOT');

    expect((await patch(app, root, ORG_A, { name: 'Aeroklub Alfa' })).statusCode).toBe(400);
    expect((await patch(app, root, ORG_A, {})).statusCode).toBe(400);
    expect(await auditRows(db)).toEqual([]);
  });

  it('nieznany klub to 404 - także przy zmianie i wyłączeniu', async () => {
    const { app } = await testHarness();
    const root = await panelCookie(app, 'ROOT');

    expect((await card(app, root, 'nie-ma-takiego')).statusCode).toBe(404);
    expect((await patch(app, root, 'nie-ma-takiego', { name: 'Cokolwiek' })).statusCode).toBe(404);
    expect((await setActive(app, root, 'nie-ma-takiego', false)).statusCode).toBe(404);
  });

  it('WYŁĄCZENIE odcina ludzi klubu natychmiast, a danych nie kasuje', async () => {
    const { app, db } = await testHarness();
    const root = await panelCookie(app, 'ROOT');
    // Administrator klubu pracuje - jego token jest ważny kryptograficznie.
    const alfaToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/google',
        payload: { idToken: googleTokenFor('TMK') },
      })
    ).json().token as string;

    const res = await setActive(app, root, ORG_A, false);

    expect(res.statusCode).toBe(200);
    expect(res.json().organization.active).toBe(false);
    // Trasa panelu i trasa telefonu zamykają się od razu - brama czyta `organizations.active`
    // przy każdym żądaniu, więc wyłączenie nie potrzebuje stempla unieważnienia.
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/admin/api/pilots',
          headers: { authorization: `Bearer ${alfaToken}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/reference',
          headers: { authorization: `Bearer ${alfaToken}` },
        })
      ).statusCode,
    ).toBe(401);
    // Logowanie też odmawia - ale konta, flota i dziennik zostają nietknięte.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenFor('TMK') },
    });
    expect(login.statusCode).toBe(202);
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM memberships WHERE org_id = '${ORG_A}'`,
    );
    expect(Number(rows[0]!.n)).toBe(5);

    const audit = await auditRows(db);
    expect(audit[0]).toMatchObject({ action: 'organization.disable', org_id: null });
  });

  it('włączenie z powrotem wraca jako `organization.update` - własny kod ma tylko odcięcie', async () => {
    const { app, db } = await testHarness();
    const root = await panelCookie(app, 'ROOT');
    await setActive(app, root, ORG_A, false);

    const res = await setActive(app, root, ORG_A, true);

    expect(res.statusCode).toBe(200);
    expect((await auditRows(db)).map((r) => r.action)).toEqual([
      'organization.disable',
      'organization.update',
    ]);
    // I ludzie klubu wracają do pracy.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenFor('TMK') },
    });
    expect(login.statusCode).toBe(200);
  });

  it('powtórne wyłączenie → 400 `no_changes`', async () => {
    const { app } = await testHarness();
    const root = await panelCookie(app, 'ROOT');
    await setActive(app, root, ORG_A, false);

    expect((await setActive(app, root, ORG_A, false)).statusCode).toBe(400);
  });

  it('karta klubu niesie kod klubu DO ODCZYTU - bez rotacji i wyłączania', async () => {
    // Kod jest konfiguracją klubu: superadministrator musi go PRZEKAZAĆ pierwszemu
    // administratorowi, ale nowy generuje już panel klubu (§8.1).
    const { app } = await testHarness();
    const root = await panelCookie(app, 'ROOT');

    const res = await card(app, root, ORG_A);

    expect(res.statusCode).toBe(200);
    expect(res.json().organization).toMatchObject({
      joinCode: 'AZG7K4M',
      joinCodeFormatted: 'AZG-7K4M',
    });
    // Trasy rotacji na tej powierzchni nie ma - jest w panelu klubu.
    const rotate = await app.inject({
      method: 'POST',
      url: `/admin/api/organizations/${ORG_A}/club-code/rotate`,
      headers: writer(root),
    });
    expect(rotate.statusCode).toBe(404);
  });
});
