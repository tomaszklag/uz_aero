/**
 * UZ Aero (serwer) - SESJA PRZEGLĄDARKOWA panelu (`/admin/api/auth/*`, `GET /admin/api/me`).
 *
 * Cztery własności, których złamanie jest luką, a nie usterką:
 *  1. token wychodzi WYŁĄCZNIE ciasteczkiem `HttpOnly` - ciało odpowiedzi go nie niesie;
 *  2. ciasteczko autoryzuje trasy panelu tak samo jak `Bearer`, a `Bearer` nadal działa
 *     (jedna brama, dwa kanały - `http/tokenFromRequest.ts`);
 *  3. konto bez `panel.access` NIE DOSTAJE sesji (nie „dostaje pustą") - i wie dlaczego;
 *  4. wylogowanie unieważnia ciasteczko po stronie przeglądarki.
 *
 * Wszystko przez prawdziwe endpointy na PGlite (`app.inject`), zero atrap - jak reszta
 * testów serwera. Ciasteczko czytamy z nagłówka `set-cookie`, czyli dokładnie tak, jak
 * zobaczy je przeglądarka.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const ADMIN_SESSION_TTL_SEC = 8 * 60 * 60;

function panelLogin(app: Harness['app'], login: string, password = TEST_PASSWORD) {
  return app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { login, password },
  });
}

/** Surowy nagłówek `Set-Cookie` - atrybuty sprawdzamy na napisie, nie na obietnicy. */
function setCookieHeader(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw.join('\n') : String(raw ?? '');
}

function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const value = /uzaero_admin=([^;]*)/.exec(setCookieHeader(res))?.[1];
  if (value == null) throw new Error('Odpowiedź nie ustawiła ciasteczka sesji panelu');
  return `uzaero_admin=${value}`;
}

describe('logowanie do panelu wydaje ciasteczko, nie token w ciele', () => {
  it('administrator dostaje sesję: ciasteczko HttpOnly + tożsamość i zdolności w ciele', async () => {
    const { app } = await testHarness();
    const res = await panelLogin(app, 'TMK');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      pilot: { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz', role: 'admin' },
      capabilities: [
        'panel.access',
        'flags.resolve',
        'events.correct',
        'accounts.manage',
        'fleet.manage',
        'thresholds.manage',
        'audit.read',
        // Narzędzia serwisowe (`A11`) - dopisane 2026-08-02 razem z trasami
        // konserwacji. Ten przypadek jest jedynym miejscem, które zauważa nową
        // pozycję katalogu, i dlatego lista jest tu wypisana, a nie porównana
        // z `capabilitiesOf('admin')`: porównanie z tą samą funkcją, którą trasa
        // woła, przechodziłoby przy każdej zmianie i nie mówiłoby nic.
        'maintenance.run',
      ],
    });

    // Token NIGDZIE w ciele - inaczej panel mógłby go „na chwilę" odłożyć do
    // localStorage i cała ochrona przed XSS-em kończyłaby się na tym `const`.
    expect(res.body).not.toMatch(/eyJ/);
    expect(res.json()).not.toHaveProperty('token');
    expect(res.json()).not.toHaveProperty('refreshToken');
  });

  it('ciasteczko ma komplet atrybutów z §8.2 - HttpOnly, Secure, SameSite=Strict, Path=/admin', () => {
    return testHarness().then(async ({ app }) => {
      const header = setCookieHeader(await panelLogin(app, 'TMK'));

      expect(header).toMatch(/^uzaero_admin=/);
      expect(header).toMatch(/HttpOnly/i);
      expect(header).toMatch(/Secure/i);
      expect(header).toMatch(/SameSite=Strict/i);
      expect(header).toMatch(/Path=\/admin/i);
      // 8 h: przeglądarka nie dostaje refresh tokenu (§8.4), więc czas życia sesji
      // jest w całości tym jednym `Max-Age`.
      expect(header).toContain(`Max-Age=${ADMIN_SESSION_TTL_SEC}`);
    });
  });

  it('szef wyszkolenia dostaje sesję z WĘŻSZĄ listą zdolności', async () => {
    const { app } = await testHarness();
    const res = await panelLogin(app, 'AKO');

    expect(res.statusCode).toBe(200);
    expect(res.json().capabilities).toEqual(['panel.access', 'flags.resolve']);
  });

  it('złe hasło i nieistniejące konto dają IDENTYCZNĄ odpowiedź (A00a)', async () => {
    const { app } = await testHarness();

    const wrongPassword = await panelLogin(app, 'TMK', 'nie-to-haslo');
    const noSuchAccount = await panelLogin(app, 'NIE-MA-TAKIEGO', 'nie-to-haslo');

    expect(wrongPassword.statusCode).toBe(401);
    expect(noSuchAccount.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual({ error: 'invalid_credentials' });
    expect(noSuchAccount.json()).toEqual(wrongPassword.json());
    expect(setCookieHeader(wrongPassword)).toBe('');
  });
});

describe('konto bez `panel.access` nie dostaje sesji panelu', () => {
  it('pilot z POPRAWNYM hasłem odbija się o rolę - 403 z powodem, bez ciasteczka', async () => {
    // Mockup A00 mówi to wprost: „konto pilota zaloguje się poprawnie, ale zobaczy
    // komunikat". Odpowiedź musi więc być ODRÓŻNIALNA od złego hasła, inaczej pilot
    // szukałby błędu w haśle, którego nie ma.
    const { app } = await testHarness();
    const res = await panelLogin(app, 'PWI');

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'no_panel_access' });
    expect(setCookieHeader(res)).toBe('');
  });

  it('pilot nie ma czym otworzyć panelu także tokenem `Bearer` z aplikacji', async () => {
    // Druga strona tej samej reguły: brak sesji panelu nie jest jedynym zamkiem.
    const { app } = await testHarness();
    const phone = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'PWI', password: TEST_PASSWORD },
    });

    const me = await app.inject({
      method: 'GET',
      url: '/admin/api/me',
      headers: { authorization: `Bearer ${phone.json().token}` },
    });
    expect(me.statusCode).toBe(403);
    expect(me.json()).toEqual({ error: 'forbidden', required: 'panel.access' });
  });
});

describe('ciasteczko autoryzuje trasy panelu - i nie odbiera tego `Bearer`', () => {
  it('`GET /admin/api/me` działa na samym ciasteczku (JS panelu nie zna tokenu)', async () => {
    const { app } = await testHarness();
    const cookie = sessionCookie(await panelLogin(app, 'TMK'));

    const me = await app.inject({ method: 'GET', url: '/admin/api/me', headers: { cookie } });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ pilot: { id: 'TMK', name: 'Tomasz Małkiewicz' } });
  });

  it('ciasteczko autoryzuje też listy panelu - brama jest JEDNA', async () => {
    const { app } = await testHarness();
    const cookie = sessionCookie(await panelLogin(app, 'TMK'));

    const sessions = await app.inject({
      method: 'GET',
      url: '/admin/api/sessions',
      headers: { cookie },
    });
    expect(sessions.statusCode).toBe(200);
  });

  it('`Bearer` nadal działa na trasach panelu - nic mu nie odebraliśmy', async () => {
    const { app } = await testHarness();
    const phone = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });

    const me = await app.inject({
      method: 'GET',
      url: '/admin/api/me',
      headers: { authorization: `Bearer ${phone.json().token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().pilot.id).toBe('TMK');
  });

  it('nagłówek WYGRYWA z ciasteczkiem - drugie poświadczenie nie podnosi uprawnień', async () => {
    // Żądanie niosące oba pochodzi z przeglądarki z doklejonym `Authorization`.
    // Kolejność jest zapisana raz (`tokenFromRequest`), więc nie zależy od trasy.
    const { app } = await testHarness();
    const adminCookie = sessionCookie(await panelLogin(app, 'TMK'));
    const pilot = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'PWI', password: TEST_PASSWORD },
    });

    const me = await app.inject({
      method: 'GET',
      url: '/admin/api/me',
      headers: { cookie: adminCookie, authorization: `Bearer ${pilot.json().token}` },
    });

    // Wygrywa nagłówek - czyli token PILOTA, czyli 403. Gdyby wygrywało ciasteczko,
    // ten sam mechanizm w drugą stronę pozwalałby podnieść uprawnienia doklejeniem
    // cudzego ciasteczka do żądania ze słabszym tokenem.
    expect(me.statusCode).toBe(403);
    expect(me.json()).toEqual({ error: 'forbidden', required: 'panel.access' });
  });

  it('bez żadnego poświadczenia → 401', async () => {
    const { app } = await testHarness();
    const me = await app.inject({ method: 'GET', url: '/admin/api/me' });

    expect(me.statusCode).toBe(401);
    expect(me.json()).toEqual({ error: 'unauthorized' });
  });

  it('sesja panelu NIE otwiera niczego, czego nie otwierał token telefonu', async () => {
    // Ciasteczko jest kanałem, nie awansem: sesja szefa wyszkolenia dalej odbija się
    // o `events.correct`, tak samo jak jego token `Bearer`.
    const { app } = await testHarness();
    const cookie = sessionCookie(await panelLogin(app, 'AKO'));

    const correction = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-1/corrections',
      headers: { cookie, ...ADMIN_CSRF_HEADERS },
      payload: { targetUuid: 'x', action: 'void', reason: 'Próba korekty bez uprawnień.' },
    });

    expect(correction.statusCode).toBe(403);
    expect(correction.json()).toEqual({ error: 'forbidden', required: 'events.correct' });
  });
});

describe('wylogowanie', () => {
  it('kasuje ciasteczko - przeglądarka dostaje pustą wartość i wygasłą datę', async () => {
    const { app } = await testHarness();
    const cookie = sessionCookie(await panelLogin(app, 'TMK'));

    const out = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/logout',
      headers: { cookie, ...ADMIN_CSRF_HEADERS },
    });

    expect(out.statusCode).toBe(204);
    const header = setCookieHeader(out);
    expect(header).toMatch(/uzaero_admin=;/);
    expect(header).toMatch(/Path=\/admin/i);
    // Ta sama ścieżka co przy wydaniu - inaczej „wylogowanie" nie trafiłoby
    // w to ciasteczko i zostawiłoby żywą sesję przy zielonym komunikacie.
  });

  it('działa bez ważnej sesji - martwe ciasteczko też trzeba dać się pozbyć', async () => {
    const { app } = await testHarness();
    const out = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/logout',
      headers: ADMIN_CSRF_HEADERS,
    });
    expect(out.statusCode).toBe(204);
  });
});

describe('CSRF: mutacje panelu wymagają własnego nagłówka', () => {
  it('logowanie bez `X-UZ-Admin` jest odrzucane, choć poświadczenia są dobre', async () => {
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'csrf_header_required' });
    expect(setCookieHeader(res)).toBe('');
  });

  it('ODCZYT panelu nagłówka nie wymaga - GET nie ma skutków ubocznych', async () => {
    const { app } = await testHarness();
    const cookie = sessionCookie(await panelLogin(app, 'TMK'));

    expect((await app.inject({ method: 'GET', url: '/admin/api/me', headers: { cookie } })).statusCode).toBe(200);
  });

  it('trasy telefonu nagłówka NIE wymagają - brama dotyczy wyłącznie `/admin/api`', async () => {
    // Aplikacja pilota nie ma o tym nagłówku pojęcia i mieć nie musi: nosi token
    // w `Authorization`, którego przeglądarka nie dokleja cross-origin.
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
  });
});
