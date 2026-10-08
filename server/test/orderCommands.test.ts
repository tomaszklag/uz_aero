/**
 * Ninerdeck (serwer) - zlecenie: utworzenie i odwołanie na prawdziwym Postgresie
 * (#245, `docs/zlecenia.md` §2, §4, §5, §5.6, §6.2, §12).
 *
 * Najważniejsze własności: zlecenie i rezerwacja wchodzą JEDNĄ transakcją (termin zajęty
 * od utworzenia, `slot_taken` z kolizją nie zostawia zlecenia-sieroty), rezerwacja jest od
 * razu `confirmed` bez ścieżki akceptacji, a zlecenie dostają WYŁĄCZNIE aktywni członkowie
 * klubu - bez zlecającego, nawet gdy jest w grupie.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ORG_A } from './testWorld.ts';
import {
  author,
  coordinator,
  draft,
  group,
  historyKinds,
  inbox,
  kinds,
  orderWorld,
  pilot,
  type OrderWorld,
} from './orderWorld.ts';

let w: OrderWorld;

beforeEach(async () => {
  w = await orderWorld();
});

describe('utworzenie zlecenia', () => {
  it('zlecenie i rezerwacja wchodzą razem: fotel „ja" siedzi, szukany pusty, zlecający poza adresatami', async () => {
    await group(w.db, 'g-an2', 'Piloci An-2', ['PWI', 'KRZ', 'JSE']);
    const result = await w.orders.create(
      ORG_A,
      author,
      draft({
        seats: { pic: 'self', dual: 'sought' },
        audience: { kind: 'per_seat', pic: null, dual: { pilotIds: [], groupIds: ['g-an2'] } },
      }),
    );
    if (!result.ok) throw new Error(`odmowa: ${result.refusal}`);
    expect(result.created).toBe(true);
    expect(result.loaded.order).toMatchObject({ status: 'open', revision: 1, createdBy: 'JSE', audienceLabel: 'drugi pilot: Piloci An-2' });
    // Bez ścieżki akceptacji (§5.4): termin potwierdzony od chwili utworzenia.
    expect(result.loaded.booking).toMatchObject({ status: 'confirmed', pilotId: 'JSE', dualId: null, orderId: 'o-1' });
    expect(result.loaded.recipients.map((r) => r.pilotId).sort()).toEqual(['KRZ', 'PWI']);

    expect(await kinds(w.db, 'PWI')).toEqual(['order_offered']);
    expect(await kinds(w.db, 'JSE')).toEqual([]);
    expect(await historyKinds(w.db, 'o-1')).toEqual(['created']);
    // Sygnał karty do autora i adresatów; kalendarz dostaje temat rezerwacji.
    expect(w.live.peopleFor('order:o-1')).toEqual(['JSE', 'KRZ', 'PWI']);
    expect(w.live.signals.some((s) => s.topics.includes(`booking:${result.loaded.booking.id}`))).toBe(true);
  });

  it('powtórzony zapis tym samym uuidem oddaje to samo zlecenie i nikogo nie budzi drugi raz', async () => {
    await w.orders.create(ORG_A, author, draft());
    const again = await w.orders.create(ORG_A, author, draft());
    expect(again).toMatchObject({ ok: true, created: false });
    expect(await kinds(w.db, 'PWI')).toEqual(['order_offered']);
  });

  it('cudzy uuid w tym samym klubie to zajęty termin bez wskazania czym - nie podgląd cudzego zlecenia', async () => {
    await w.orders.create(ORG_A, author, draft());
    const stolen = await w.orders.create(ORG_A, coordinator, draft({ startsAt: Date.UTC(2026, 5, 25, 10), endsAt: Date.UTC(2026, 5, 25, 12) }));
    expect(stolen).toEqual({ ok: false, refusal: 'slot_taken', taken: null });
  });

  it('termin zajęty: 409 z kolizją i BEZ zlecenia-sieroty (jedna transakcja)', async () => {
    const first = await w.orders.create(ORG_A, author, draft());
    if (!first.ok) throw new Error('pierwsze zlecenie nie weszło');
    const clash = await w.orders.create(ORG_A, author, draft({ id: 'o-2' }));
    expect(clash).toMatchObject({ ok: false, refusal: 'slot_taken', taken: { id: first.loaded.booking.id } });
    const { rows } = await w.db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM flight_orders WHERE id = 'o-2'`);
    expect(rows[0]!.n).toBe(0);
  });

  it('drugi fotel „brak" na maszynie z wymogiem załogi 2-os. - odmowa', async () => {
    const result = await w.orders.create(ORG_A, author, draft({ aircraftId: 'SP-ANK' }));
    expect(result).toEqual({ ok: false, refusal: 'dual_required' });
  });

  it('osoba wskazana imiennie spoza klubu, nieznana grupa, zlecenie bez szukanego fotela - odmowy', async () => {
    expect(
      await w.orders.create(ORG_A, author, draft({ audience: { kind: 'per_seat', pic: { pilotIds: ['BPI'], groupIds: [] }, dual: null } })),
    ).toEqual({ ok: false, refusal: 'not_member' });
    expect(
      await w.orders.create(ORG_A, author, draft({ audience: { kind: 'per_seat', pic: { pilotIds: [], groupIds: ['g-nope'] }, dual: null } })),
    ).toEqual({ ok: false, refusal: 'unknown_group' });
    expect(await w.orders.create(ORG_A, author, draft({ seats: { pic: 'self', dual: 'none' } }))).toEqual({
      ok: false,
      refusal: 'no_seat_sought',
    });
  });

  it('zlecać może wyłącznie osoba z „Zlecaniem lotów"; maszyna wyłączona ze służby - odmowa', async () => {
    expect(await w.orders.create(ORG_A, pilot('PWI'), draft())).toEqual({ ok: false, refusal: 'not_leader' });
    expect(await w.orders.create(ORG_A, author, draft({ aircraftId: 'SP-KWA' }))).toEqual({
      ok: false,
      refusal: 'aircraft_disabled',
    });
  });
});

describe('odwołanie zlecenia', () => {
  beforeEach(async () => {
    await group(w.db, 'g-an2', 'Piloci An-2', ['PWI', 'KRZ', 'ANN']);
    const result = await w.orders.create(
      ORG_A,
      author,
      draft({ audience: { kind: 'per_seat', pic: { pilotIds: [], groupIds: ['g-an2'] }, dual: null } }),
    );
    if (!result.ok) throw new Error(`odmowa: ${result.refusal}`);
    // Zegar idzie między krokami - skrzynka porządkuje wiadomości po chwili powstania.
    w.clock.advance(60_000);
    await w.responses.answer(ORG_A, pilot('KRZ'), 'o-1', { answer: 'no', reason: 'Nie mogę w środę' });
    w.clock.advance(60_000);
  });

  it('termin wraca do puli; odwołanie dostają adresaci bez odmowy - z powodem', async () => {
    const result = await w.orders.cancel(ORG_A, author, 'o-1', 'Pogoda');
    if (result == null || !result.ok) throw new Error('odwołanie nie przeszło');
    expect(result.loaded.order).toMatchObject({ status: 'cancelled', closedBy: 'JSE', closeReason: 'Pogoda' });
    expect(result.loaded.booking.status).toBe('cancelled');

    const [offered, cancelled] = await inbox(w.db, 'PWI');
    expect(offered!.kind).toBe('order_offered');
    expect(cancelled).toMatchObject({ kind: 'order_cancelled', payload: { reason: 'Pogoda', cancelledBy: 'JSE' } });
    // KRZ odmówił - odwołanie go nie dotyczy; zlecający nie budzi sam siebie.
    expect(await kinds(w.db, 'KRZ')).toEqual(['order_offered']);
    expect(await kinds(w.db, 'JSE')).toEqual(['order_answered']);
    expect(await historyKinds(w.db, 'o-1')).toEqual(['created', 'cancelled']);
  });

  it('odwołanie przez koordynatora dostaje też zlecający (§12)', async () => {
    await w.orders.cancel(ORG_A, coordinator, 'o-1', null);
    expect(await kinds(w.db, 'JSE')).toEqual(['order_answered', 'order_cancelled']);
  });

  it('adresat nie odwoła (403), osoba spoza zlecenia go nie widzi (404), drugie odwołanie - zamknięte', async () => {
    expect(await w.orders.cancel(ORG_A, pilot('PWI'), 'o-1', null)).toEqual({ ok: false, refusal: 'not_leader' });
    expect(await w.orders.cancel(ORG_A, pilot('TOM'), 'o-1', null)).toBeNull();
    await w.orders.cancel(ORG_A, author, 'o-1', null);
    expect(await w.orders.cancel(ORG_A, author, 'o-1', null)).toEqual({ ok: false, refusal: 'order_closed' });
  });

  it('autor bez „Zlecania lotów" przestaje prowadzić - zlecenie prowadzą dalej koordynatorzy', async () => {
    await w.db.query(`DELETE FROM membership_capabilities WHERE org_id = $1 AND pilot_id = 'JSE'`, [ORG_A]);
    expect(await w.orders.cancel(ORG_A, { ...author, creates: false }, 'o-1', null)).toBeNull();
    expect(await w.orders.cancel(ORG_A, coordinator, 'o-1', null)).toMatchObject({ ok: true });
  });
});
