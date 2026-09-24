/**
 * Ninerdeck (serwer) - SESJE LOGOWANIA (2.1.0, issue #133; `docs/logowanie-haslem.md`
 * §4.3, §5.5, §5.6, §6).
 *
 * Do 2.1.0 zdalne wylogowanie miało jedną drogę - młot `credentials_valid_from`, który
 * zrywa WSZYSTKO naraz, łącznie z telefonem w powietrzu. Ten plik pilnuje, że dało się
 * zamienić go na skalpel i że skalpel naprawdę tnie.
 *
 * Najważniejsze są dwa przypadki i oba dotyczą ODMOWY: token wskazujący sesję nieznaną
 * oraz sesję unieważnioną nie mają prawa przejść bramy. Kod, który je liczy, powstał
 * razem z tabelą; bez tych przypadków „sesje działają" znaczyłoby tylko tyle, że wiersze
 * się zapisują.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_B } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Logowanie TELEFONU - para tokenów i sesja `mobile`. */
async function login(app: App, who: string): Promise<{ token: string; refreshToken: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json();
  return { token: body.token as string, refreshToken: body.refreshToken as string };
}

/** Logowanie PANELU - ciasteczko i sesja `panel`. */
async function panelLogin(app: App, who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.cookies.find((c) => c.name === 'ninerdeck_admin')!.value;
}

const cookieOf = (value: string) => ({ cookie: `ninerdeck_admin=${value}` });

async function sessionRows(db: Harness['db'], pilotId: string) {
  const { rows } = await db.query<{
    id: string;
    org_id: string | null;
    surface: string;
    method: string;
    revoked_at: string | null;
    revoked_by: string | null;
    device_label: string | null;
    last_seen_at: string;
  }>(
    `SELECT id, org_id, surface, method, revoked_at, revoked_by, device_label, last_seen_at
       FROM login_sessions WHERE pilot_id = $1 ORDER BY created_at, id`,
    [pilotId],
  );
  return rows;
}

/** `sid` z tokenu - bez rozbierania JWT w każdym przypadku z osobna. */
const sidOf = (harness: Harness, token: string): string | null =>
  harness.tokens.verify(token)?.sessionId ?? null;

describe('sesja powstaje przy każdym wejściu (§4.3)', () => {
  it('telefon i panel dostają OSOBNE wiersze - po jednym na powierzchnię', async () => {
    const { app, db } = await testHarness();
    await login(app, 'TMK');
    await panelLogin(app, 'TMK');

    const rows = await sessionRows(db, 'TMK');
    expect(rows.map((r) => r.surface).sort()).toEqual(['mobile', 'panel']);
    expect(rows.every((r) => r.method === 'google')).toBe(true);
    expect(rows.every((r) => r.org_id === ORG_A)).toBe(true);
    expect(rows.every((r) => r.revoked_at == null)).toBe(true);
  });

  it('logowanie HASŁEM zapisuje metodę `password`, nie `google`', async () => {
    const { app, db, passwords } = await testHarness();
    await passwords.change('TMK', null, 'zielone-smiglo-leci-2026', null);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/password',
      payload: { login: 'adam@ninerdeck.pl', password: 'zielone-smiglo-leci-2026' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect((await sessionRows(db, 'TMK')).map((r) => r.method)).toEqual(['password']);
  });

  it('ROTACJA zachowuje sesję, a przełączenie klubu zakłada NOWĄ', async () => {
    // Dwie strony tej samej reguły: para tokenów jest parą DLA KLUBU, więc odświeżenie
    // to dalej to samo urządzenie, a zmiana klubu - nowa sesja. Gdyby rotacja zakładała
    // wiersz, lista urządzeń w panelu byłaby dziennikiem odświeżeń.
    const harness = await testHarness();
    const { app, db } = harness;
    const first = await login(app, 'PWI');
    const sid = sidOf(harness, first.token);

    const rotated = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(rotated.statusCode).toBe(200);
    expect(sidOf(harness, rotated.json().token)).toBe(sid);
    expect(await sessionRows(db, 'PWI')).toHaveLength(1);

    const switched = await app.inject({
      method: 'POST',
      url: '/auth/switch',
      headers: bearer(rotated.json().token),
      payload: { orgId: ORG_B },
    });
    expect(switched.statusCode, switched.body).toBe(200);
    const rows = await sessionRows(db, 'PWI');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.org_id).sort()).toEqual([ORG_A, ORG_B].sort());
    // Metoda WĘDRUJE ze źródłowej: człowiek nie logował się drugi raz.
    expect(rows.every((r) => r.method === 'google')).toBe(true);
  });

  it('urządzenie podaje się nagłówkiem, przeglądarka - dwoma słowami z `User-Agent`', async () => {
    const { app, db } = await testHarness();
    await app.inject({
      method: 'POST',
      url: '/auth/google',
      headers: { 'x-ninerdeck-device': 'Android 14 · Pixel 7' },
      payload: { idToken: googleTokenFor('TMK') },
    });
    await app.inject({
      method: 'POST',
      url: '/admin/api/auth/login',
      headers: {
        ...ADMIN_CSRF_HEADERS,
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      payload: { idToken: googleTokenFor('TMK') },
    });

    // Po POWIERZCHNI, nie po kolejności wstawienia: oba wiersze powstają w tej samej
    // chwili sterowanego zegara, więc porządek `created_at` nic tu nie rozstrzyga.
    const bySurface = Object.fromEntries(
      (await sessionRows(db, 'TMK')).map((r) => [r.surface, r.device_label]),
    );
    expect(bySurface).toEqual({
      mobile: 'Android 14 · Pixel 7',
      panel: 'Chrome · Windows',
    });
  });
});

describe('brama sprawdza sesję przy każdym żądaniu (§6)', () => {
  it('sesja UNIEWAŻNIONA odbija żądanie telefonu i odświeżenie - z powodem', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const { token, refreshToken } = await login(app, 'TMK');

    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(token) })).statusCode).toBe(200);

    await db.query(
      `UPDATE login_sessions SET revoked_at = now(), revoked_by = 'admin' WHERE pilot_id = 'TMK'`,
    );

    // Trasa telefonu: zwykłe 401 - aplikacja reaguje na nie próbą odświeżenia…
    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(token) })).statusCode).toBe(401);
    // …a odświeżenie mówi DLACZEGO, i to jest cała droga do banera z powodem (D7).
    const refreshed = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshed.statusCode).toBe(401);
    expect(refreshed.json()).toEqual({ error: 'session_revoked' });
  });

  it('odmowa odświeżenia NIE zużywa refresha - w bazie nie zostaje osierocony wiersz', async () => {
    // Gdyby sesję sprawdzać PO rotacji, każda próba synca wylogowanego telefonu
    // zostawiałaby świeży, nikomu niedoręczony token na kolejne 90 dni.
    const { app, db } = await testHarness();
    const { refreshToken } = await login(app, 'TMK');
    await db.query(
      `UPDATE login_sessions SET revoked_at = now(), revoked_by = 'admin' WHERE pilot_id = 'TMK'`,
    );

    const before = await db.query("SELECT token_hash FROM refresh_tokens WHERE pilot_id = 'TMK'");
    await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    const after = await db.query("SELECT token_hash FROM refresh_tokens WHERE pilot_id = 'TMK'");
    expect(after.rows).toEqual(before.rows);
  });

  it('token z `sid` NIEZNANYM bazie odbija, a token BEZ `sid` przechodzi', async () => {
    // Dwie strony reguły zgodności (§6). Brak `sid` = poświadczenie sprzed 2.1.0
    // i przechodzi DO WYGAŚNIĘCIA, bo wdrożenie nie ma prawa wylogować wszystkich naraz.
    // `sid` nieznany to co innego: ktoś wskazuje sesję, której nie ma.
    const harness = await testHarness();
    const { app, tokens } = harness;
    await login(app, 'TMK');

    const unknown = tokens.sign(
      { pilotId: 'TMK', orgId: ORG_A, code: 'TMK', sessionId: 'sesja-widmo' },
      3600,
    );
    const legacy = tokens.sign(
      { pilotId: 'TMK', orgId: ORG_A, code: 'TMK', sessionId: '' },
      3600,
    );

    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(unknown) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(legacy) })).statusCode).toBe(200);
  });

  it('PANEL dostaje nazwany powód od razu - nie ma czego odświeżyć', async () => {
    const { app, db } = await testHarness();
    const cookie = await panelLogin(app, 'TMK');
    await db.query(
      `UPDATE login_sessions SET revoked_at = now(), revoked_by = 'admin'
        WHERE pilot_id = 'TMK' AND surface = 'panel'`,
    );

    const res = await app.inject({ method: 'GET', url: '/admin/api/me', headers: cookieOf(cookie) });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'session_revoked' });
  });

  it('„ostatnio aktywny" zapisuje się NAJWYŻEJ RAZ NA MINUTĘ', async () => {
    const { app, db, clock } = await testHarness();
    const { token } = await login(app, 'TMK');

    // Sterownik oddaje `timestamptz` jako `Date`, więc porównujemy ZAPIS, nie obiekt:
    // dwie instancje o tej samej chwili nie są tym samym obiektem.
    const seen = async () =>
      new Date((await sessionRows(db, 'TMK'))[0]!.last_seen_at).toISOString();
    const ping = async () => {
      await app.inject({ method: 'GET', url: '/reference', headers: bearer(token) });
      return seen();
    };

    // PIERWSZE żądanie po zalogowaniu zapisuje: przepustnica żyje w pamięci procesu
    // i o tej sesji jeszcze nie wie (sesję założyło `open`, nie ona).
    clock.advance(10_000);
    const first = await ping();
    // …a drugie, w tym samym oknie - NIE. To jest cała treść przepustnicy: telefon
    // synchronizuje się co minutę, a różnica „teraz" kontra „minutę temu" nie zmienia
    // ani jednego napisu na ekranie.
    clock.advance(10_000);
    expect(await ping()).toBe(first);

    clock.advance(60_000);
    expect(await ping()).not.toBe(first);
  });
});

describe('wylogowanie (§5.5)', () => {
  it('telefon: refresh znika z bazy, a sesja dostaje stempel `self`', async () => {
    const { app, db } = await testHarness();
    const { refreshToken } = await login(app, 'TMK');

    expect((await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken } })).statusCode).toBe(204);

    const { rows } = await db.query("SELECT token_hash FROM refresh_tokens WHERE pilot_id = 'TMK'");
    expect(rows).toHaveLength(0);
    expect(await sessionRows(db, 'TMK')).toMatchObject([{ revoked_by: 'self' }]);
  });

  it('nieznany refresh kończy się `204`, nie błędem', async () => {
    // „Wyloguj" klika się także wtedy, gdy poświadczenie jest już martwe - odmowa
    // zostawiłaby człowieka w aplikacji, z której właśnie chciał wyjść.
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: 'nie-ma-takiego-tokenu' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('panel: wylogowanie stempluje wiersz sesji, nie tylko kasuje ciasteczko', async () => {
    const { app, db } = await testHarness();
    const cookie = await panelLogin(app, 'TMK');

    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/admin/api/auth/logout',
          headers: { ...cookieOf(cookie), ...ADMIN_CSRF_HEADERS },
        })
      ).statusCode,
    ).toBe(204);

    expect(await sessionRows(db, 'TMK')).toMatchObject([{ surface: 'panel', revoked_by: 'self' }]);
  });
});

describe('unieważnianie przy innych decyzjach (§5.3, §5.4)', () => {
  it('ZMIANA HASŁA wylogowuje pozostałe urządzenia, a bieżące zostawia', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const stay = await login(app, 'TMK');
    await login(app, 'TMK');
    await panelLogin(app, 'TMK');
    expect(await sessionRows(db, 'TMK')).toHaveLength(3);

    const res = await app.inject({
      method: 'PUT',
      url: '/me/password',
      headers: bearer(stay.token),
      payload: { next: 'zielone-smiglo-leci-2026' },
    });
    expect(res.statusCode, res.body).toBe(204);

    const live = (await sessionRows(db, 'TMK')).filter((r) => r.revoked_at == null);
    expect(live.map((r) => r.id)).toEqual([sidOf(harness, stay.token)]);
    // Telefon, z którego padła zmiana, pracuje dalej - inaczej „zmień hasło" kończyłoby
    // się ekranem logowania i wyglądało jak błąd.
    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(stay.token) })).statusCode).toBe(200);
  });

  it('REALIZACJA LINKU zrywa WSZYSTKIE sesje osoby - stare hasło mogło wyciec', async () => {
    const { app, db, mail, passwords } = await testHarness();
    await login(app, 'TMK');
    await panelLogin(app, 'TMK');

    await passwords.forgot('adam@ninerdeck.pl', null);
    const link = mail.lastTo('adam@ninerdeck.pl')!;
    const token = /#([A-Za-z0-9_-]+)/.exec(link.text)![1]!;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/password/reset',
          payload: { token, password: 'zupelnie-nowe-haslo-2026' },
        })
      ).statusCode,
    ).toBe(204);

    const rows = await sessionRows(db, 'TMK');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revoked_by === 'system')).toBe(true);
  });

  it('WYŁĄCZENIE CZŁONKOSTWA gasi sesje w TYM klubie, drugi zostaje nietknięty', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    // PWI jest w obu klubach: loguje się do Bety, potem do Alfy (świeższy refresh
    // przestawia klub aktywny), więc ma po jednej sesji w każdym.
    const beta = await login(app, 'PWI');
    const switched = await app.inject({
      method: 'POST',
      url: '/auth/switch',
      headers: bearer(beta.token),
      payload: { orgId: ORG_B },
    });
    expect(switched.statusCode, switched.body).toBe(200);
    expect(await sessionRows(db, 'PWI')).toHaveLength(2);

    const admin = await login(app, 'TMK');
    const off = await app.inject({
      method: 'POST',
      url: '/admin/api/pilots/PWI/active',
      headers: { ...bearer(admin.token), ...ADMIN_CSRF_HEADERS },
      payload: { active: false },
    });
    expect(off.statusCode, off.body).toBe(200);

    const rows = await sessionRows(db, 'PWI');
    expect(rows.filter((r) => r.org_id === ORG_A).every((r) => r.revoked_by === 'admin')).toBe(true);
    expect(rows.filter((r) => r.org_id === ORG_B).every((r) => r.revoked_at == null)).toBe(true);
  });
});

describe('sesje w panelu (§5.6)', () => {
  it('`GET /me/sessions` pokazuje moje urządzenia i oznacza BIEŻĄCE', async () => {
    const { app } = await testHarness();
    await login(app, 'TMK');
    const cookie = await panelLogin(app, 'TMK');

    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/me/sessions',
      headers: cookieOf(cookie),
    });
    expect(res.statusCode, res.body).toBe(200);
    const list = res.json() as Array<{ surface: string; current: boolean }>;
    expect(list).toHaveLength(2);
    expect(list.filter((s) => s.current).map((s) => s.surface)).toEqual(['panel']);
  });

  it('własnej BIEŻĄCEJ sesji nie da się wyłączyć tą trasą; cudzej - też nie', async () => {
    const harness = await testHarness();
    const { app } = harness;
    const phone = await login(app, 'TMK');
    const cookie = await panelLogin(app, 'TMK');
    const mine = (
      await app.inject({ method: 'GET', url: '/admin/api/me/sessions', headers: cookieOf(cookie) })
    ).json() as Array<{ id: string; current: boolean }>;
    const current = mine.find((s) => s.current)!;

    const self = await app.inject({
      method: 'DELETE',
      url: `/admin/api/me/sessions/${current.id}`,
      headers: { ...cookieOf(cookie), ...ADMIN_CSRF_HEADERS },
    });
    expect(self.statusCode).toBe(404);

    // …ale DRUGIE własne urządzenie - owszem.
    const other = await app.inject({
      method: 'DELETE',
      url: `/admin/api/me/sessions/${sidOf(harness, phone.token)}`,
      headers: { ...cookieOf(cookie), ...ADMIN_CSRF_HEADERS },
    });
    expect(other.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(phone.token) })).statusCode).toBe(401);
  });

  it('administrator wylogowuje urządzenie członka - z wpisem w dzienniku BEZ `sid`', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const member = await login(app, 'PWI');
    const admin = await login(app, 'TMK');

    const list = await app.inject({
      method: 'GET',
      url: '/admin/api/pilots/PWI/sessions',
      headers: bearer(admin.token),
    });
    expect(list.statusCode, list.body).toBe(200);
    const sessions = list.json() as Array<{ id: string; current: boolean }>;
    expect(sessions).toHaveLength(1);
    // Cudza sesja nie jest „tym urządzeniem" nigdy.
    expect(sessions[0]!.current).toBe(false);

    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/api/pilots/PWI/sessions/${sessions[0]!.id}`,
      headers: { ...bearer(admin.token), ...ADMIN_CSRF_HEADERS },
    });
    expect(res.statusCode, res.body).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(member.token) })).statusCode).toBe(401);

    const { rows } = await db.query<{ action: string; details: Record<string, unknown> }>(
      "SELECT action, details FROM admin_audit WHERE action LIKE 'session.%' ORDER BY id",
    );
    expect(rows).toMatchObject([{ action: 'session.revoke', details: { code: 'PWI', surface: 'mobile' } }]);
    expect(JSON.stringify(rows[0]!.details)).not.toContain(sessions[0]!.id);
  });

  it('„wyloguj wszędzie w tym klubie" oddaje liczbę i zostawia klub obcy', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const beta = await login(app, 'PWI');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/switch',
          headers: bearer(beta.token),
          payload: { orgId: ORG_B },
        })
      ).statusCode,
    ).toBe(200);
    const admin = await login(app, 'TMK');

    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/pilots/PWI/sessions/revoke-all',
      headers: { ...bearer(admin.token), ...ADMIN_CSRF_HEADERS },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ revoked: 1 });

    const rows = await sessionRows(db, 'PWI');
    expect(rows.filter((r) => r.org_id === ORG_B).every((r) => r.revoked_at == null)).toBe(true);
  });
});
