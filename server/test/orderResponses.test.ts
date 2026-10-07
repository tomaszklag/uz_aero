/**
 * Ninerdeck (serwer) - odpowiedzi adresatów, przydział, cofnięcie i rezygnacja na
 * prawdziwym Postgresie (#245, `docs/zlecenia.md` §4.3, §5.3, §8, §12, §20 Z3).
 *
 * Najważniejsza własność: innego pilota nie da się wpisać do fotela bez jego „tak"
 * (pkt 12) - fotel obsadza albo odpowiedź osoby wskazanej imiennie, albo prowadzący
 * spośród zgłoszonych. Drugi przydział na zajęty fotel przegrywa z pierwszym.
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
  await group(w.db, 'g-an2', 'Piloci An-2', ['PWI', 'KRZ', 'ANN']);
});

const step = (): void => w.clock.advance(60_000);

async function crewOf(orderId: string): Promise<{ pilotId: string | null; dualId: string | null; status: string }> {
  const { rows } = await w.db.query<{ pilot_id: string | null; dual_id: string | null; status: string }>(
    `SELECT b.pilot_id, b.dual_id, fo.status FROM bookings b JOIN flight_orders fo ON fo.id = b.order_id WHERE fo.id = $1`,
    [orderId],
  );
  return { pilotId: rows[0]!.pilot_id, dualId: rows[0]!.dual_id, status: rows[0]!.status };
}

describe('odpowiedź imienna', () => {
  beforeEach(async () => {
    await w.orders.create(ORG_A, author, draft());
    step();
  });

  it('„PRZYJMUJĘ" jedynej osoby wskazanej imiennie obsadza fotel - komplet, autor dostaje odpowiedź', async () => {
    const result = await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: 'ignorowany przy tak' });
    expect(result).toMatchObject({ ok: true, outcome: { kind: 'assigned', seat: 'pic' } });
    expect(await crewOf('o-1')).toEqual({ pilotId: 'PWI', dualId: null, status: 'filled' });
    const [answered] = await inbox(w.db, 'JSE');
    expect(answered).toMatchObject({ kind: 'order_answered', payload: { pilotId: 'PWI', answer: 'yes', assignedSeat: 'pic', reason: null } });
    // Fotel, o który pytano - podpis „… · dowódca" w skrzynce autora (25D).
    expect(answered!.payload.seat).toBe('pic');
    // Przyjmujący imiennie nie dostaje „Lot przydzielony" - odpowiedź przyszła na ekranie.
    expect(await kinds(w.db, 'PWI')).toEqual(['order_offered']);
    expect(await historyKinds(w.db, 'o-1')).toEqual(['created', 'assigned']);
  });

  it('powtórzone „tak" nie budzi autora drugi raz; „NIE MOGĘ" przydzielonego to odmowa', async () => {
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    step();
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    expect(await kinds(w.db, 'JSE')).toEqual(['order_answered']);
    expect(await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'no', reason: null })).toEqual({
      ok: false,
      refusal: 'already_assigned',
    });
  });

  it('osoba spoza zlecenia go nie widzi (404); prowadzący, który nie jest adresatem - 403', async () => {
    expect(await w.responses.answer(ORG_A, pilot('TOM'), 'o-1', { answer: 'yes', reason: null })).toBeNull();
    expect(await w.responses.answer(ORG_A, coordinator, 'o-1', { answer: 'yes', reason: null })).toEqual({
      ok: false,
      refusal: 'not_recipient',
    });
  });
});

describe('zgłoszenia z grupy i przydział przez prowadzącego', () => {
  beforeEach(async () => {
    await w.orders.create(ORG_A, author, draft({ audience: { kind: 'per_seat', pic: { pilotIds: [], groupIds: ['g-an2'] }, dual: null } }));
    step();
  });

  it('„MOGĘ LECIEĆ" jest zgłoszeniem; wybrany dostaje „Lot przydzielony", reszta „Zlecenie nieaktualne"', async () => {
    expect(await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null })).toMatchObject({
      ok: true,
      outcome: { kind: 'volunteered' },
    });
    await w.responses.answer(ORG_A, pilot('KRZ'), 'o-1', { answer: 'yes', reason: null });
    await w.responses.answer(ORG_A, pilot('ANN'), 'o-1', { answer: 'no', reason: 'Urlop' });
    expect((await crewOf('o-1')).pilotId).toBeNull();
    step();

    expect(await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' })).toMatchObject({ ok: true });
    expect(await crewOf('o-1')).toEqual({ pilotId: 'PWI', dualId: null, status: 'filled' });
    expect(await kinds(w.db, 'PWI')).toEqual(['order_offered', 'order_assigned']);
    expect(await kinds(w.db, 'KRZ')).toEqual(['order_offered', 'order_filled']);
    // Odmowa wycisza „nieaktualne" (§12: „bez odmowy").
    expect(await kinds(w.db, 'ANN')).toEqual(['order_offered']);
    expect(await historyKinds(w.db, 'o-1')).toEqual(['created', 'assigned']);
  });

  it('dwa przydziały pod rząd na ten sam fotel - drugi przegrywa z pierwszym (§20 Z3)', async () => {
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    await w.responses.answer(ORG_A, pilot('KRZ'), 'o-1', { answer: 'yes', reason: null });
    await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' });
    expect(await w.assignments.assign(ORG_A, coordinator, 'o-1', { pilotId: 'KRZ', seat: 'pic' })).toEqual({
      ok: false,
      refusal: 'seat_filled',
    });
    // Ta sama osoba w tym samym fotelu - brak zmiany, ta sama odpowiedź.
    expect(await w.assignments.assign(ORG_A, coordinator, 'o-1', { pilotId: 'PWI', seat: 'pic' })).toMatchObject({ ok: true });
    expect(await kinds(w.db, 'PWI')).toEqual(['order_offered', 'order_assigned']);
  });

  it('przydział kogoś, kto się nie zgłosił, i fotela, którego zlecenie nie szuka - odmowy', async () => {
    expect(await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' })).toEqual({
      ok: false,
      refusal: 'not_volunteered',
    });
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    expect(await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'dual' })).toEqual({
      ok: false,
      refusal: 'seat_not_sought',
    });
    // Adresat nie przydziela.
    expect(await w.assignments.assign(ORG_A, pilot('KRZ'), 'o-1', { pilotId: 'PWI', seat: 'pic' })).toEqual({
      ok: false,
      refusal: 'not_leader',
    });
  });

  it('„tak" na fotel już obsadzony - odpowiedź `seat_filled`, zapisana gotowość, autor bez wiadomości', async () => {
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' });
    step();
    const before = (await kinds(w.db, 'JSE')).length;
    expect(await w.responses.answer(ORG_A, pilot('ANN'), 'o-1', { answer: 'yes', reason: null })).toMatchObject({
      ok: true,
      outcome: { kind: 'seat_filled' },
    });
    expect((await kinds(w.db, 'JSE')).length).toBe(before);
  });
});

describe('cofnięcie przydziału i rezygnacja', () => {
  beforeEach(async () => {
    await w.orders.create(ORG_A, author, draft({ audience: { kind: 'per_seat', pic: { pilotIds: [], groupIds: ['g-an2'] }, dual: null } }));
    step();
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    await w.responses.answer(ORG_A, pilot('KRZ'), 'o-1', { answer: 'yes', reason: null });
    step();
    await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' });
    step();
  });

  it('rezygnacja zwalnia fotel, zapisuje „nie" i budzi autora; pozostali chętni dalej się liczą', async () => {
    const result = await w.responses.withdraw(ORG_A, pilot('PWI'), 'o-1', 'Choroba');
    expect(result).toMatchObject({ ok: true });
    expect(await crewOf('o-1')).toEqual({ pilotId: null, dualId: null, status: 'open' });
    expect((await inbox(w.db, 'JSE')).at(-1)).toMatchObject({
      kind: 'order_withdrawn',
      payload: { pilotId: 'PWI', seat: 'pic', reason: 'Choroba' },
    });
    // KRZ zgłosił się wcześniej - prowadzący wybiera go od razu (§5.3).
    expect(await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'KRZ', seat: 'pic' })).toMatchObject({ ok: true });
    // PWI zrezygnował - przestał być chętnym.
    await w.assignments.unassign(ORG_A, author, 'o-1', { seat: 'pic', reason: null });
    expect(await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' })).toEqual({
      ok: false,
      refusal: 'not_volunteered',
    });
  });

  it('cofnięcie przydziału budzi pilota z powodem; rezygnuje tylko przydzielony', async () => {
    expect(await w.assignments.unassign(ORG_A, coordinator, 'o-1', { seat: 'pic', reason: 'Zmiana planu' })).toMatchObject({ ok: true });
    expect((await inbox(w.db, 'PWI')).at(-1)).toMatchObject({
      kind: 'order_unassigned',
      payload: { seat: 'pic', reason: 'Zmiana planu' },
    });
    expect(await crewOf('o-1')).toEqual({ pilotId: null, dualId: null, status: 'open' });
    expect(await w.responses.withdraw(ORG_A, pilot('KRZ'), 'o-1', null)).toEqual({ ok: false, refusal: 'not_assigned' });
    expect(await historyKinds(w.db, 'o-1')).toEqual(['created', 'assigned', 'unassigned']);
  });
});

describe('termin do potwierdzenia (pkt 37)', () => {
  it('osoba wskazana imiennie na dowódcę i obecna w grupie drugiego fotela - jej „tak" niczego nie obsadza', async () => {
    await w.orders.create(
      ORG_A,
      author,
      draft({
        seats: { pic: 'sought', dual: 'sought' },
        audience: { kind: 'per_seat', pic: { pilotIds: ['PWI'], groupIds: [] }, dual: { pilotIds: [], groupIds: ['g-an2'] } },
      }),
    );
    expect(await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null })).toMatchObject({
      ok: true,
      outcome: { kind: 'volunteered' },
    });
    expect((await crewOf('o-1')).pilotId).toBeNull();
    // Prowadzący wybiera ją na KTÓRYKOLWIEK fotel - wybór na jeden zdejmuje ją z drugiego.
    expect(await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'dual' })).toMatchObject({ ok: true });
    expect(await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' })).toEqual({
      ok: false,
      refusal: 'same_person_both_seats',
    });
  });
});

describe('odczyt karty (§8)', () => {
  beforeEach(async () => {
    await w.orders.create(ORG_A, author, draft());
    w.live.clear();
  });

  it('pierwsze otwarcie w wersji budzi kartę prowadzącego; kolejne już nie', async () => {
    expect(await w.responses.seen(ORG_A, pilot('PWI'), 'o-1')).toEqual({ ok: true });
    expect(w.live.signals.filter((s) => s.topics.includes('order:o-1'))).toHaveLength(1);
    step();
    await w.responses.seen(ORG_A, pilot('PWI'), 'o-1');
    expect(w.live.signals.filter((s) => s.topics.includes('order:o-1'))).toHaveLength(1);
    const { rows } = await w.db.query<{ seen_revision: number }>(`SELECT seen_revision FROM order_recipients WHERE pilot_id = 'PWI'`);
    expect(rows[0]!.seen_revision).toBe(1);
  });

  it('prowadzący, który nie jest adresatem - 403; osoba spoza zlecenia - 404', async () => {
    expect(await w.responses.seen(ORG_A, author, 'o-1')).toEqual({ ok: false, refusal: 'not_recipient' });
    expect(await w.responses.seen(ORG_A, pilot('TOM'), 'o-1')).toBeNull();
  });
});
