/**
 * Ninerdeck (serwer) - ODWOŁANIE REZERWACJI ZAWIADAMIA OSOBY W FOTELACH
 * (`docs/rezerwacje.md` §12.9, decyzje właściciela 2026-10-06).
 *
 * Do tej zmiany panel pisał administratorowi „Pilot zobaczy powód w aplikacji", a powód
 * nie docierał nigdzie: żadna wiadomość go nie niosła, karta rezerwacji go nie dostawała,
 * a drugi pilot nie dowiadywał się o odwołaniu w ogóle. Pod obserwacją:
 *  1. **odwołanie przez klub** - dowódca i drugi pilot dostają wiadomość z powodem
 *     i budzik, a karta niesie im powód i osobę, która odwołała;
 *  2. **odwołanie własnej** - wiadomość dostaje wyłącznie drugi pilot; odwołujący
 *     o sobie nie słyszy, a rezerwacja bez drugiego pilota nie budzi nikogo;
 *  3. **powód i osoba zamykająca nie jadą do zwykłego członka klubu** - to zdanie
 *     człowieka do pilota, ta sama klasa treści, co powód odmowy (przegląd W7).
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

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

const JUTRO = Date.UTC(2026, 5, 23, 0, 0, 0);
const H = 3_600_000;
const iso = (t: number): string => new Date(t).toISOString();

let seq = 0;
const nextId = (): string => `odw-${(seq += 1)}`;

/** Rezerwacja PWI z telefonu - z drugim pilotem albo bez niego. */
async function book(app: App, token: string, dualId: string | null): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/bookings',
    headers: bearer(token),
    payload: {
      id: nextId(),
      aircraftId: 'SP-AXA',
      startsAt: iso(JUTRO + 8 * H),
      endsAt: iso(JUTRO + 10 * H),
      operation: 'inne',
      dualId,
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json().id as string;
}

interface InboxItem {
  kind: string;
  payload: Record<string, unknown>;
}

const cancellations = async (app: App, token: string): Promise<InboxItem[]> =>
  ((await app.inject({ method: 'GET', url: '/me/notifications', headers: bearer(token) })).json()
    .items as InboxItem[]).filter((n) => n.kind === 'booking_cancelled');

const card = async (app: App, token: string, id: string): Promise<Record<string, unknown>> => {
  const res = await app.inject({ method: 'GET', url: `/bookings/${id}`, headers: bearer(token) });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().booking as Record<string, unknown>;
};

describe('odwołanie przez klub (panel, `reservations.manage`)', () => {
  it('dowódca i drugi pilot dostają wiadomość z powodem i budzik; odwołujący - nic', async () => {
    const h = await testHarness();
    const pwi = await login(h.app, 'PWI');
    const jse = await login(h.app, 'JSE');
    const ako = await login(h.app, 'AKO');
    const id = await book(h.app, pwi, 'JSE');

    const device = await h.app.inject({
      method: 'POST',
      url: '/me/push-token',
      headers: bearer(jse),
      payload: { token: 'ExponentPushToken[JSE-telefon]' },
    });
    expect(device.statusCode, device.body).toBe(204);

    const off = await h.app.inject({
      method: 'POST',
      url: `/admin/api/bookings/${id}/cancel`,
      headers: await panelCookie(h.app, 'AKO'),
      payload: { reason: 'SP-AXA idzie w poniedziałek na przegląd 100 h' },
    });
    expect(off.statusCode, off.body).toBe(200);

    for (const token of [pwi, jse]) {
      const [msg, ...rest] = await cancellations(h.app, token);
      expect(rest).toEqual([]);
      expect(msg!.payload).toMatchObject({
        bookingId: id,
        aircraftId: 'SP-AXA',
        pilotId: 'PWI',
        reason: 'SP-AXA idzie w poniedziałek na przegląd 100 h',
        cancelledBy: 'AKO',
      });
    }
    expect(await cancellations(h.app, ako)).toEqual([]);

    const sent = h.push.to('ExponentPushToken[JSE-telefon]');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ title: 'Rezerwacja odwołana', body: 'Otwórz, żeby przeczytać powód.' });
    expect(sent[0]!.data).toEqual({ kind: 'booking_cancelled', orgId: ORG_A, bookingId: id, aircraftId: 'SP-AXA' });
  });

  it('karta odwołanej rezerwacji niesie osobom w fotelach powód i osobę, która odwołała', async () => {
    const h = await testHarness();
    const pwi = await login(h.app, 'PWI');
    const id = await book(h.app, pwi, 'JSE');
    await h.app.inject({
      method: 'POST',
      url: `/admin/api/bookings/${id}/cancel`,
      headers: await panelCookie(h.app, 'AKO'),
      payload: { reason: 'przegląd 100 h' },
    });

    for (const token of [pwi, await login(h.app, 'JSE')]) {
      expect(await card(h.app, token, id)).toMatchObject({
        status: 'cancelled',
        closeReason: 'przegląd 100 h',
        closedBy: 'AKO',
      });
    }
  });

  it('powód i osoba zamykająca nie jadą do zwykłego członka klubu', async () => {
    const h = await testHarness();
    const pwi = await login(h.app, 'PWI');
    const id = await book(h.app, pwi, 'JSE');
    await h.app.inject({
      method: 'POST',
      url: `/admin/api/bookings/${id}/cancel`,
      headers: await panelCookie(h.app, 'AKO'),
      payload: { reason: 'przegląd 100 h' },
    });

    const seen = await card(h.app, await login(h.app, 'KRZ'), id);
    expect(seen.status).toBe('cancelled');
    expect(seen).not.toHaveProperty('closeReason');
    expect(seen).not.toHaveProperty('closedBy');
  });
});

describe('odwołanie własnej (telefon i panel)', () => {
  it('z telefonu: wiadomość dostaje wyłącznie drugi pilot; bez powodu budzik mówi skutek', async () => {
    const h = await testHarness();
    const pwi = await login(h.app, 'PWI');
    const jse = await login(h.app, 'JSE');
    const id = await book(h.app, pwi, 'JSE');

    const device = await h.app.inject({
      method: 'POST',
      url: '/me/push-token',
      headers: bearer(jse),
      payload: { token: 'ExponentPushToken[JSE-telefon]' },
    });
    expect(device.statusCode, device.body).toBe(204);

    const off = await h.app.inject({ method: 'DELETE', url: `/bookings/${id}`, headers: bearer(pwi), payload: {} });
    expect(off.statusCode, off.body).toBe(200);

    expect(await cancellations(h.app, pwi)).toEqual([]);
    const [msg] = await cancellations(h.app, jse);
    expect(msg!.payload).toMatchObject({ bookingId: id, reason: null, cancelledBy: 'PWI' });
    expect(h.push.to('ExponentPushToken[JSE-telefon]')[0]).toMatchObject({ body: 'Termin wrócił do puli.' });
    expect(await card(h.app, jse, id)).toMatchObject({ closedBy: 'PWI', closeReason: null });
  });

  it('z panelu: ta sama wiadomość do drugiego pilota', async () => {
    const h = await testHarness();
    const pwiPanel = await panelCookie(h.app, 'PWI');
    const own = await h.app.inject({
      method: 'POST',
      url: '/admin/api/me/bookings',
      headers: pwiPanel,
      payload: {
        id: nextId(),
        aircraftId: 'SP-AXA',
        startsAt: iso(JUTRO + 8 * H),
        endsAt: iso(JUTRO + 10 * H),
        operation: 'inne',
        dualId: 'JSE',
      },
    });
    expect(own.statusCode, own.body).toBe(201);
    const off = await h.app.inject({
      method: 'DELETE',
      url: `/admin/api/me/bookings/${own.json().id}`,
      headers: pwiPanel,
    });
    expect(off.statusCode, off.body).toBe(200);

    const [msg] = await cancellations(h.app, await login(h.app, 'JSE'));
    expect(msg!.payload).toMatchObject({ bookingId: own.json().id, cancelledBy: 'PWI' });
  });

  it('drugi pilot stojący na kroku zgody dostaje JEDNĄ wiadomość - o odwołaniu, nie o wycofanej prośbie', async () => {
    const h = await testHarness();
    await h.db.query(
      `INSERT INTO membership_capabilities (org_id, pilot_id, capability)
       VALUES ($1, 'JSE', 'reservations.approve') ON CONFLICT DO NOTHING`,
      [ORG_A],
    );
    const path = await h.app.inject({
      method: 'PUT',
      url: '/admin/api/approval-steps',
      headers: await panelCookie(h.app, 'AKO'),
      payload: { steps: [{ label: 'Mechanik', memberIds: ['JSE'] }] },
    });
    expect(path.statusCode, path.body).toBe(200);

    const pwi = await login(h.app, 'PWI');
    const id = await book(h.app, pwi, 'JSE');
    expect((await card(h.app, pwi, id)).status).toBe('pending');

    const off = await h.app.inject({ method: 'DELETE', url: `/bookings/${id}`, headers: bearer(pwi), payload: {} });
    expect(off.statusCode, off.body).toBe(200);

    const jse = await login(h.app, 'JSE');
    const kinds = ((await h.app.inject({ method: 'GET', url: '/me/notifications', headers: bearer(jse) })).json()
      .items as InboxItem[]).map((n) => n.kind);
    expect(kinds.sort()).toEqual(['approval_requested', 'booking_cancelled']);
  });

  it('rezerwacja bez drugiego pilota nie budzi nikogo', async () => {
    const h = await testHarness();
    const pwi = await login(h.app, 'PWI');
    const id = await book(h.app, pwi, null);

    const off = await h.app.inject({ method: 'DELETE', url: `/bookings/${id}`, headers: bearer(pwi), payload: {} });
    expect(off.statusCode, off.body).toBe(200);

    for (const who of ['PWI', 'JSE', 'AKO', 'BNO', 'KRZ']) {
      expect(await cancellations(h.app, await login(h.app, who))).toEqual([]);
    }
    expect(await card(h.app, pwi, id)).toMatchObject({ closedBy: 'PWI' });
  });
});
