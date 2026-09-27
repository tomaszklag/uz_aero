/**
 * Ninerdeck (serwer) - WŁASNA REZERWACJA Z PANELU (3.2.0, issue #233; `docs/rezerwacje.md`
 * §5.2, §10).
 *
 * Od issue #216 kalendarz w panelu ma każdy członek klubu, a rezerwować mógł wyłącznie
 * w aplikacji. Trasy `/admin/api/me/bookings*` i bliźniak sugestii zamykają tę dziurę.
 *
 * Pod obserwacją:
 *  1. **pilot z PUSTYM zakresem zakłada, przesuwa i odwołuje WŁASNĄ rezerwację** - bez
 *     żadnej zdolności, bo to jego praca, nie władza nad cudzym planem;
 *  2. **właściciel bierze się z SESJI** - `pilotId` doklejony do ciała nie zmienia
 *     niczego, więc zwykły członek nie założy rezerwacji za kogoś innego;
 *  3. **cudzej nie tknie tą drogą** - `/me/` znaczy „moje", a cudza odpowiada 403
 *     `not_your_booking`, jak na telefonie (cudzą odwołuje `reservations.manage`);
 *  4. **ta sama komenda, co telefon**: nakładka mówi, co stoi (`taken` + `takenAt`),
 *     powtórzony zapis wraca tym samym wierszem, ścieżka akceptacji obowiązuje tak samo,
 *     a poprawka terminu czyści zgody;
 *  5. **ŻADNEGO wpisu audytu** - własna rezerwacja jest zwykłą pracą pilota (§3.5);
 *  6. **sugestie z panelu = sugestie z telefonu**, co do bajtu.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];
type Db = Harness['db'];

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

const login = (app: App, who: string): Promise<string> =>
  app
    .inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor(who) } })
    .then((res) => res.json().token as string);

async function panelCookie(app: App, who: string): Promise<Record<string, string>> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'ninerdeck_admin')!;
  return { cookie: `ninerdeck_admin=${cookie.value}`, ...ADMIN_CSRF_HEADERS };
}

const TERAZ = Date.UTC(2026, 5, 22, 8, 0, 0);
const JUTRO = TERAZ + 86_400_000;
const H = 3_600_000;
const iso = (t: number): string => new Date(t).toISOString();

let seq = 0;
const nextId = (): string => `own-${(seq += 1)}`;

const createOwn = (
  app: App,
  session: Record<string, string>,
  from: number,
  to: number,
  over: Record<string, unknown> = {},
) =>
  app.inject({
    method: 'POST',
    url: '/admin/api/me/bookings',
    headers: session,
    payload: {
      id: nextId(),
      aircraftId: 'SP-AXA',
      startsAt: iso(from),
      endsAt: iso(to),
      operation: 'ferry',
      fromIcao: 'EPZG',
      toIcao: 'EPKK',
      plannedAirMin: 90,
      ...over,
    },
  });

const auditCount = async (db: Db): Promise<number> => {
  const { rows } = await db.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM admin_audit WHERE action LIKE 'booking.%'`,
  );
  return Number(rows[0]!.n);
};

describe('własna rezerwacja z panelu (#233)', () => {
  it('pilot z PUSTYM zakresem zakłada, przesuwa i odwołuje własną - bez śladu w dzienniku audytu', async () => {
    const { app, db } = await testHarness();
    // PWI to zwykły pilot: żadnej zdolności klubowej.
    const session = await panelCookie(app, 'PWI');

    const made = await createOwn(app, session, JUTRO + 8 * H, JUTRO + 10 * H, { note: 'lot po części' });
    expect(made.statusCode, made.body).toBe(201);
    expect(made.json()).toMatchObject({
      pilotId: 'PWI',
      createdBy: 'PWI',
      status: 'confirmed',
      operation: 'ferry',
      plannedAirMin: 90,
      note: 'lot po części',
    });
    const id = made.json().id as string;

    // Przesunięcie niesie SAMĄ RÓŻNICĘ - trasa i plan zostają z wiersza.
    const moved = await app.inject({
      method: 'PATCH',
      url: `/admin/api/me/bookings/${id}`,
      headers: session,
      payload: { startsAt: iso(JUTRO + 9 * H), endsAt: iso(JUTRO + 11 * H) },
    });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json()).toMatchObject({ startsAt: iso(JUTRO + 9 * H), fromIcao: 'EPZG', plannedAirMin: 90 });

    // Odwołanie bez ciała i bez powodu - przy własnej nie ma komu tłumaczyć.
    const off = await app.inject({ method: 'DELETE', url: `/admin/api/me/bookings/${id}`, headers: session });
    expect(off.statusCode, off.body).toBe(200);
    expect(off.json()).toMatchObject({ status: 'cancelled', closeReason: null });

    expect(await auditCount(db)).toBe(0);
  });

  it('właściciel bierze się z SESJI - `pilotId` w ciele nie robi z nikogo innego właściciela', async () => {
    const { app, db } = await testHarness();
    const session = await panelCookie(app, 'PWI');

    const made = await createOwn(app, session, JUTRO + 8 * H, JUTRO + 10 * H, { pilotId: 'AKO' });
    expect(made.statusCode, made.body).toBe(201);
    const { rows } = await db.query<{ pilot_id: string; created_by: string; org_id: string }>(
      `SELECT pilot_id, created_by, org_id FROM bookings WHERE id = $1`,
      [made.json().id],
    );
    expect(rows[0]).toEqual({ pilot_id: 'PWI', created_by: 'PWI', org_id: ORG_A });
  });

  it('CUDZEJ nie tknie tą drogą - 403 `not_your_booking`, wiersz bez zmian', async () => {
    const { app, db } = await testHarness();
    const ako = await login(app, 'AKO');
    const foreign = await app.inject({
      method: 'POST',
      url: '/bookings',
      headers: bearer(ako),
      payload: { id: nextId(), aircraftId: 'SP-AXA', startsAt: iso(JUTRO + 8 * H), endsAt: iso(JUTRO + 10 * H), operation: 'skoki' },
    });
    expect(foreign.statusCode, foreign.body).toBe(201);
    const id = foreign.json().id as string;

    const session = await panelCookie(app, 'PWI');
    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/api/me/bookings/${id}`,
      headers: session,
      payload: { note: 'przejęte' },
    });
    expect(patch.statusCode).toBe(403);
    expect(patch.json().error).toBe('not_your_booking');

    const off = await app.inject({ method: 'DELETE', url: `/admin/api/me/bookings/${id}`, headers: session });
    expect(off.statusCode).toBe(403);
    expect(off.json().error).toBe('not_your_booking');

    const { rows } = await db.query<{ status: string; note: string | null }>(
      `SELECT status, note FROM bookings WHERE id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({ status: 'confirmed', note: null });
  });

  it('NAKŁADKA mówi, co stoi i od kiedy - cudzy wiersz wąsko, bez notatki', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const stoi = await app.inject({
      method: 'POST',
      url: '/bookings',
      headers: bearer(ako),
      payload: {
        id: nextId(),
        aircraftId: 'SP-AXA',
        startsAt: iso(JUTRO + 8 * H),
        endsAt: iso(JUTRO + 10 * H),
        operation: 'skoki',
        note: 'notatka AKO',
      },
    });
    expect(stoi.statusCode, stoi.body).toBe(201);

    const session = await panelCookie(app, 'PWI');
    const res = await createOwn(app, session, JUTRO + 9 * H, JUTRO + 11 * H);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error).toBe('slot_taken');
    expect(res.json().taken).toMatchObject({ pilotId: 'AKO', startsAt: iso(JUTRO + 8 * H) });
    expect(res.json().taken).not.toHaveProperty('note');
    expect(res.json().takenAt).toEqual(expect.any(String));
  });

  it('POWTÓRZONY zapis wraca tym samym wierszem ze statusem 200', async () => {
    const { app } = await testHarness();
    const session = await panelCookie(app, 'PWI');
    const id = nextId();
    const first = await createOwn(app, session, JUTRO + 8 * H, JUTRO + 10 * H, { id });
    const again = await createOwn(app, session, JUTRO + 8 * H, JUTRO + 10 * H, { id });
    expect(first.statusCode).toBe(201);
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().id).toBe(id);
  });

  it('ŚCIEŻKA AKCEPTACJI obowiązuje tak samo, a poprawka terminu z panelu czyści zgody', async () => {
    const { app, db } = await testHarness();
    await db.query(
      `INSERT INTO membership_capabilities (org_id, pilot_id, capability)
       VALUES ($1, 'KRZ', 'reservations.approve') ON CONFLICT DO NOTHING`,
      [ORG_A],
    );
    const admin = await panelCookie(app, 'AKO');
    const path = await app.inject({
      method: 'PUT',
      url: '/admin/api/approval-steps',
      headers: admin,
      payload: { steps: [{ label: 'Mechanik', memberIds: ['KRZ'] }] },
    });
    expect(path.statusCode, path.body).toBe(200);

    const session = await panelCookie(app, 'PWI');
    // Stopka szuflady nazywa kroki PRZED kliknięciem - same nazwy, bez obsady.
    const ahead = await app.inject({ url: '/admin/api/me/approval-path', headers: session });
    expect(ahead.statusCode, ahead.body).toBe(200);
    expect(ahead.json()).toEqual({ steps: ['Mechanik'] });
    // Osoba stojąca na kroku sama ten krok pomija - jej rezerwacja nie czeka na nic.
    const krzPanel = await panelCookie(app, 'KRZ');
    expect((await app.inject({ url: '/admin/api/me/approval-path', headers: krzPanel })).json()).toEqual({ steps: [] });

    const made = await createOwn(app, session, JUTRO + 8 * H, JUTRO + 10 * H);
    expect(made.json().status).toBe('pending');
    const id = made.json().id as string;

    const krz = await login(app, 'KRZ');
    const yes = await app.inject({
      method: 'POST',
      url: `/bookings/${id}/decision`,
      headers: bearer(krz),
      payload: { decision: 'approved' },
    });
    expect(yes.json().status).toBe('confirmed');

    const moved = await app.inject({
      method: 'PATCH',
      url: `/admin/api/me/bookings/${id}`,
      headers: session,
      payload: { startsAt: iso(JUTRO + 12 * H), endsAt: iso(JUTRO + 14 * H) },
    });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json().status).toBe('pending');
  });

  it('SUGESTIE z panelu to te same sugestie, co z telefonu', async () => {
    const { app } = await testHarness();
    const query = `aircraftId=SP-AXA&day=${iso(JUTRO + 12 * H)}&minutes=120`;
    const phone = await app.inject({
      url: `/bookings/suggestions?${query}`,
      headers: bearer(await login(app, 'PWI')),
    });
    const panel = await app.inject({
      url: `/admin/api/bookings/suggestions?${query}`,
      headers: await panelCookie(app, 'PWI'),
    });
    expect(phone.statusCode, phone.body).toBe(200);
    expect(panel.statusCode, panel.body).toBe(200);
    expect(panel.json()).toEqual(phone.json());
    // Pusty dzień: jedno wolne pasmo, całe okno doby lotnej - liczy je domena, nie panel.
    expect(panel.json().free).toEqual([{ startsAt: panel.json().window.from, endsAt: panel.json().window.to }]);
  });
});
