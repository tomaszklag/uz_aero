/**
 * UZ Aero (serwer) - ZGŁOSZENIA BŁĘDÓW Z APLIKACJI PILOTA (issue #87).
 *
 * Pod obserwacją:
 *  1. telefon zgłasza z tożsamością Z TOKENU, a ponowienie tej samej paczki (uuid) nie
 *     robi drugiego zgłoszenia - to jest warunek offline-first: kolejka wysyła do
 *     skutku, a „do skutku" musi być bezpieczne;
 *  2. `context` jedzie DOSŁOWNIE, także z polami, o których serwer nie wie - bo o to
 *     w tym kanale chodzi (kształt należy do telefonu, zmienia się co tydzień testów);
 *  3. panel widzi listę z licznikami WSZYSTKICH statusów, filtruje statusem i dostaje
 *     KOD pilota, nie jego identyfikator;
 *  4. zmiana statusu zostawia ślad w dzienniku audytu z przejściem `from → to`,
 *     a odrzucenie BEZ komentarza jest odbijane;
 *  5. zdolności: odczyt na `panel.access`, zapis na `bugs.triage` - zwykły pilot nie
 *     dostaje ani jednego, mimo że sam zgłaszać może.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

const login = (app: App, who: string): Promise<string> =>
  app
    .inject({ method: 'POST', url: '/auth/login', payload: { login: who, password: TEST_PASSWORD } })
    .then((res) => res.json().token as string);

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
const writer = (t: string) => ({ ...bearer(t), ...ADMIN_CSRF_HEADERS });

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

const list = (app: App, token: string, query = '') =>
  app.inject({ method: 'GET', url: `/admin/api/bug-reports${query}`, headers: bearer(token) });

const patch = (app: App, token: string, uuid: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'PATCH',
    url: `/admin/api/bug-reports/${uuid}`,
    headers: writer(token),
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

    const admin = await login(app, 'TMK');
    const row = list(app, admin).then((r) => r.json().items[0]);
    expect((await row).pilotCode).toBe('PWI');
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

    const admin = await login(app, 'TMK');
    expect((await list(app, admin)).json().items).toHaveLength(3);
  });

  it('`context` jedzie dosłownie - także pola, o których serwer nie wie', async () => {
    const { app } = await testHarness();
    const pilot = await login(app, 'PWI');
    // Dokładnie ten przypadek, dla którego trasa nie waliduje kształtu kontekstu:
    // aplikacja dokłada nowe pole, a serwer ma je donieść bez wdrożenia.
    await submit(app, pilot, [
      report('b1', { context: { route: 'Cockpit', czegoNieZnamy: { a: 1 }, gpsFixes: 4212 } }),
    ]);

    const admin = await login(app, 'TMK');
    expect((await list(app, admin)).json().items[0].context).toEqual({
      route: 'Cockpit',
      czegoNieZnamy: { a: 1 },
      gpsFixes: 4212,
    });
  });

  it('waga jest opcjonalna, a zegary telefonu i serwera są dwoma różnymi polami', async () => {
    const { app } = await testHarness();
    const pilot = await login(app, 'PWI');
    await submit(app, pilot, [report('b1', { severity: null, sessionUuid: null, appVersion: null })]);

    const admin = await login(app, 'TMK');
    const item = (await list(app, admin)).json().items[0];
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

describe('moduł „Zgłoszenia" w panelu', () => {
  it('lista niesie liczniki WSZYSTKICH statusów, także pustych, i filtruje statusem', async () => {
    const { app } = await testHarness();
    const pilot = await login(app, 'PWI');
    await submit(app, pilot, [report('b1'), report('b2'), report('b3')]);

    const admin = await login(app, 'TMK');
    await patch(app, admin, 'b2', { status: 'in_progress', note: null });

    const all = (await list(app, admin)).json();
    expect(all.items).toHaveLength(3);
    expect(all.counts).toEqual({ new: 2, in_progress: 1, resolved: 0, rejected: 0 });

    const working = (await list(app, admin, '?status=new,in_progress')).json();
    expect(working.items).toHaveLength(3);
    const done = (await list(app, admin, '?status=resolved')).json();
    expect(done.items).toHaveLength(0);
    // Liczniki NIE zależą od filtru: „Rozwiązane" ma pokazywać swoją liczbę także
    // wtedy, gdy patrzymy na nowe.
    expect(done.counts).toEqual({ new: 2, in_progress: 1, resolved: 0, rejected: 0 });
  });

  it('zmiana statusu wraca stanem po zmianie i zostawia ślad w dzienniku audytu', async () => {
    const { app } = await testHarness();
    await submit(app, await login(app, 'PWI'), [report('b1')]);

    const admin = await login(app, 'TMK');
    const res = await patch(app, admin, 'b1', { status: 'resolved', note: 'Poprawione w 1.4.1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      uuid: 'b1',
      status: 'resolved',
      statusNote: 'Poprawione w 1.4.1',
      // KOD administratora, nie jego identyfikator - panel nie pokazuje uuid.
      statusBy: 'TMK',
    });
    expect(res.json().statusAt).not.toBeNull();

    const audit = await app.inject({
      method: 'GET',
      url: '/admin/api/audit?action=bug.status',
      headers: bearer(admin),
    });
    expect(audit.json().items).toHaveLength(1);
    expect(audit.json().items[0]).toMatchObject({
      action: 'bug.status',
      targetType: 'bug_report',
      targetId: 'b1',
    });
    expect(audit.json().items[0].details).toMatchObject({
      from: 'new',
      to: 'resolved',
      reportedBy: 'PWI',
    });
  });

  it('odrzucenie BEZ komentarza jest odbijane - powód jest treścią odrzucenia', async () => {
    const { app } = await testHarness();
    await submit(app, await login(app, 'PWI'), [report('b1')]);
    const admin = await login(app, 'TMK');

    const empty = await patch(app, admin, 'b1', { status: 'rejected', note: '   ' });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error).toBe('note_required');
    // Sam brak pola tak samo - reguła dotyczy TREŚCI, nie kształtu żądania.
    expect((await patch(app, admin, 'b1', { status: 'rejected' })).statusCode).toBe(400);
    // …a inne statusy komentarza nie wymagają: „w toku" jest stanem, nie werdyktem.
    expect((await patch(app, admin, 'b1', { status: 'in_progress' })).statusCode).toBe(200);
  });

  it('nieznane zgłoszenie → 404, nie cichy sukces na nieistniejącym wierszu', async () => {
    const { app } = await testHarness();
    const admin = await login(app, 'TMK');
    expect((await patch(app, admin, 'nie-ma', { status: 'resolved' })).statusCode).toBe(404);
  });

  it('zwykły pilot zgłasza, ale panelu nie czyta i statusów nie zmienia', async () => {
    const { app } = await testHarness();
    const pilot = await login(app, 'PWI');
    expect((await submit(app, pilot, [report('b1')])).statusCode).toBe(200);

    expect((await list(app, pilot)).statusCode).toBe(403);
    expect((await patch(app, pilot, 'b1', { status: 'resolved' })).statusCode).toBe(403);
  });
});
