/**
 * UZ Aero (serwer) - ZGŁOSZENIA BŁĘDÓW Z APLIKACJI PILOTA (issue #87; platforma - issue #99 C6).
 *
 * Pod obserwacją:
 *  1. telefon zgłasza z tożsamością Z TOKENU, a ponowienie tej samej paczki (uuid) nie
 *     robi drugiego zgłoszenia - to jest warunek offline-first: kolejka wysyła do
 *     skutku, a „do skutku" musi być bezpieczne;
 *  2. `context` jedzie DOSŁOWNIE, także z polami, o których serwer nie wie - bo o to
 *     w tym kanale chodzi (kształt należy do telefonu, zmienia się co tydzień testów);
 *  3. SUPERADMINISTRATOR widzi listę z licznikami WSZYSTKICH statusów i klubem każdego
 *     wiersza, filtruje statusem i dostaje KOD pilota z klubu zgłoszenia, nie identyfikator;
 *  4. zmiana statusu zostawia ślad w dzienniku audytu PLATFORMY (bez klubu) z przejściem
 *     `from → to` i klubem zgłoszenia, a odrzucenie BEZ komentarza jest odbijane;
 *  5. zdolności: odczyt i zapis na `bugs.triage`, którą ma WYŁĄCZNIE rola platformowa -
 *     administrator klubu nie dostaje ani listy, ani zmiany statusu (epik C, decyzja
 *     właściciela: zgłoszenia opisują aplikację, nie dziennik klubu).
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_B, seedBetaFleet } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

const login = (app: App, who: string): Promise<string> =>
  app
    .inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor(who) } })
    .then((res) => res.json().token as string);

/**
 * Sesja PANELU jako ciasteczko - dla superadministratora jedyna droga, bo token
 * platformowy wydaje wyłącznie logowanie do panelu (`/admin/api/auth/login`).
 * Administrator klubu loguje się tą samą trasą i dostaje sesję KLUBU - test
 * odmowy używa jej, żeby sprawdzić, że klubowa sesja tych tras nie otwiera.
 */
async function panelCookie(app: App, who: string): Promise<{ cookie: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'uzaero_admin')!;
  return { cookie: `uzaero_admin=${cookie.value}` };
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
const writer = (session: { cookie: string }) => ({ ...session, ...ADMIN_CSRF_HEADERS });

const CREATED_AT = '2026-09-04T09:41:00.000Z';

/** Minimalne zgłoszenie - tyle, ile naprawdę wysyła telefon przy jednym tapnięciu. */
const report = (uuid: string, over: Record<string, unknown> = {}) => ({
  uuid,
  createdAt: CREATED_AT,
  severity: 'annoying',
  description: 'Czas lotu na stopce nie przeliczył się po korekcie lądowania.',
  screen: 'OPERACJA (10) · tryb edycji',
  appVersion: '1.4.0 (58)',
  sessionUuid: 'S1',
  context: { route: 'Stats', theme: 'night', outboxCount: 0 },
  ...over,
});

const submit = (app: App, token: string, reports: unknown[]) =>
  app.inject({
    method: 'POST',
    url: '/me/bug-reports',
    headers: bearer(token),
    payload: { reports },
  });

const list = (app: App, session: { cookie: string }, query = '') =>
  app.inject({ method: 'GET', url: `/admin/api/bug-reports${query}`, headers: session });

const patch = (app: App, session: { cookie: string }, uuid: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'PATCH',
    url: `/admin/api/bug-reports/${uuid}`,
    headers: writer(session),
    payload: body,
  });

describe('zgłoszenia błędów z telefonu', () => {
  it('bez tokenu → 401; tożsamość bierze się z tokenu, nie z ciała', async () => {
    const { app } = await testHarness();
    expect(
      (await app.inject({ method: 'POST', url: '/me/bug-reports', payload: { reports: [report('b1')] } }))
        .statusCode,
    ).toBe(401);

    // Ciało niesie CUDZY `pilotId` - i nie ma prawa nic zmienić: pole nie istnieje
    // w schemacie żądania, a autor bierze się z tokenu.
    const pilot = await login(app, 'PWI');
    expect((await submit(app, pilot, [report('b1', { pilotId: 'TMK' })])).statusCode).toBe(200);

    const root = await panelCookie(app, 'ROOT');
    const row = (await list(app, root)).json().items[0];
    expect(row.pilotCode).toBe('PWI');
    // Klub zgłoszenia = klub z TOKENU telefonu - superadministrator widzi go przy wierszu.
    expect(row.org).toEqual({ id: ORG_A, slug: 'aeroklub-alfa', name: 'Aeroklub Alfa' });
  });

  it('ponowienie tej samej paczki nie robi drugiego zgłoszenia (idempotencja po uuid)', async () => {
    const { app } = await testHarness();
    const pilot = await login(app, 'PWI');

    expect((await submit(app, pilot, [report('b1'), report('b2')])).json()).toEqual({
      accepted: 2,
      duplicates: 0,
    });
    // Telefon nie dostał odpowiedzi i ponawia CAŁĄ kolejkę razem z nowym wpisem.
    expect((await submit(app, pilot, [report('b1'), report('b2'), report('b3')])).json()).toEqual({
      accepted: 1,
      duplicates: 2,
    });

    const root = await panelCookie(app, 'ROOT');
    expect((await list(app, root)).json().items).toHaveLength(3);
  });

  it('`context` jedzie dosłownie - także pola, o których serwer nie wie', async () => {
    const { app } = await testHarness();
    const pilot = await login(app, 'PWI');
    // Dokładnie ten przypadek, dla którego trasa nie waliduje kształtu kontekstu:
    // aplikacja dokłada nowe pole, a serwer ma je donieść bez wdrożenia.
    await submit(app, pilot, [
      report('b1', { context: { route: 'Cockpit', czegoNieZnamy: { a: 1 }, gpsFixes: 4212 } }),
    ]);

    const root = await panelCookie(app, 'ROOT');
    expect((await list(app, root)).json().items[0].context).toEqual({
      route: 'Cockpit',
      czegoNieZnamy: { a: 1 },
      gpsFixes: 4212,
    });
  });

  it('waga jest opcjonalna, a zegary telefonu i serwera są dwoma różnymi polami', async () => {
    const { app } = await testHarness();
    const pilot = await login(app, 'PWI');
    await submit(app, pilot, [report('b1', { severity: null, sessionUuid: null, appVersion: null })]);

    const root = await panelCookie(app, 'ROOT');
    const item = (await list(app, root)).json().items[0];
    expect(item.severity).toBeNull();
    expect(item.sessionUuid).toBeNull();
    expect(item.createdAt).toBe(CREATED_AT);
    // Serwer stempluje przyjęcie własnym zegarem - offline bywa długi i ta różnica
    // jest treścią, nie usterką.
    expect(new Date(item.receivedAt).getTime()).toBeGreaterThan(new Date(CREATED_AT).getTime());
  });

  it('pusty opis i pusta paczka → 400 (żądanie zbudowane źle, nie odmowa domeny)', async () => {
    const { app } = await testHarness();
    const pilot = await login(app, 'PWI');
    expect((await submit(app, pilot, [])).statusCode).toBe(400);
    expect((await submit(app, pilot, [report('b1', { description: '   ' })])).statusCode).toBe(400);
    expect((await submit(app, pilot, [report('b1', { severity: 'krytyczny' })])).statusCode).toBe(400);
  });
});

describe('moduł „Zgłoszenia" na platformie', () => {
  it('lista niesie liczniki WSZYSTKICH statusów, także pustych, i filtruje statusem', async () => {
    const { app } = await testHarness();
    const pilot = await login(app, 'PWI');
    await submit(app, pilot, [report('b1'), report('b2'), report('b3')]);

    const root = await panelCookie(app, 'ROOT');
    await patch(app, root, 'b2', { status: 'in_progress', note: null });

    const all = (await list(app, root)).json();
    expect(all.items).toHaveLength(3);
    expect(all.counts).toEqual({ new: 2, in_progress: 1, resolved: 0, rejected: 0 });

    const working = (await list(app, root, '?status=new,in_progress')).json();
    expect(working.items).toHaveLength(3);
    const done = (await list(app, root, '?status=resolved')).json();
    expect(done.items).toHaveLength(0);
    // Liczniki NIE zależą od filtru: „Rozwiązane" ma pokazywać swoją liczbę także
    // wtedy, gdy patrzymy na nowe.
    expect(done.counts).toEqual({ new: 2, in_progress: 1, resolved: 0, rejected: 0 });
  });

  it('jedna lista dla WSZYSTKICH klubów - każdy wiersz nazywa swój klub, kod pilota z tego klubu', async () => {
    const { app, db } = await testHarness();
    await seedBetaFleet(db);
    await submit(app, await login(app, 'TMK'), [report('alfa-1')]);
    await submit(app, await login(app, 'BPI'), [report('beta-1')]);

    const root = await panelCookie(app, 'ROOT');
    const items = (await list(app, root)).json().items as {
      uuid: string;
      pilotCode: string;
      org: { id: string; slug: string };
    }[];
    expect(items.map((i) => [i.uuid, i.pilotCode, i.org.id]).sort()).toEqual([
      ['alfa-1', 'TMK', ORG_A],
      ['beta-1', 'BPI', ORG_B],
    ]);
  });

  it('zmiana statusu wraca stanem po zmianie i zostawia ślad w dzienniku PLATFORMY', async () => {
    const { app, db } = await testHarness();
    await submit(app, await login(app, 'PWI'), [report('b1')]);

    const root = await panelCookie(app, 'ROOT');
    const res = await patch(app, root, 'b1', { status: 'resolved', note: 'Poprawione w 1.4.1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      uuid: 'b1',
      status: 'resolved',
      statusNote: 'Poprawione w 1.4.1',
      // Superadministrator KODU nie ma (kod jest własnością członkostwa) - panel
      // pokazuje wtedy brak kodu, a nie identyfikator.
      statusBy: null,
    });
    expect(res.json().statusAt).not.toBeNull();

    // Wpis audytu jest PLATFORMOWY: `org_id` pusty (dziennik żadnego klubu go nie
    // pokazuje), klub zgłoszenia jedzie w szczegółach - patrz `commands/bugReports.ts`.
    const audit = await db.query<{ org_id: string | null; actor_pilot_id: string; details: Record<string, unknown> }>(
      "SELECT org_id, actor_pilot_id, details FROM admin_audit WHERE action = 'bug.status'",
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]!.org_id).toBeNull();
    expect(audit.rows[0]!.actor_pilot_id).toBe('ROOT');
    expect(audit.rows[0]!.details).toMatchObject({
      from: 'new',
      to: 'resolved',
      reportedBy: 'PWI',
      orgId: ORG_A,
      orgSlug: 'aeroklub-alfa',
    });
    // Dziennik KLUBU tego wpisu nie widzi - to nie była akcja w klubie.
    const club = await app.inject({
      method: 'GET',
      url: '/admin/api/audit?action=bug.status',
      headers: bearer(await login(app, 'TMK')),
    });
    expect(club.json().items).toHaveLength(0);
  });

  it('odrzucenie BEZ komentarza jest odbijane - powód jest treścią odrzucenia', async () => {
    const { app } = await testHarness();
    await submit(app, await login(app, 'PWI'), [report('b1')]);
    const root = await panelCookie(app, 'ROOT');

    const empty = await patch(app, root, 'b1', { status: 'rejected', note: '   ' });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error).toBe('note_required');
    // Sam brak pola tak samo - reguła dotyczy TREŚCI, nie kształtu żądania.
    expect((await patch(app, root, 'b1', { status: 'rejected' })).statusCode).toBe(400);
    // …a inne statusy komentarza nie wymagają: „w toku" jest stanem, nie werdyktem.
    expect((await patch(app, root, 'b1', { status: 'in_progress' })).statusCode).toBe(200);
  });

  it('nieznane zgłoszenie → 404, nie cichy sukces na nieistniejącym wierszu', async () => {
    const { app } = await testHarness();
    const root = await panelCookie(app, 'ROOT');
    expect((await patch(app, root, 'nie-ma', { status: 'resolved' })).statusCode).toBe(404);
  });

  it('ADMINISTRATOR KLUBU nie widzi zgłoszeń - ani listy, ani zmiany statusu (issue #99, C6)', async () => {
    const { app } = await testHarness();
    const pilot = await login(app, 'PWI');
    expect((await submit(app, pilot, [report('b1')])).statusCode).toBe(200);

    // Sesja KLUBU (administrator Alfy) - trasy platformowe jej nie znają: 401, bo za
    // tokenem klubu nie stoi żadna tożsamość platformowa (rozłączność rodzajów tokenu).
    const admin = await panelCookie(app, 'TMK');
    expect((await list(app, admin)).statusCode).toBe(401);
    expect((await patch(app, admin, 'b1', { status: 'resolved' })).statusCode).toBe(401);

    // Zwykły pilot tym bardziej: token telefonu to token klubu.
    expect(
      (await app.inject({ method: 'GET', url: '/admin/api/bug-reports', headers: bearer(pilot) }))
        .statusCode,
    ).toBe(401);
  });
});
