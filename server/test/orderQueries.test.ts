/**
 * Ninerdeck (serwer) - odczyty zleceń: licznik karty na Pulpicie, listy i karta per widz
 * (#245, `docs/zlecenia.md` §8, §13.1; makiety 20F, 28, 30, 32).
 *
 * Najważniejsza własność: adresat nie dostaje NIC o innych adresatach (pkt 18) - ani
 * listy, ani liczby, ani historii z nazwiskami. Prowadzący widzi komplet: odczyty,
 * odpowiedzi, kolizje terminów i „zmianę nieodczytaną".
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ORG_A } from './testWorld.ts';
import {
  author,
  coordinator,
  draft,
  ENDS,
  group,
  H,
  orderWorld,
  pilot,
  STARTS,
  type OrderWorld,
} from './orderWorld.ts';

let w: OrderWorld;
const step = (): void => w.clock.advance(60_000);

beforeEach(async () => {
  w = await orderWorld();
  await group(w.db, 'g-an2', 'Piloci An-2', ['PWI', 'KRZ', 'ANN']);
  await w.orders.create(ORG_A, author, draft({ audience: { kind: 'per_seat', pic: { pilotIds: [], groupIds: ['g-an2'] }, dual: null } }));
  step();
});

describe('licznik karty „Zlecenia" (20F)', () => {
  it('„czekają na Twoją odpowiedź" gaśnie z odpowiedzią; „szuka załogi" - z kompletem', async () => {
    expect(await w.queries.summary(ORG_A, pilot('PWI'))).toEqual({
      awaitingAnswer: 1,
      seekingCrew: 0,
      canCreate: false,
      canManage: false,
    });
    expect(await w.queries.summary(ORG_A, author)).toMatchObject({ awaitingAnswer: 0, seekingCrew: 1, canCreate: true });

    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    expect((await w.queries.summary(ORG_A, pilot('PWI'))).awaitingAnswer).toBe(0);
    await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' });
    expect((await w.queries.summary(ORG_A, author)).seekingCrew).toBe(0);
    // Fotel obsadzony przez kogoś innego - na odpowiedź KRZ nikt już nie czeka.
    expect((await w.queries.summary(ORG_A, pilot('KRZ'))).awaitingAnswer).toBe(0);
  });

  it('koordynator liczy zlecenia całego klubu, instruktor - własne', async () => {
    await w.orders.create(ORG_A, coordinator, draft({ id: 'o-2', aircraftId: 'SP-FGK' }));
    expect((await w.queries.summary(ORG_A, coordinator)).seekingCrew).toBe(2);
    expect((await w.queries.summary(ORG_A, author)).seekingCrew).toBe(1);
  });
});

describe('listy „Do mnie" i „Zlecone" (30)', () => {
  it('„Do mnie" niesie mój fotel i stan; „Zlecone" - postęp bez nazwisk adresatów', async () => {
    await w.responses.seen(ORG_A, pilot('PWI'), 'o-1');
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    await w.responses.seen(ORG_A, pilot('KRZ'), 'o-1');

    const inbox = await w.queries.list(ORG_A, pilot('KRZ'), 'inbox');
    expect(inbox?.items).toHaveLength(1);
    expect(inbox?.items[0]).toMatchObject({ progress: null, me: { seat: 'pic', seen: true, answer: null, inPlay: true } });
    expect(inbox?.items[0]?.day.date).toBe('2026-06-24');

    const managed = await w.queries.list(ORG_A, author, 'managed');
    expect(managed?.items[0]).toMatchObject({ me: null, progress: { recipients: 3, seen: 2, volunteers: 1, single: null } });
  });

  it('jedna osoba imiennie - „Ewa Sowa · Nieodczytane" zamiast „0 z 1 odczytało"', async () => {
    await w.orders.create(ORG_A, author, draft({ id: 'o-2', aircraftId: 'SP-FGK', audience: { kind: 'per_seat', pic: { pilotIds: ['EWA'], groupIds: [] }, dual: null } }));
    const managed = await w.queries.list(ORG_A, author, 'managed');
    const item = managed?.items.find((i) => i.loaded.order.id === 'o-2');
    expect(item?.progress?.single).toEqual({ pilotId: 'EWA', seen: false, answer: null, answeredAt: null });
  });

  it('„Zlecone" nie istnieje dla kogoś, kto nie zleca i nie prowadzi', async () => {
    expect(await w.queries.list(ORG_A, pilot('PWI'), 'managed')).toBeNull();
  });

  it('lista sięga po terminy z ostatnich dwóch tygodni - odwołane zostają, dawne wypadają', async () => {
    await w.orders.cancel(ORG_A, author, 'o-1', null);
    expect((await w.queries.list(ORG_A, author, 'managed'))?.items.map((i) => i.loaded.order.status)).toEqual(['cancelled']);
    w.clock.advance(20 * 24 * H);
    expect((await w.queries.list(ORG_A, author, 'managed'))?.items).toEqual([]);
  });
});

describe('karta zlecenia per widz (§13.1)', () => {
  it('adresat: zlecenie i jego stan, NIC o innych adresatach i bez nazwiska zmieniającego', async () => {
    await w.edits.edit(ORG_A, coordinator, 'o-1', { note: 'Kamizelki' });
    const card = await w.queries.card(ORG_A, pilot('KRZ'), 'o-1');
    expect(card).toMatchObject({ leads: false, recipients: null, history: null, me: { seat: 'pic' } });
    expect(card?.lastEdit).toMatchObject({ changes: { note: { from: null, to: 'Kamizelki' } } });
    expect(Object.keys(card?.lastEdit ?? {})).toEqual(['at', 'changes']);
  });

  it('prowadzący: adresaci z odczytem, kolizją terminu i „zmianą nieodczytaną"', async () => {
    // KRZ ma w tym czasie inną rezerwację (SP-FGK) - bursztyn przy wyborze (§4.3).
    await w.db.query(
      `INSERT INTO bookings (id, org_id, aircraft_id, kind, status, starts_at, ends_at, pilot_id, operation, created_by)
       VALUES ('bk-krz', $1, 'SP-FGK', 'flight', 'confirmed', $2, $3, 'KRZ', 'przelot', 'KRZ')`,
      [ORG_A, new Date(STARTS + H), new Date(ENDS + H)],
    );
    await w.responses.seen(ORG_A, pilot('PWI'), 'o-1');
    step();
    await w.edits.edit(ORG_A, author, 'o-1', { note: 'Kamizelki' });

    const card = await w.queries.card(ORG_A, author, 'o-1');
    expect(card?.leads).toBe(true);
    const byPilot = new Map(card!.recipients!.map((r) => [r.record.pilotId, r]));
    expect(byPilot.get('KRZ')?.conflict).toMatchObject({ bookingId: 'bk-krz', aircraftId: 'SP-FGK' });
    expect(byPilot.get('PWI')).toMatchObject({ seen: true, editUnseen: true, conflict: null });
    expect(card?.history?.map((h) => h.kind)).toEqual(['created', 'edited']);

    const krz = await w.queries.card(ORG_A, pilot('KRZ'), 'o-1');
    expect(krz?.myConflicts.map((b) => b.id)).toEqual(['bk-krz']);
  });

  it('osoba spoza zlecenia go nie widzi; koordynator widzi każde zlecenie klubu', async () => {
    expect(await w.queries.card(ORG_A, pilot('TOM'), 'o-1')).toBeNull();
    expect((await w.queries.card(ORG_A, coordinator, 'o-1'))?.leads).toBe(true);
  });
});
