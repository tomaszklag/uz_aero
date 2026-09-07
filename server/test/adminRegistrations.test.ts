/**
 * UZ Aero (serwer) - zgłoszenia rejestracyjne w panelu (`/admin/api/registrations`,
 * logowanie Google 2026-09-04; `docs/logowanie-google.md` §8).
 *
 * Przekrój END-TO-END, bo jego wartością jest CIĄG zdarzeń, a nie pojedyncza trasa:
 * nieznajomy loguje się Googlem i dostaje 202 → administrator widzi go na liście →
 * zatwierdza z kodem i rolą → to samo konto Google wchodzi do aplikacji z tokenami,
 * a ekran `00c` dowiaduje się o tym BEZ ponownego przechodzenia przez Google.
 *
 * Cztery własności, których złamanie jest luką, a nie usterką:
 *  1. **zatwierdzenie ZAKŁADA konto i dopiero to otwiera dostęp** - przed decyzją
 *     zgłaszający nie ma wiersza w `pilots`, więc nie ma tokenu;
 *  2. **decyzja jest jedna** - druga próba (także w drugą stronę) odbija `already_decided`;
 *  3. **odrzucenie niesie powód** - trasa nie przepuszcza pustego, bo pilot czyta go na `00d`;
 *  4. **konto bez `accounts.manage` nie ogląda zgłoszeń** - to e-maile ludzi spoza klubu.
 *
 * Zero atrap poza weryfikacją podpisu Google (`testIdentityProvider.ts`).
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor, googleTokenForStranger } from './testIdentityProvider.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const admin = (token: string) => ({ authorization: `Bearer ${token}`, ...ADMIN_CSRF_HEADERS });

async function tokenOf(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(who) },
  });
  return res.json().token as string;
}

/** Nieznajomy loguje się pierwszy raz - wraca 202 i token rejestracyjny. */
async function applyAs(app: Harness['app'], subject: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenForStranger(subject) },
  });
  expect(res.statusCode).toBe(202);
  return res.json() as { registrationToken: string };
}

const list = async (app: Harness['app'], token: string, status = 'pending') =>
  app.inject({ method: 'GET', url: `/admin/api/registrations?status=${status}`, headers: admin(token) });

const approve = async (app: Harness['app'], token: string, subject: string, body: object) =>
  app.inject({
    method: 'POST',
    url: `/admin/api/registrations/google/${subject}/approve`,
    headers: admin(token),
    payload: body,
  });

const reject = async (app: Harness['app'], token: string, subject: string, body: object) =>
  app.inject({
    method: 'POST',
    url: `/admin/api/registrations/google/${subject}/reject`,
    headers: admin(token),
    payload: body,
  });

const auditRows = (db: Harness['db']) =>
  db
    .query<{ action: string; target_type: string; target_id: string; details: Record<string, unknown> }>(
      'SELECT action, target_type, target_id, details FROM admin_audit ORDER BY created_at, id',
    )
    .then((r) => r.rows);

describe('GET /admin/api/registrations - kolejka zgłoszeń', () => {
  it('nieznajomy po pierwszym logowaniu stoi na liście jako `pending`, z danymi z Google', async () => {
    const { app } = await testHarness();
    await applyAs(app, 'nowak');

    const res = await list(app, await tokenOf(app, 'TMK'));

    expect(res.statusCode).toBe(200);
    // `linked: 1` to TMK - samo pobranie tokenu administratora podpięło jego konto
    // po e-mailu (§6). Kolejka (`pending`) ma dokładnie jednego nieznajomego.
    expect(res.json().counts).toEqual({ pending: 1, linked: 1, rejected: 0 });
    expect(res.json().items).toEqual([
      expect.objectContaining({
        provider: 'google',
        subject: 'nowak',
        email: 'nowak@gmail.com',
        name: 'Nieznajomy nowak',
        status: 'pending',
        rejectReason: null,
        decidedBy: null,
        pilotId: null,
        pilotCode: null,
      }),
    ]);
  });

  it('podpięte konta klubu NIE są zgłoszeniami - liczą się osobno jako `linked`', async () => {
    // Logowanie TMK podpięło jego konto po e-mailu (§6) - to jest tożsamość, nie kolejka.
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    await applyAs(app, 'nowak');

    const res = await list(app, token);
    expect(res.json().counts).toEqual({ pending: 1, linked: 1, rejected: 0 });
    expect(res.json().items.map((i: { subject: string }) => i.subject)).toEqual(['nowak']);
  });

  it('kolejka jest od NAJSTARSZEGO - kto czeka najdłużej, ten stoi na górze', async () => {
    const { app, clock } = await testHarness();
    await applyAs(app, 'pierwszy');
    clock.advance(60_000);
    await applyAs(app, 'drugi');

    const res = await list(app, await tokenOf(app, 'TMK'));
    expect(res.json().items.map((i: { subject: string }) => i.subject)).toEqual([
      'pierwszy',
      'drugi',
    ]);
  });

  it('konto bez `accounts.manage` nie ogląda zgłoszeń - to dane osób spoza klubu', async () => {
    const { app } = await testHarness();
    await applyAs(app, 'nowak');

    const res = await list(app, await tokenOf(app, 'JSE'));
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden', required: 'accounts.manage' });
  });
});

describe('POST .../approve - zatwierdzenie ZAKŁADA konto', () => {
  it('przed decyzją zgłaszający nie ma konta; po decyzji loguje się i ma tokeny', async () => {
    const { app, db } = await testHarness();
    const { registrationToken } = await applyAs(app, 'nowak');
    const before = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');

    const res = await approve(app, await tokenOf(app, 'TMK'), 'nowak', {
      code: 'jno',
      name: 'Jan Nowak',
      role: 'pilot',
    });

    expect(res.statusCode).toBe(201);
    const { pilot, registration } = res.json();
    // Kod normalizuje się do wersalików, e-mail przychodzi ZE ZGŁOSZENIA (tożsamość Google).
    expect(pilot).toMatchObject({ code: 'JNO', name: 'Jan Nowak', email: 'nowak@gmail.com', role: 'pilot', active: true });
    expect(registration).toMatchObject({ status: 'linked', pilotId: pilot.id, pilotCode: 'JNO', decidedBy: 'TMK' });
    expect(registration.decidedAt).not.toBeNull();

    const after = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');
    expect(Number(after.rows[0]?.count)).toBe(Number(before.rows[0]?.count) + 1);

    // Ekran `00c` dowiaduje się o zatwierdzeniu tokenem rejestracyjnym, bez Google
    // od nowa - i dostaje tokeny pilota. RAZ (audyt 2026-09-05): kolejne wywołanie
    // tym samym tokenem jest martwe, bo ktoś już na to konto wszedł.
    const status = await app.inject({
      method: 'GET',
      url: '/auth/registration',
      headers: { authorization: `Bearer ${registrationToken}` },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe('approved');
    expect(status.json().tokens.pilot.code).toBe('JNO');

    // I to jest cała treść przekroju: TO SAMO konto Google wchodzi teraz do aplikacji.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('nowak') },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().pilot).toMatchObject({ id: pilot.id, code: 'JNO', role: 'pilot' });

    const again = await app.inject({
      method: 'GET',
      url: '/auth/registration',
      headers: { authorization: `Bearer ${registrationToken}` },
    });
    expect(again.statusCode).toBe(404);
  });

  it('zgłoszenie CZEKA, a administrator zakłada konto z tym e-mailem - następne logowanie podpina', async () => {
    // Audyt 2026-09-05: rada panelu przy konflikcie e-maila brzmi „wpisz ten adres
    // w istniejącym koncie zamiast zatwierdzać zgłoszenie". Pierwsza wersja `resolve`
    // próbowała podpięcia wyłącznie dla konta NIEZNANEGO - wiersz `pending` już był,
    // więc człowiek zostawał w kolejce na zawsze.
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    await applyAs(app, 'nowak');

    const created = await app.inject({
      method: 'POST',
      url: '/admin/api/pilots',
      headers: admin(token),
      payload: { code: 'JNO', name: 'Jan Nowak', email: 'nowak@gmail.com', role: 'pilot' },
    });
    expect(created.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('nowak') },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().pilot.code).toBe('JNO');

    // Zgłoszenie zniknęło z kolejki - jest podpięte, nie „czekające".
    const queue = await list(app, token);
    expect(queue.json().items).toEqual([]);
    expect(queue.json().counts.pending).toBe(0);
  });

  it('zgłoszenie ODRZUCONE nie podpina się po e-mailu - decyzja zapadła', async () => {
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    await applyAs(app, 'nowak');
    await reject(app, token, 'nowak', { reason: 'nie z klubu' });

    await app.inject({
      method: 'POST',
      url: '/admin/api/pilots',
      headers: admin(token),
      payload: { code: 'JNO', name: 'Jan Nowak', email: 'nowak@gmail.com', role: 'pilot' },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('nowak') },
    });
    expect(login.statusCode).toBe(403);
    expect(login.json().error).toBe('registration_rejected');
  });

  it('konto z rolą admin też da się założyć z zgłoszenia - i od razu wchodzi do panelu', async () => {
    const { app } = await testHarness();
    await applyAs(app, 'szefowa');
    await approve(app, await tokenOf(app, 'TMK'), 'szefowa', { code: 'SZE', name: 'Szefowa', role: 'admin' });

    const panel = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/login',
      headers: ADMIN_CSRF_HEADERS,
      payload: { idToken: googleTokenForStranger('szefowa') },
    });
    expect(panel.statusCode).toBe(200);
    expect(panel.json().pilot.role).toBe('admin');
  });

  it('audyt: `registration.approve` na koncie, z e-mailem i imieniem z Google', async () => {
    const { app, db } = await testHarness();
    await applyAs(app, 'nowak');
    const res = await approve(app, await tokenOf(app, 'TMK'), 'nowak', { code: 'JNO', name: 'Jan Nowak', role: 'pilot' });

    const rows = await auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'registration.approve', target_type: 'pilot', target_id: res.json().pilot.id });
    expect(rows[0]?.details).toMatchObject({
      code: 'JNO',
      name: 'Jan Nowak',
      email: 'nowak@gmail.com',
      role: 'pilot',
      provider: 'google',
      subject: 'nowak',
      googleName: 'Nieznajomy nowak',
    });
  });

  it('zajęty kod → 409 z NAZWĄ pola, a konto NIE powstaje', async () => {
    const { app, db } = await testHarness();
    await applyAs(app, 'nowak');

    const res = await approve(app, await tokenOf(app, 'TMK'), 'nowak', { code: 'PWI', name: 'Jan Nowak', role: 'pilot' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'conflict', field: 'code' });
    const still = await db.query<{ status: string }>(`SELECT status FROM external_identities WHERE subject = 'nowak'`);
    expect(still.rows[0]?.status).toBe('pending');
    expect(await auditRows(db)).toEqual([]);
  });

  it('druga decyzja → 409 `already_decided` - także odrzucenie po zatwierdzeniu', async () => {
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    await applyAs(app, 'nowak');
    expect((await approve(app, token, 'nowak', { code: 'JNO', name: 'Jan Nowak', role: 'pilot' })).statusCode).toBe(201);

    const again = await approve(app, token, 'nowak', { code: 'JN2', name: 'Jan Nowak', role: 'pilot' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'already_decided', status: 'linked' });

    const rejectAfter = await reject(app, token, 'nowak', { reason: 'za późno' });
    expect(rejectAfter.statusCode).toBe(409);
    expect(rejectAfter.json()).toEqual({ error: 'already_decided', status: 'linked' });
  });

  it('nieznane zgłoszenie → 404; zły kształt ciała → 400', async () => {
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    expect((await approve(app, token, 'nie-ma', { code: 'X', name: 'X', role: 'pilot' })).statusCode).toBe(404);
    await applyAs(app, 'nowak');
    expect((await approve(app, token, 'nowak', { code: '', name: 'Jan', role: 'pilot' })).statusCode).toBe(400);
    expect((await approve(app, token, 'nowak', { code: 'JNO', name: 'Jan', role: 'krol' })).statusCode).toBe(400);
  });

  it('konto bez `accounts.manage` nie zatwierdza - 403', async () => {
    const { app } = await testHarness();
    await applyAs(app, 'nowak');
    const res = await approve(app, await tokenOf(app, 'JSE'), 'nowak', { code: 'JNO', name: 'Jan', role: 'pilot' });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST .../reject - odrzucenie z powodem', () => {
  it('odrzucone zgłoszenie: pilot dostaje 403 z POWODEM, konto nie powstaje', async () => {
    const { app, db } = await testHarness();
    const { registrationToken } = await applyAs(app, 'nowak');

    const res = await reject(app, await tokenOf(app, 'TMK'), 'nowak', {
      reason: 'To konto prywatne - zgłoś się adresem klubowym.',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().registration).toMatchObject({
      status: 'rejected',
      rejectReason: 'To konto prywatne - zgłoś się adresem klubowym.',
      decidedBy: 'TMK',
      pilotId: null,
    });

    // Ponowne logowanie tym kontem: odmowa z tym samym powodem (ekran `00d`).
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenForStranger('nowak') },
    });
    expect(login.statusCode).toBe(403);
    expect(login.json()).toMatchObject({
      error: 'registration_rejected',
      registration: { status: 'rejected', rejectReason: 'To konto prywatne - zgłoś się adresem klubowym.' },
    });

    // Token rejestracyjny sprzed decyzji też już mówi „odrzucone".
    const status = await app.inject({
      method: 'GET',
      url: '/auth/registration',
      headers: { authorization: `Bearer ${registrationToken}` },
    });
    expect(status.json()).toMatchObject({ status: 'rejected' });

    const pilots = await db.query<{ count: unknown }>(`SELECT count(*) AS count FROM pilots WHERE email = 'nowak@gmail.com'`);
    expect(Number(pilots.rows[0]?.count)).toBe(0);
  });

  it('powód jest WYMAGANY - pusty i same spacje → 400, bez decyzji', async () => {
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    await applyAs(app, 'nowak');

    expect((await reject(app, token, 'nowak', {})).statusCode).toBe(400);
    expect((await reject(app, token, 'nowak', { reason: '   ' })).statusCode).toBe(400);

    const still = await db.query<{ status: string }>(`SELECT status FROM external_identities WHERE subject = 'nowak'`);
    expect(still.rows[0]?.status).toBe('pending');
  });

  it('audyt: `registration.reject` z powodem i tożsamością zgłaszającego', async () => {
    const { app, db } = await testHarness();
    await applyAs(app, 'nowak');
    await reject(app, await tokenOf(app, 'TMK'), 'nowak', { reason: 'nie z klubu' });

    const rows = await auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'registration.reject', target_type: 'registration', target_id: 'google:nowak' });
    expect(rows[0]?.details).toEqual({ email: 'nowak@gmail.com', googleName: 'Nieznajomy nowak', reason: 'nie z klubu' });
  });

  it('odrzucone wypada z domyślnego widoku, ale liczy się w licznikach i jest pod filtrem', async () => {
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    await applyAs(app, 'nowak');
    await reject(app, token, 'nowak', { reason: 'nie z klubu' });

    const pending = await list(app, token, 'pending');
    expect(pending.json().items).toEqual([]);
    expect(pending.json().counts.rejected).toBe(1);

    const rejected = await list(app, token, 'rejected');
    expect(rejected.json().items.map((i: { subject: string }) => i.subject)).toEqual(['nowak']);
  });
});
