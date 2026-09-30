/**
 * Ninerdeck (serwer) - REZERWACJA ZLECENIA w istniejącym kodzie rezerwacji: lista kontrolna
 * §16 `docs/zlecenia.md` (4.0.0, issue #245).
 *
 * Rezerwacja zlecenia to zwykły wiersz `bookings` z PUSTYMI fotelami - jedyny nowy stan
 * rezerwacji - więc każde miejsce, które zakładało „lot ma pilota", dostaje tu scenariusz:
 * kształt w kalendarzu i w odmowie `slot_taken`, karta samolotu, odwołanie i poprawka
 * z karty rezerwacji, pełny kształt dla drugiego pilota, odwołanie z kalendarza panelu
 * i ścieżka akceptacji, która zlecenia nie dotyka. Zegar (pkt 4) ma test przy adapterze
 * (`orderRepos.test.ts`), sygnały kanału klubu (pkt 11) - przy komendach.
 */

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';
import { login, panel, panelSession, phone, type Harness, type Reply, type Send } from './routeClients.ts';

const H = 3_600_000;
/** Zegar świata: poniedziałek 22 czerwca 2026, 08:00 UTC; termin zleceń - środa 10:00-12:00. */
const NOW = Date.UTC(2026, 5, 22, 8, 0, 0);
const STARTS = Date.UTC(2026, 5, 24, 10, 0, 0);
const iso = (t: number): string => new Date(t).toISOString();
const WINDOW = `from=${iso(STARTS - H)}&to=${iso(STARTS + 24 * H)}`;

/** Zlecenie przelotu SP-AXA - domyślnie dowódca imiennie PWI, bez drugiego pilota. */
async function order(send: Send, id: string, over: Record<string, unknown> = {}): Promise<Reply> {
  const res = await send('POST', '/orders', {
    id,
    aircraftId: 'SP-AXA',
    startsAt: iso(STARTS),
    endsAt: iso(STARTS + 2 * H),
    operation: 'przelot',
    note: 'lot zlecony',
    seats: { pic: 'sought', dual: 'none' },
    audience: { kind: 'per_seat', pic: { pilotIds: ['PWI'], groupIds: [] }, dual: null },
    ...over,
  });
  expect(res.statusCode, `zlecenie ${id}: ${res.body}`).toBe(201);
  return res;
}

/** Wiersz rezerwacji z okna kalendarza - telefon albo panel, ta sama trasa względna. */
async function inCalendar(send: Send, bookingId: string): Promise<Record<string, unknown> | undefined> {
  const res = await send('GET', `/bookings?${WINDOW}`);
  expect(res.statusCode, res.body).toBe(200);
  return (res.json().bookings as Record<string, unknown>[]).find((b) => b.id === bookingId);
}

async function orderStatus(h: Harness, id: string): Promise<string> {
  const { rows } = await h.db.query<{ status: string }>(`SELECT status FROM flight_orders WHERE id = $1`, [id]);
  return rows[0]!.status;
}

async function kindsFor(h: Harness, pilotId: string): Promise<string[]> {
  const { rows } = await h.db.query<{ kind: string }>(
    `SELECT kind FROM notifications WHERE pilot_id = $1 ORDER BY created_at, kind`,
    [pilotId],
  );
  return rows.map((r) => r.kind);
}

describe('§16 pkt 2 - rezerwacja zlecenia w kalendarzu', () => {
  it('wąski kształt mówi, kogo brakuje; identyfikator zlecenia widzą wyłącznie prowadzący i adresaci', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    const bookingId = (await order(ako, 'o-1')).json().booking.id as string;

    // Członek spoza zlecenia: pusty fotel dowódcy i to, że szuka - bez treści i bez adresu.
    for (const [label, send] of [
      ['telefon', phone(h.app, await login(h.app, 'JSE'))],
      ['panel', panel(h.app, await panelSession(h.app, 'JSE'))],
    ] as const) {
      const row = await inCalendar(send, bookingId);
      expect(row, label).toMatchObject({ pilotId: null, order: { seeking: ['pic'] } });
      expect((row!.order as Record<string, unknown>).id, label).toBeUndefined();
      expect(row!.note, label).toBeUndefined();
    }
    // Adresat i prowadzący: to samo plus „Otwórz zlecenie" i „kto zleca" (K2c, 23F).
    const pwi = phone(h.app, await login(h.app, 'PWI'));
    expect(await inCalendar(pwi, bookingId)).toMatchObject({
      order: { id: 'o-1', createdBy: 'AKO', seeking: ['pic'] },
    });
    expect(await inCalendar(panel(h.app, await panelSession(h.app, 'AKO')), bookingId)).toMatchObject({
      order: { id: 'o-1', createdBy: 'AKO', seeking: ['pic'] },
    });

    // Po obsadzeniu fotel niesie nazwisko, a zlecenie nie szuka już nikogo.
    expect((await pwi('POST', '/orders/o-1/answer', { answer: 'yes' })).statusCode).toBe(200);
    expect(await inCalendar(phone(h.app, await login(h.app, 'JSE')), bookingId)).toMatchObject({
      pilotId: 'PWI',
      order: { seeking: [] },
    });
  });

  it('zwykła rezerwacja ma `order: null`', async () => {
    const h = await testHarness();
    const krz = phone(h.app, await login(h.app, 'KRZ'));
    const res = await krz('POST', '/bookings', {
      id: 'b-krz',
      aircraftId: 'SP-AXA',
      startsAt: iso(STARTS),
      endsAt: iso(STARTS + 2 * H),
      operation: 'skoki',
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().order).toBeNull();
    expect((await inCalendar(krz, 'b-krz'))!.order).toBeNull();
  });

  it('przestawienie fotela na „brak" zmienia znacznik kalendarza, choć wiersz rezerwacji stoi', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    const bookingId = (
      await order(ako, 'o-1', {
        seats: { pic: 'sought', dual: 'sought' },
        audience: {
          kind: 'per_seat',
          pic: { pilotIds: ['PWI'], groupIds: [] },
          dual: { pilotIds: ['KRZ'], groupIds: [] },
        },
      })
    ).json().booking.id as string;
    const jse = phone(h.app, await login(h.app, 'JSE'));
    const first = await jse('GET', `/bookings?${WINDOW}`);
    const etag = first.headers.etag as string;
    expect(first.json().bookings.find((b: { id: string }) => b.id === bookingId).order.seeking).toEqual(['pic', 'dual']);

    h.clock.advance(60_000);
    expect((await ako('PATCH', '/orders/o-1', { seats: { pic: 'sought', dual: 'none' } })).statusCode).toBe(200);
    const again = await jse('GET', `/bookings?${WINDOW}`, undefined, { 'if-none-match': etag });
    expect(again.statusCode).toBe(200);
    expect(again.json().bookings.find((b: { id: string }) => b.id === bookingId).order.seeking).toEqual(['pic']);
  });
});

describe('§16 pkt 3 - kolizja ze zleceniem', () => {
  it('`slot_taken` mówi, że termin trzyma zlecenie szukające dowódcy - bez jego treści', async () => {
    const h = await testHarness();
    await order(phone(h.app, await login(h.app, 'AKO')), 'o-1');
    const payload = { id: 'b-jse', aircraftId: 'SP-AXA', startsAt: iso(STARTS), endsAt: iso(STARTS + H), operation: 'skoki' };

    for (const [label, send, path] of [
      ['telefon', phone(h.app, await login(h.app, 'JSE')), '/bookings'],
      ['panel', panel(h.app, await panelSession(h.app, 'JSE')), '/me/bookings'],
    ] as const) {
      const res = await send('POST', path, payload);
      expect(res.statusCode, `${label}: ${res.body}`).toBe(409);
      expect(res.json().taken, label).toMatchObject({ pilotId: null, order: { seeking: ['pic'] } });
      expect(res.json().taken.order.id, label).toBeUndefined();
      expect(res.json().taken.note, label).toBeUndefined();
    }
  });
});

describe('§16 pkt 5 - karta samolotu', () => {
  it('zlecenie w trakcie terminu to stan „zarezerwowana" bez pilota; najbliższe terminy niosą `order`', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    // Termin zaczął się kwadrans temu - rezerwacja w toku jest normalna (reguła końca terminu).
    const now = await order(ako, 'o-now', { startsAt: iso(NOW - 15 * 60_000), endsAt: iso(NOW + 2 * H) });
    await order(ako, 'o-1');

    const card = await ako('GET', '/aircraft/SP-AXA/card');
    expect(card.statusCode, card.body).toBe(200);
    expect(card.json().now).toMatchObject({ kind: 'booked', pilotId: null, bookingId: now.json().booking.id });
    const upcoming = card.json().upcoming as { order: { id: string; seeking: string[] } | null }[];
    expect(upcoming.map((u) => u.order?.id)).toEqual(['o-now', 'o-1']);
    expect(upcoming[1]!.order!.seeking).toEqual(['pic']);
  });
});

describe('§16 pkt 6 - „ODWOŁAJ" na karcie rezerwacji zlecenia', () => {
  it('przydzielony: rezygnacja z fotela - termin zostaje zajęty, zlecający dostaje „Rezygnacja z lotu"', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    const bookingId = (await order(ako, 'o-1')).json().booking.id as string;
    const pwi = phone(h.app, await login(h.app, 'PWI'));
    expect((await pwi('POST', '/orders/o-1/answer', { answer: 'yes' })).statusCode).toBe(200);

    const res = await pwi('DELETE', `/bookings/${bookingId}`, { reason: 'choroba' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ status: 'confirmed', pilotId: null, order: { id: 'o-1', seeking: ['pic'] } });
    expect(await orderStatus(h, 'o-1')).toBe('open');
    expect(await kindsFor(h, 'AKO')).toContain('order_withdrawn');
  });

  it('przydzielony w panelu: ta sama rezygnacja przez `DELETE /admin/api/me/bookings/:id`', async () => {
    const h = await testHarness();
    const bookingId = (await order(phone(h.app, await login(h.app, 'AKO')), 'o-1')).json().booking.id as string;
    expect((await phone(h.app, await login(h.app, 'PWI'))('POST', '/orders/o-1/answer', { answer: 'yes' })).statusCode).toBe(200);

    const res = await panel(h.app, await panelSession(h.app, 'PWI'))('DELETE', `/me/bookings/${bookingId}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ status: 'confirmed', pilotId: null });
    expect(await orderStatus(h, 'o-1')).toBe('open');
  });

  it('zlecający w fotelu „ja": odwołanie CAŁEGO zlecenia (decyzja 2026-09-30), bez dziennika akcji', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    const created = await order(ako, 'o-1', {
      seats: { pic: 'self', dual: 'sought' },
      audience: { kind: 'per_seat', pic: null, dual: { pilotIds: ['PWI'], groupIds: [] } },
    });
    const bookingId = created.json().booking.id as string;
    expect(created.json().booking.pilotId).toBe('AKO');

    const res = await ako('DELETE', `/bookings/${bookingId}`, {});
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().status).toBe('cancelled');
    expect(await orderStatus(h, 'o-1')).toBe('cancelled');
    expect(await kindsFor(h, 'PWI')).toContain('order_cancelled');
    const { rows } = await h.db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM admin_audit WHERE action LIKE 'booking.%'`);
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('osoba spoza załogi: „to nie twoje", zlecenie nietknięte', async () => {
    const h = await testHarness();
    const bookingId = (await order(phone(h.app, await login(h.app, 'AKO')), 'o-1')).json().booking.id as string;
    const res = await phone(h.app, await login(h.app, 'JSE'))('DELETE', `/bookings/${bookingId}`, {});
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'not_your_booking' });
    expect(await orderStatus(h, 'o-1')).toBe('open');
  });
});

describe('§16 pkt 7 - poprawka rezerwacji zlecenia', () => {
  it('`booking_from_order` dla załogi i zlecającego, na obu powierzchniach; obcy dostaje „nie twoje"', async () => {
    const h = await testHarness();
    const ako = phone(h.app, await login(h.app, 'AKO'));
    const bookingId = (
      await order(ako, 'o-1', {
        seats: { pic: 'sought', dual: 'sought' },
        audience: {
          kind: 'per_seat',
          pic: { pilotIds: ['PWI'], groupIds: [] },
          dual: { pilotIds: ['KRZ'], groupIds: [] },
        },
      })
    ).json().booking.id as string;
    const pwi = phone(h.app, await login(h.app, 'PWI'));
    const krz = phone(h.app, await login(h.app, 'KRZ'));
    expect((await pwi('POST', '/orders/o-1/answer', { answer: 'yes' })).statusCode).toBe(200);
    expect((await krz('POST', '/orders/o-1/answer', { answer: 'yes' })).statusCode).toBe(200);

    const move = { startsAt: iso(STARTS + H) };
    for (const [label, send, path] of [
      ['dowódca', pwi, `/bookings/${bookingId}`],
      ['drugi pilot', krz, `/bookings/${bookingId}`],
      ['zlecający', ako, `/bookings/${bookingId}`],
      ['dowódca w panelu', panel(h.app, await panelSession(h.app, 'PWI')), `/me/bookings/${bookingId}`],
    ] as const) {
      const res = await send('PATCH', path, move);
      expect(res.statusCode, `${label}: ${res.body}`).toBe(409);
      expect(res.json(), label).toEqual({ error: 'booking_from_order' });
    }
    const stranger = await phone(h.app, await login(h.app, 'JSE'))('PATCH', `/bookings/${bookingId}`, move);
    expect(stranger.statusCode).toBe(403);
    expect(stranger.json()).toEqual({ error: 'not_your_booking' });
  });
});

describe('§16 pkt 8 - pełny kształt „własnej" rezerwacji liczy OBA fotele', () => {
  it('drugi pilot zwykłej rezerwacji widzi ją w komplecie - na telefonie i w panelu', async () => {
    const h = await testHarness();
    const krz = phone(h.app, await login(h.app, 'KRZ'));
    const res = await krz('POST', '/bookings', {
      id: 'b-krz',
      aircraftId: 'SP-AXA',
      startsAt: iso(STARTS),
      endsAt: iso(STARTS + 2 * H),
      operation: 'skoki',
      dualId: 'PWI',
      note: 'notatka KRZ',
    });
    expect(res.statusCode, res.body).toBe(201);

    for (const [label, send] of [
      ['telefon', phone(h.app, await login(h.app, 'PWI'))],
      ['panel', panel(h.app, await panelSession(h.app, 'PWI'))],
    ] as const) {
      expect((await inCalendar(send, 'b-krz'))!.note, label).toBe('notatka KRZ');
    }
    // Kontrola: osoba spoza załogi dalej widzi wąsko.
    expect((await inCalendar(phone(h.app, await login(h.app, 'JSE')), 'b-krz'))!.note).toBeUndefined();
  });
});

describe('§16 pkt 9 - odwołanie z kalendarza panelu', () => {
  it('„Cudze rezerwacje" odwołują ZLECENIE: powód opcjonalny, wiadomości adresatów, bez dziennika akcji', async () => {
    const h = await testHarness();
    const bookingId = (await order(phone(h.app, await login(h.app, 'AKO')), 'o-1')).json().booking.id as string;
    // BNO prowadzi cudze zlecenia (`reservations.manage`) - nie jest autorem.
    const bno = panel(h.app, await panelSession(h.app, 'BNO'));

    const res = await bno('POST', `/bookings/${bookingId}/cancel`, {});
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ status: 'cancelled', order: { id: 'o-1', seeking: [] } });
    expect(await orderStatus(h, 'o-1')).toBe('cancelled');
    expect(await kindsFor(h, 'PWI')).toContain('order_cancelled');
    const { rows } = await h.db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM admin_audit WHERE action LIKE 'booking.%'`);
    expect(Number(rows[0]!.n)).toBe(0);
  });
});

describe('§16 pkt 10 - ścieżka akceptacji zlecenia nie dotyka', () => {
  it('rezerwacja zlecenia jest potwierdzona od razu, nie trafia do kolejki, a zapis ścieżki jej nie rusza', async () => {
    const h = await testHarness();
    const bno = panel(h.app, await panelSession(h.app, 'BNO'));
    const path = (memberIds: string[][]) =>
      bno('PUT', '/approval-steps', {
        steps: memberIds.map((ids, i) => ({ label: `Krok ${i + 1}`, memberIds: ids })),
      });
    expect((await path([['BNO']])).statusCode).toBe(200);

    const created = await order(phone(h.app, await login(h.app, 'AKO')), 'o-1');
    const bookingId = created.json().booking.id as string;
    expect(created.json().booking.status).toBe('confirmed');

    const queue = await bno('GET', '/approvals/queue');
    expect(queue.statusCode, queue.body).toBe(200);
    expect((queue.json().items as { booking: { id: string } }[]).map((i) => i.booking.id)).not.toContain(bookingId);

    // Zapis ścieżki domyka i przekierowuje sprawy CZEKAJĄCE (#207) - zlecenia wśród nich nie ma.
    expect((await path([['BNO'], ['AKO']])).statusCode).toBe(200);
    const { rows } = await h.db.query<{ status: string }>(`SELECT status FROM bookings WHERE id = $1`, [bookingId]);
    expect(rows[0]!.status).toBe('confirmed');
    const approvals = await h.db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM booking_approvals WHERE booking_id = $1`,
      [bookingId],
    );
    expect(Number(approvals.rows[0]!.n)).toBe(0);
  });
});

