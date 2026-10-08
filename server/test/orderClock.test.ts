/**
 * Ninerdeck (serwer) - zegar zleceń: czwarte pytanie zadania okresowego kalendarza
 * (#245, `docs/zlecenia.md` §5.5, pkt 15 i 45).
 *
 * Najważniejsze własności: ostrzeżenie „bez kompletu załogi" pada RAZ, o 18:00 czasu
 * klubu w przeddzień i wyłącznie do zlecającego; zlecenie bez kompletu wygasa W CAŁOŚCI
 * na początku terminu (slot wraca do puli), a zlecenie z kompletem jest zwykłą
 * rezerwacją - tę zwalnia zwykłe „nie odebrano" po godzinie.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ORG_A } from './testWorld.ts';
import {
  author,
  draft,
  ENDS,
  group,
  grant,
  H,
  historyKinds,
  inbox,
  kinds,
  orderWorld,
  pilot,
  STARTS,
  type OrderWorld,
} from './orderWorld.ts';

let w: OrderWorld;

/** Wtorek 23 czerwca, 18:00 czasu klubu (CEST) = 16:00 UTC - przeddzień terminu. */
const WARN_AT = Date.UTC(2026, 5, 23, 16, 0, 0);

const setNow = (instant: number): void => w.clock.advance(instant - w.clock.now().getTime());

beforeEach(async () => {
  w = await orderWorld();
  await group(w.db, 'g-an2', 'Piloci An-2', ['PWI', 'KRZ', 'ANN']);
});

async function status(orderId: string): Promise<{ order: string; booking: string }> {
  const { rows } = await w.db.query<{ order_status: string; booking_status: string }>(
    `SELECT fo.status AS order_status, b.status AS booking_status
       FROM flight_orders fo JOIN bookings b ON b.order_id = fo.id WHERE fo.id = $1`,
    [orderId],
  );
  return { order: rows[0]!.order_status, booking: rows[0]!.booking_status };
}

describe('ostrzeżenie „bez kompletu załogi" (pkt 45)', () => {
  beforeEach(async () => {
    await w.orders.create(ORG_A, author, draft({ audience: { kind: 'per_seat', pic: { pilotIds: [], groupIds: ['g-an2'] }, dual: null } }));
  });

  it('o 18:00 czasu klubu w przeddzień, RAZ i wyłącznie do zlecającego', async () => {
    setNow(WARN_AT - 60_000);
    expect((await w.clockJob.run()).ordersWarned).toBe(0);

    setNow(WARN_AT);
    expect((await w.clockJob.run()).ordersWarned).toBe(1);
    expect((await inbox(w.db, 'JSE')).at(-1)).toMatchObject({ kind: 'order_unfilled', payload: { openSeats: ['pic'] } });
    expect(await kinds(w.db, 'PWI')).toEqual(['order_offered']);

    setNow(WARN_AT + 5 * 60_000);
    expect((await w.clockJob.run()).ordersWarned).toBe(0);
  });

  it('zlecenie z kompletem nie dostaje ostrzeżenia', async () => {
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' });
    setNow(WARN_AT);
    expect((await w.clockJob.run()).ordersWarned).toBe(0);
  });

  it('komplet o 18:00 rozstrzyga RAZ - rezygnacja o 22:00 daje „Rezygnacja z lotu", bez drugiego ostrzeżenia', async () => {
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' });
    setNow(WARN_AT);
    await w.clockJob.run();

    setNow(WARN_AT + 4 * H);
    await w.responses.withdraw(ORG_A, pilot('PWI'), 'o-1', 'Choroba');
    w.clock.advance(5 * 60_000);
    expect((await w.clockJob.run()).ordersWarned).toBe(0);
    const authorKinds = await kinds(w.db, 'JSE');
    expect(authorKinds.at(-1)).toBe('order_withdrawn');
    expect(authorKinds).not.toContain('order_unfilled');
  });

  it('zlecenie wysłane po 18:00 przeddnia ostrzeżenia nie dostaje - powstało z wiedzą, ile zostało czasu', async () => {
    setNow(WARN_AT + 30 * 60_000);
    await w.orders.create(
      ORG_A,
      author,
      draft({ id: 'o-late', aircraftId: 'SP-FGK', audience: { kind: 'per_seat', pic: { pilotIds: ['KRZ'], groupIds: [] }, dual: null } }),
    );
    setNow(WARN_AT + H);
    // Ostrzeżenie o o-1 poszło w tym przebiegu (pierwszym po 18:00); o-late - nie.
    expect((await w.clockJob.run()).ordersWarned).toBe(1);
    const warnedFor = (await inbox(w.db, 'JSE')).filter((n) => n.kind === 'order_unfilled').map((n) => n.payload.orderId);
    expect(warnedFor).toEqual(['o-1']);
  });
});

describe('wygaśnięcie na początku terminu (pkt 15)', () => {
  beforeEach(async () => {
    await w.orders.create(ORG_A, author, draft({ audience: { kind: 'per_seat', pic: { pilotIds: [], groupIds: ['g-an2'] }, dual: null } }));
    w.clock.advance(60_000);
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    await w.responses.answer(ORG_A, pilot('KRZ'), 'o-1', { answer: 'no', reason: null });
  });

  it('bez kompletu wygasa W CAŁOŚCI: zlecenie `expired`, termin wraca do puli, adresaci bez odmowy wiedzą', async () => {
    setNow(STARTS - 60_000);
    expect((await w.clockJob.run()).ordersExpired).toBe(0);

    setNow(STARTS);
    w.live.clear();
    expect((await w.clockJob.run()).ordersExpired).toBe(1);
    expect(await status('o-1')).toEqual({ order: 'expired', booking: 'released' });
    const { rows } = await w.db.query<{ closed_by: string | null; close_reason: string | null }>(
      `SELECT closed_by, close_reason FROM flight_orders WHERE id = 'o-1'`,
    );
    expect(rows[0]).toEqual({ closed_by: null, close_reason: null });
    expect((await historyKinds(w.db, 'o-1')).at(-1)).toBe('expired');

    expect((await kinds(w.db, 'JSE')).at(-1)).toBe('order_expired');
    expect((await kinds(w.db, 'PWI')).at(-1)).toBe('order_expired');
    expect((await kinds(w.db, 'ANN')).at(-1)).toBe('order_expired');
    expect(await kinds(w.db, 'KRZ')).toEqual(['order_offered']);
    expect(w.live.peopleFor('order:o-1')).toContain('JSE');

    // Slot wrócił do puli - ten sam termin da się zająć od nowa.
    expect(await w.orders.create(ORG_A, author, draft({ id: 'o-2' }))).toMatchObject({ ok: true });
  });

  it('komplet załogi nie wygasa - to zwykła rezerwacja, zwalniana po godzinie bez przejęcia', async () => {
    await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' });
    setNow(STARTS);
    expect((await w.clockJob.run()).ordersExpired).toBe(0);
    expect(await status('o-1')).toEqual({ order: 'filled', booking: 'confirmed' });

    setNow(STARTS + H + 60_000);
    expect((await w.clockJob.run()).released).toBe(1);
    expect((await status('o-1')).booking).toBe('released');
  });

  it('termin, o którym przypomniano obserwującym, a potem stracił załogę - wygaśnięcie go odwołuje', async () => {
    await grant(w.db, 'TOM', 'fleet.watch');
    await w.db.query(`INSERT INTO aircraft_watches (org_id, aircraft_id, pilot_id, created_at) VALUES ($1, 'SP-AXA', 'TOM', now())`, [ORG_A]);
    await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' });

    setNow(STARTS - 50 * 60_000);
    expect((await w.clockJob.run()).reminded).toBe(1);
    expect(await kinds(w.db, 'TOM')).toEqual(['aircraft_flight_soon']);

    await w.responses.withdraw(ORG_A, pilot('PWI'), 'o-1', null);
    setNow(STARTS);
    expect((await w.clockJob.run()).ordersExpired).toBe(1);
    expect(await kinds(w.db, 'TOM')).toEqual(['aircraft_flight_soon', 'aircraft_flight_cancelled']);
  });

  it('termin przyszły nie wygasa, nawet gdy zegar pyta z zapasem', async () => {
    setNow(ENDS - 3 * H - 60_000);
    expect(await status('o-1')).toEqual({ order: 'open', booking: 'confirmed' });
    expect((await w.clockJob.run()).ordersExpired).toBe(0);
  });
});
