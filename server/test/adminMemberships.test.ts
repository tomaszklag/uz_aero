/**
 * UZ Aero (serwer) - DECYZJE o zgłoszeniach kodem klubu (`/admin/api/memberships*`;
 * wielofirmowość §8.3; issue #100, D2).
 *
 * Druga połowa jedynej drogi do klubu: `joinClub.test.ts` dowodzi, że kod klubu daje
 * WYŁĄCZNIE zgłoszenie, a ten plik - że wejście do klubu jest decyzją człowieka i że po
 * tej decyzji pilot NAPRAWDĘ lata (albo naprawdę nie).
 *
 * Własności, których złamanie jest luką, a nie usterką:
 *  1. **zatwierdzenie to jedyna droga nowego członka** - i po nim logowanie Googlem
 *     oddaje tokeny KLUBU, a nie tokena osoby;
 *  2. **decyzja zapada RAZ** - drugie zatwierdzenie albo odrzucenie po decyzji odbija się
 *     o `wrong_status` ze STANEM, nie o milczące 200;
 *  3. **kod pilota jest jedyny w klubie** także tutaj - zatwierdzenie cudzym kodem to 409;
 *  4. **odrzucenie bez powodu nie istnieje** - powód czyta pilot na 00D;
 *  5. **cofnięcie odrzucenia czyści decyzję** - zgłoszenie wraca do kolejki, a nie do
 *     stanu „odrzucone, ale czekające";
 *  6. **kolejka i lista to dwa byty** - kandydat nie stoi na liście członków, a członek
 *     nie stoi w kolejce.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor, googleTokenForStranger } from './testIdentityProvider.ts';
import { ORG_A, ORG_A_CODE, ORG_B } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const admin = (token: string) => ({ authorization: `Bearer ${token}`, ...ADMIN_CSRF_HEADERS });

async function tokenOf(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().token as string;
}

/**
 * Nieznajomy wchodzi PRAWDZIWĄ drogą: logowanie Googlem zakłada osobę i oddaje token
 * osoby, a `POST /auth/join` z kodem klubu stawia zgłoszenie.
 *
 * Celowo nie wstawiamy wiersza wprost do bazy: przedmiotem tego pliku jest cykl życia
 * zgłoszenia, więc musi się zaczynać tak, jak się zaczyna w produkcji.
 */
async function applicant(
  app: Harness['app'],
  subject: string,
  code = ORG_A_CODE,
): Promise<{ pilotId: string; personToken: string }> {
  const login = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenForStranger(subject) },
  });
  expect(login.statusCode, login.body).toBe(202);
  const personToken = login.json().personToken as string;

  const joined = await app.inject({
    method: 'POST',
    url: '/auth/join',
    headers: { authorization: `Bearer ${personToken}` },
    payload: { code },
  });
  expect(joined.statusCode, joined.body).toBe(202);

  const memberships = await app.inject({
    method: 'GET',
    url: '/auth/memberships',
    headers: { authorization: `Bearer ${personToken}` },
  });
  expect(memberships.json().memberships.some((m: { status: string }) => m.status === 'pending')).toBe(
    true,
  );

  return { pilotId: await pilotIdOf(app, subject), personToken };
}

/** Identyfikator osoby nadaje serwer (uuid), więc czytamy go z kolejki zgłoszeń. */
async function pilotIdOf(app: Harness['app'], subject: string): Promise<string> {
  const token = await tokenOf(app, 'TMK');
  const queue = await app.inject({
    method: 'GET',
    url: '/admin/api/memberships/pending',
    headers: { authorization: `Bearer ${token}` },
  });
  const found = queue
    .json()
    .items.find((item: { email: string }) => item.email === `${subject}@gmail.com`);
  expect(found, `zgłoszenie ${subject} nie stoi w kolejce: ${queue.body}`).toBeDefined();
  return found.pilotId as string;
}

const pending = (app: Harness['app'], token: string) =>
  app.inject({
    method: 'GET',
    url: '/admin/api/memberships/pending',
    headers: { authorization: `Bearer ${token}` },
  });

const approve = (app: Harness['app'], token: string, id: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: `/admin/api/memberships/${id}/approve`,
    headers: admin(token),
    payload: body,
  });

const reject = (app: Harness['app'], token: string, id: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: `/admin/api/memberships/${id}/reject`,
    headers: admin(token),
    payload: body,
  });

const reopen = (app: Harness['app'], token: string, id: string) =>
  app.inject({
    method: 'POST',
    url: `/admin/api/memberships/${id}/reopen`,
    headers: admin(token),
    payload: {},
  });

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{
    action: string;
    target_id: string;
    org_id: string | null;
    details: Record<string, unknown>;
  }>('SELECT action, target_id, org_id, details FROM admin_audit ORDER BY id');
  return rows;
}

describe('GET /admin/api/memberships/pending - kolejka zgłoszeń', () => {
  it('pokazuje imię i adres Z GOOGLE oraz chwilę zgłoszenia, najdłużej czekające pierwsze', async () => {
    const { app, clock } = await testHarness();
    await applicant(app, 'pierwszy');
    clock.advance(60_000);
    await applicant(app, 'drugi');

    const res = await pending(app, await tokenOf(app, 'TMK'));

    expect(res.statusCode).toBe(200);
    const items = res.json().items as { name: string; email: string; requestedAt: string }[];
    expect(items.map((i) => i.email)).toEqual(['pierwszy@gmail.com', 'drugi@gmail.com']);
    expect(items[0]!.name).toBe('Nieznajomy pierwszy');
    // Chwila zgłoszenia, nie chwila odpytania kolejki - karta pisze „czeka od".
    expect(new Date(items[0]!.requestedAt).getTime()).toBeLessThan(
      new Date(items[1]!.requestedAt).getTime(),
    );
  });

  it('kandydat NIE stoi na liście członków - kolejka i lista to dwa byty', async () => {
    const { app } = await testHarness();
    await applicant(app, 'kandydat');
    const token = await tokenOf(app, 'TMK');

    const list = await app.inject({
      method: 'GET',
      url: '/admin/api/pilots',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(list.body).not.toContain('kandydat@gmail.com');
    expect((await pending(app, token)).json().items).toHaveLength(1);
  });

  it('kolejka jedzie na `accounts.manage` - zwykły pilot jej nie czyta', async () => {
    // Inaczej niż lista członków (`panel.access`): w wierszach stoją adresy ludzi,
    // których w klubie nie ma, a decyzja o nich jest władzą nad dostępem.
    const { app } = await testHarness();
    const res = await pending(app, await tokenOf(app, 'PWI'));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden', required: 'accounts.manage' });
  });

  it('kolejka jest PUSTA, dopóki nikt nie wpisał kodu', async () => {
    const { app } = await testHarness();
    expect((await pending(app, await tokenOf(app, 'TMK'))).json()).toEqual({ items: [] });
  });
});

describe('POST /admin/api/memberships/:id/approve - zatwierdzenie', () => {
  it('nadaje kod i rolę, a pilot od tej chwili LOGUJE SIĘ do klubu', async () => {
    // Sedno całej drogi: do decyzji logowanie oddaje token OSOBY (202), po decyzji -
    // tokeny KLUBU (200) z kodem z członkostwa.
    const { app, db } = await testHarness();
    const { pilotId } = await applicant(app, 'nowy');
    const token = await tokenOf(app, 'TMK');

    const res = await approve(app, token, pilotId, { code: 'nwy', role: 'pilot' });

    expect(res.statusCode).toBe(200);
    const { pilot } = res.json();
    // Kod normalizuje się do wersalików - „nwy" i „NWY" to w intencji ten sam kod.
    expect(pilot).toMatchObject({ id: pilotId, code: 'NWY', role: 'pilot', active: true });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('nowy') },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ pilot: { code: 'NWY' }, org: { id: ORG_A } });
    expect(login.json().personToken).toBeUndefined();

    // Kandydat wyszedł z kolejki i wszedł na listę członków.
    expect((await pending(app, token)).json().items).toEqual([]);
    const { rows } = await db.query<{ status: string; joined_via: string; decided_by: string }>(
      'SELECT status, joined_via, decided_by FROM memberships WHERE pilot_id = $1',
      [pilotId],
    );
    // `joined_via` zostaje `code`: zatwierdzenie nie zmienia tego, JAK ten człowiek
    // trafił do klubu - a trafił kodem.
    expect(rows[0]).toMatchObject({ status: 'active', joined_via: 'code', decided_by: 'TMK' });
  });

  it('wpis audytu niesie KOMPLET tożsamości z Google plus nadany kod i rolę', async () => {
    const { app, db } = await testHarness();
    const { pilotId } = await applicant(app, 'sowa');

    await approve(app, await tokenOf(app, 'TMK'), pilotId, { code: 'SOW', role: 'admin' });

    const rows = await auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'membership.approve', target_id: pilotId, org_id: ORG_A });
    expect(rows[0]!.details).toMatchObject({
      code: 'SOW',
      role: 'admin',
      name: 'Nieznajomy sowa',
      email: 'sowa@gmail.com',
    });
  });

  it('kod zajęty w tym klubie → 409 z nazwą pola, zgłoszenie zostaje w kolejce', async () => {
    const { app, db } = await testHarness();
    const { pilotId } = await applicant(app, 'kolizja');
    const token = await tokenOf(app, 'TMK');

    const res = await approve(app, token, pilotId, { code: 'AKO', role: 'pilot' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'conflict', field: 'code' });
    expect((await pending(app, token)).json().items).toHaveLength(1);
    // Odbita transakcja nie zostawia wpisu w dzienniku.
    expect(await auditRows(db)).toEqual([]);
  });

  it('ten sam kod w DRUGIM klubie przechodzi - kod jest jedyny w klubie, nie na serwerze', async () => {
    const { app } = await testHarness();
    const { pilotId } = await applicant(app, 'tezako');

    // `AKO` jest zajęte w Alfie, ale nie w Becie.
    const inBeta = await approve(app, await tokenOf(app, 'BAD'), pilotId, {
      code: 'AKO',
      role: 'pilot',
    });
    // …tylko że ten człowiek zgłosił się do Alfy: dla Bety jego zgłoszenia NIE MA.
    expect(inBeta.statusCode).toBe(404);
  });

  it('drugie zatwierdzenie → 409 `wrong_status` ze STANEM, nie ciche 200', async () => {
    const { app } = await testHarness();
    const { pilotId } = await applicant(app, 'dwarazy');
    const token = await tokenOf(app, 'TMK');
    expect((await approve(app, token, pilotId, { code: 'DWA', role: 'pilot' })).statusCode).toBe(200);

    const again = await approve(app, token, pilotId, { code: 'DW2', role: 'pilot' });

    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'wrong_status', status: 'active' });
  });

  it('osoba zablokowana PLATFORMOWO → 409 `inactive_account`, bo i tak by nie weszła', async () => {
    // Administrator klubu nie ma jak zdjąć blokady superadministratora, więc musi ją
    // ZOBACZYĆ - inaczej zatwierdzi zgłoszenie i dowie się o problemie z telefonu pilota.
    const { app, db } = await testHarness();
    const { pilotId } = await applicant(app, 'zablokowany');
    await db.query('UPDATE pilots SET active = FALSE WHERE id = $1', [pilotId]);

    const res = await approve(app, await tokenOf(app, 'TMK'), pilotId, {
      code: 'ZAB',
      role: 'pilot',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'refused', reason: 'inactive_account' });
  });

  it('bez kodu albo bez roli → 400; zgłoszenia nieznanego → 404', async () => {
    const { app } = await testHarness();
    const { pilotId } = await applicant(app, 'walidacja');
    const token = await tokenOf(app, 'TMK');

    expect((await approve(app, token, pilotId, { role: 'pilot' })).statusCode).toBe(400);
    expect((await approve(app, token, pilotId, { code: 'WAL' })).statusCode).toBe(400);
    expect((await approve(app, token, pilotId, { code: 'A B', role: 'pilot' })).statusCode).toBe(400);
    expect(
      (await approve(app, token, 'nie-ma-takiego', { code: 'WAL', role: 'pilot' })).statusCode,
    ).toBe(404);
  });

  it('zwykły pilot nie zatwierdza - 403 i ani jednego wiersza w dzienniku', async () => {
    const { app, db } = await testHarness();
    const { pilotId } = await applicant(app, 'bezprawa');

    const res = await approve(app, await tokenOf(app, 'PWI'), pilotId, {
      code: 'BEZ',
      role: 'pilot',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ required: 'accounts.manage' });
    expect(await auditRows(db)).toEqual([]);
  });
});

describe('POST /admin/api/memberships/:id/reject - odrzucenie', () => {
  it('zapisuje powód, który pilot czyta na swoim telefonie', async () => {
    const { app, db } = await testHarness();
    const { pilotId, personToken } = await applicant(app, 'odmowa');

    const res = await reject(app, await tokenOf(app, 'TMK'), pilotId, {
      reason: 'zgłoś się adresem klubowym podanym przy zapisie na kurs',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().membership).toMatchObject({ pilotId, status: 'rejected' });
    expect(res.json().membership.decidedAt).not.toBeNull();

    // 00D: pilot widzi POWÓD w swojej liście klubów.
    const clubs = await app.inject({
      method: 'GET',
      url: '/auth/memberships',
      headers: { authorization: `Bearer ${personToken}` },
    });
    expect(clubs.json().memberships[0]).toMatchObject({
      status: 'rejected',
      rejectReason: 'zgłoś się adresem klubowym podanym przy zapisie na kurs',
    });

    const rows = await auditRows(db);
    expect(rows[0]).toMatchObject({ action: 'membership.reject', org_id: ORG_A });
    expect(rows[0]!.details).toMatchObject({ email: 'odmowa@gmail.com' });
  });

  it('powód jest WYMAGANY - pusty i jednoznakowy odbijają się o 400', async () => {
    const { app } = await testHarness();
    const { pilotId } = await applicant(app, 'bezpowodu');
    const token = await tokenOf(app, 'TMK');

    expect((await reject(app, token, pilotId, {})).statusCode).toBe(400);
    expect((await reject(app, token, pilotId, { reason: '   ' })).statusCode).toBe(400);
    expect((await reject(app, token, pilotId, { reason: 'x' })).statusCode).toBe(400);
  });

  it('odrzucenie po zatwierdzeniu → 409 `wrong_status`, członkostwo zostaje aktywne', async () => {
    const { app, db } = await testHarness();
    const { pilotId } = await applicant(app, 'juzwklubie');
    const token = await tokenOf(app, 'TMK');
    await approve(app, token, pilotId, { code: 'JUZ', role: 'pilot' });

    const res = await reject(app, token, pilotId, { reason: 'zmiana decyzji' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'wrong_status', status: 'active' });
    const { rows } = await db.query<{ status: string }>(
      'SELECT status FROM memberships WHERE pilot_id = $1',
      [pilotId],
    );
    expect(rows[0]?.status).toBe('active');
  });
});

describe('POST /admin/api/memberships/:id/reopen - cofnięcie odrzucenia', () => {
  it('wraca do kolejki i CZYŚCI decyzję - powód, chwilę i autora', async () => {
    const { app, db } = await testHarness();
    const { pilotId, personToken } = await applicant(app, 'pomylka');
    const token = await tokenOf(app, 'TMK');
    await reject(app, token, pilotId, { reason: 'pomyłka administratora' });

    const res = await reopen(app, token, pilotId);

    expect(res.statusCode).toBe(200);
    expect(res.json().membership).toEqual({
      pilotId,
      status: 'pending',
      decidedAt: null,
      rejectReason: null,
    });

    const { rows } = await db.query<{
      status: string;
      reject_reason: string | null;
      decided_at: string | null;
      decided_by: string | null;
    }>('SELECT status, reject_reason, decided_at, decided_by FROM memberships WHERE pilot_id = $1', [
      pilotId,
    ]);
    expect(rows[0]).toMatchObject({
      status: 'pending',
      reject_reason: null,
      decided_at: null,
      decided_by: null,
    });

    // Zgłoszenie stoi znów w kolejce, a telefon pokazuje 00C, nie 00D.
    expect((await pending(app, token)).json().items).toHaveLength(1);
    const clubs = await app.inject({
      method: 'GET',
      url: '/auth/memberships',
      headers: { authorization: `Bearer ${personToken}` },
    });
    expect(clubs.json().memberships[0]).toMatchObject({ status: 'pending', rejectReason: null });

    // Ślad ODMOWY i jej cofnięcia zostaje w dzienniku - wiersz opisuje stan, audyt historię.
    expect((await auditRows(db)).map((r) => r.action)).toEqual([
      'membership.reject',
      'membership.reopen',
    ]);
  });

  it('cofnięcie zgłoszenia, które CZEKA → 409 `wrong_status`', async () => {
    const { app } = await testHarness();
    const { pilotId } = await applicant(app, 'czeka');

    const res = await reopen(app, await tokenOf(app, 'TMK'), pilotId);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'wrong_status', status: 'pending' });
  });

  it('po cofnięciu zgłoszenie da się zatwierdzić - dwustopniowo, z dwoma wpisami', async () => {
    const { app, db } = await testHarness();
    const { pilotId } = await applicant(app, 'wrocil');
    const token = await tokenOf(app, 'TMK');
    await reject(app, token, pilotId, { reason: 'najpierw odmowa' });
    await reopen(app, token, pilotId);

    expect((await approve(app, token, pilotId, { code: 'WRC', role: 'pilot' })).statusCode).toBe(200);
    expect((await auditRows(db)).map((r) => r.action)).toEqual([
      'membership.reject',
      'membership.reopen',
      'membership.approve',
    ]);
  });
});

describe('decyzje dotyczą WYŁĄCZNIE klubu z sesji', () => {
  it('administrator Bety nie widzi zgłoszenia do Alfy ani go nie rozstrzygnie', async () => {
    const { app } = await testHarness();
    const { pilotId } = await applicant(app, 'doalfy');
    const beta = await tokenOf(app, 'BAD');

    expect((await pending(app, beta)).json().items).toEqual([]);
    expect((await reject(app, beta, pilotId, { reason: 'nie moje' })).statusCode).toBe(404);
    expect((await reopen(app, beta, pilotId)).statusCode).toBe(404);
    expect((await approve(app, beta, pilotId, { code: 'ALF', role: 'pilot' })).statusCode).toBe(404);
    expect(ORG_B).not.toBe(ORG_A);
  });
});
