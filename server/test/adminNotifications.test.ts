/**
 * Ninerdeck (serwer) - SKRZYNKA PANELU (4.0.0, K7 `docs/kanal-klubu.md`; epik Z-E #246).
 *
 * `GET /admin/api/me/notifications` i `POST /admin/api/me/notifications/:id/read`:
 *  - skrzynka jest TA SAMA, co w telefonie - te same wiersze, ten sam kształt wiersza
 *    i to samo „przeczytane" (wiadomość otwarta w panelu gaśnie przy dzwonku telefonu);
 *  - ma ją każdy aktywny członek klubu, także bez żadnej zdolności (issue #216), a sesja
 *    platformowa nie ma jej wcale;
 *  - kursor jest parą (chwila, identyfikator), a kursor niepełny jest błędem żądania.
 * Izolację klubów pilnują sondy w `tenantIsolation.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';
import { bearer, login, panelSession, type Harness } from './routeClients.ts';
import { ORG_A } from './testWorld.ts';

/** Trzy wiadomości PWI w Alfie, od najstarszej; pierwsza mówi o terminie 23 czerwca. */
async function inbox(h: Harness): Promise<void> {
  const rows = [
    ['note-1', 'approval_requested', { bookingId: 'rez-1', aircraftId: 'SP-AXA', startsAt: '2026-06-23T08:00:00.000Z' }, '2026-06-22T06:00:00Z'],
    ['note-2', 'booking_approved', { bookingId: 'rez-2', aircraftId: 'SP-AXA' }, '2026-06-22T07:00:00Z'],
    ['note-3', 'booking_rejected', { bookingId: 'rez-3', aircraftId: 'SP-AXA', reason: 'Przegląd' }, '2026-06-22T07:30:00Z'],
  ] as const;
  for (const [id, kind, payload, createdAt] of rows) {
    await h.db.query(
      `INSERT INTO notifications (id, org_id, pilot_id, kind, payload, created_at)
       VALUES ($1, $2, 'PWI', $3, $4::jsonb, $5)`,
      [id, ORG_A, kind, JSON.stringify(payload), createdAt],
    );
  }
}

const panelInbox = async (h: Harness, session: Record<string, string>, query = '') =>
  h.app.inject({ url: `/admin/api/me/notifications${query}`, headers: session });

describe('skrzynka panelu', () => {
  it('ta sama skrzynka i ten sam kształt wiersza, co w telefonie - bez bitu dla telefonu', async () => {
    const h = await testHarness();
    await inbox(h);
    // PWI nie ma ŻADNEJ zdolności - dzwonek i tak stoi w jego ramie (issue #216).
    const panel = await panelInbox(h, await panelSession(h.app, 'PWI'));
    expect(panel.statusCode, panel.body).toBe(200);
    const phone = await h.app.inject({ url: '/me/notifications', headers: bearer(await login(h.app, 'PWI')) });

    const { approver, ...phoneShared } = phone.json() as Record<string, unknown>;
    expect(approver).toBe(false);
    expect(panel.json()).toEqual(phoneShared);
    expect(panel.json()).not.toHaveProperty('approver');

    const body = panel.json() as { unread: number; items: { id: string; day: { date: string } | null }[] };
    expect(body.unread).toBe(3);
    expect(body.items.map((i) => i.id)).toEqual(['note-3', 'note-2', 'note-1']);
    // Doba KLUBU terminu, o którym mówi wiadomość - ta sama, którą liczy telefon.
    expect(body.items[2]!.day?.date).toBe('2026-06-23');
    expect(body.items[0]!.day).toBeNull();
  });

  it('przeczytane w panelu jest przeczytane w telefonie - i odwrotnie', async () => {
    const h = await testHarness();
    await inbox(h);
    const session = await panelSession(h.app, 'PWI');
    const phone = bearer(await login(h.app, 'PWI'));

    const read = await h.app.inject({ method: 'POST', url: '/admin/api/me/notifications/note-2/read', headers: session });
    expect(read.statusCode, read.body).toBe(204);
    const onPhone = (await h.app.inject({ url: '/me/notifications', headers: phone })).json() as {
      unread: number;
      items: { id: string; readAt: string | null }[];
    };
    expect(onPhone.unread).toBe(2);
    expect(onPhone.items.find((i) => i.id === 'note-2')!.readAt).not.toBeNull();

    expect((await h.app.inject({ method: 'POST', url: '/me/notifications/note-3/read', headers: phone })).statusCode).toBe(204);
    expect((await panelInbox(h, session)).json().unread).toBe(1);
  });

  it('kursor: strona po stronie bez zgubionego wiersza; niepełny kursor to błąd żądania', async () => {
    const h = await testHarness();
    await inbox(h);
    const session = await panelSession(h.app, 'PWI');

    const first = (await panelInbox(h, session, '?limit=2')).json() as { items: { id: string; createdAt: string }[] };
    expect(first.items.map((i) => i.id)).toEqual(['note-3', 'note-2']);
    const last = first.items[1]!;
    const next = await panelInbox(
      h,
      session,
      `?limit=2&beforeAt=${encodeURIComponent(last.createdAt)}&beforeId=${last.id}`,
    );
    expect((next.json() as { items: { id: string }[] }).items.map((i) => i.id)).toEqual(['note-1']);

    expect((await panelInbox(h, session, `?beforeId=${last.id}`)).statusCode).toBe(400);
    expect((await panelInbox(h, session, '?limit=0')).statusCode).toBe(400);
  });

  it('cudza albo nieistniejąca wiadomość - 404 bez stempla; sesja platformowa skrzynki nie ma', async () => {
    const h = await testHarness();
    await inbox(h);
    const krz = await panelSession(h.app, 'KRZ');
    const res = await h.app.inject({ method: 'POST', url: '/admin/api/me/notifications/note-1/read', headers: krz });
    expect(res.statusCode).toBe(404);
    const { rows } = await h.db.query<{ read_at: string | null }>(`SELECT read_at FROM notifications WHERE id = 'note-1'`);
    expect(rows[0]!.read_at).toBeNull();
    expect(
      (await h.app.inject({ method: 'POST', url: '/admin/api/me/notifications/nie-ma/read', headers: krz })).statusCode,
    ).toBe(404);

    const root = await panelSession(h.app, 'ROOT');
    expect((await panelInbox(h, root)).statusCode).toBe(401);
  });
});
