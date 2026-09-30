/**
 * Ninerdeck (serwer) - zmiana zlecenia na prawdziwym Postgresie (#245,
 * `docs/zlecenia.md` §5.1, §5.2, §5.3, §6.2, pkt 29 i 41).
 *
 * Najważniejsze własności: WYŁĄCZNIE termin zaczyna odpowiedzi od nowa (obsadzone fotele
 * zostają), dopisanie wysyła zlecenie tylko dopisanym, odebranie jest stemplem, a nowy
 * członek grupy wysłanej wczoraj czeka na „Wyślij ponownie".
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ORG_A } from './testWorld.ts';
import {
  author,
  coordinator,
  draft,
  group,
  H,
  historyKinds,
  inbox,
  kinds,
  orderWorld,
  pilot,
  STARTS,
  ENDS,
  type OrderWorld,
} from './orderWorld.ts';

let w: OrderWorld;
const step = (): void => w.clock.advance(60_000);

beforeEach(async () => {
  w = await orderWorld();
  await group(w.db, 'g-an2', 'Piloci An-2', ['PWI', 'KRZ', 'ANN']);
});

async function row(orderId: string): Promise<{ revision: number; status: string; edited: boolean; label: string }> {
  const { rows } = await w.db.query<{ revision: number; status: string; edited_at: unknown; audience_label: string }>(
    `SELECT revision, status, edited_at, audience_label FROM flight_orders WHERE id = $1`,
    [orderId],
  );
  return { revision: rows[0]!.revision, status: rows[0]!.status, edited: rows[0]!.edited_at != null, label: rows[0]!.audience_label };
}

async function recipient(pilotId: string): Promise<{ direct: boolean; removed: boolean; seat: string | null }> {
  const { rows } = await w.db.query<{ direct: boolean; removed_at: unknown; seat: string | null }>(
    `SELECT direct, removed_at, seat FROM order_recipients WHERE order_id = 'o-1' AND pilot_id = $1`,
    [pilotId],
  );
  return { direct: rows[0]!.direct, removed: rows[0]!.removed_at != null, seat: rows[0]!.seat };
}

describe('termin i „edytowane"', () => {
  beforeEach(async () => {
    await w.orders.create(ORG_A, author, draft({ audience: { kind: 'per_seat', pic: { pilotIds: [], groupIds: ['g-an2'] }, dual: null } }));
    step();
    await w.responses.answer(ORG_A, pilot('KRZ'), 'o-1', { answer: 'no', reason: 'Nie w środę' });
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    step();
  });

  it('zmiana TERMINU: nowa wersja, odpowiedzi od nowa - pytany jest też ten, kto odmówił', async () => {
    const moved = { startsAt: STARTS + 24 * H, endsAt: ENDS + 24 * H };
    const result = await w.edits.edit(ORG_A, coordinator, 'o-1', moved);
    if (result == null || !result.ok) throw new Error('zmiana nie przeszła');
    expect(await row('o-1')).toMatchObject({ revision: 2, edited: false });
    expect(result.loaded.booking).toMatchObject(moved);

    // „Nie mogę w środę" nie mówi nic o czwartku (§5.1).
    const changed = (await inbox(w.db, 'KRZ')).at(-1)!;
    expect(changed).toMatchObject({ kind: 'order_changed', payload: { term: true } });
    expect(await kinds(w.db, 'PWI')).toEqual(['order_offered', 'order_changed']);
    expect(await kinds(w.db, 'ANN')).toEqual(['order_offered', 'order_changed']);
    // Zmienił koordynator - zlecający dostaje wiadomość; sprawca nie budzi sam siebie.
    expect((await kinds(w.db, 'JSE')).at(-1)).toBe('order_changed');
    expect(await kinds(w.db, 'BNO')).toEqual([]);

    const card = await w.queries.card(ORG_A, pilot('KRZ'), 'o-1');
    expect(card?.me).toMatchObject({ answer: null, previousAnswer: 'no', seen: false });
    expect(card?.lastTermChange?.from).toEqual({ startsAt: new Date(STARTS).toISOString(), endsAt: new Date(ENDS).toISOString() });
  });

  it('zmiana opisu: „edytowane" bez nowej wersji; odmowa wycisza, zgłoszenia zostają ważne', async () => {
    const result = await w.edits.edit(ORG_A, author, 'o-1', { note: 'Zabierz kamizelki' });
    expect(result).toMatchObject({ ok: true });
    expect(await row('o-1')).toMatchObject({ revision: 1, edited: true });
    expect((await inbox(w.db, 'PWI')).at(-1)).toMatchObject({
      kind: 'order_changed',
      payload: { term: false, changes: { note: { from: null, to: 'Zabierz kamizelki' } } },
    });
    expect(await kinds(w.db, 'KRZ')).toEqual(['order_offered']);
    expect(await historyKinds(w.db, 'o-1')).toEqual(['created', 'edited']);
    // Zgłoszenie PWI przeżyło edycję - prowadzący wybiera go bez ponownego pytania.
    expect(await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' })).toMatchObject({ ok: true });
  });

  it('termin nachodzący na inną rezerwację - 409 z kolizją, zlecenie bez zmian', async () => {
    await w.orders.create(ORG_A, author, draft({ id: 'o-2', startsAt: STARTS + 24 * H, endsAt: ENDS + 24 * H }));
    const clash = await w.edits.edit(ORG_A, author, 'o-1', { startsAt: STARTS + 24 * H, endsAt: ENDS + 24 * H });
    expect(clash).toMatchObject({ ok: false, refusal: 'slot_taken', taken: { orderId: 'o-2' } });
    expect(await row('o-1')).toMatchObject({ revision: 1 });
  });

  it('adresat nie zmienia (403), osoba spoza zlecenia go nie widzi (404)', async () => {
    expect(await w.edits.edit(ORG_A, pilot('PWI'), 'o-1', { note: 'x' })).toEqual({ ok: false, refusal: 'not_leader' });
    expect(await w.edits.edit(ORG_A, pilot('TOM'), 'o-1', { note: 'x' })).toBeNull();
  });
});

describe('fotele i maszyna', () => {
  beforeEach(async () => {
    await w.orders.create(
      ORG_A,
      author,
      draft({
        seats: { pic: 'sought', dual: 'sought' },
        audience: { kind: 'per_seat', pic: { pilotIds: ['EWA'], groupIds: [] }, dual: { pilotIds: [], groupIds: ['g-an2'] } },
      }),
    );
    step();
    await w.responses.answer(ORG_A, pilot('EWA'), 'o-1', { answer: 'yes', reason: null });
    await w.responses.answer(ORG_A, pilot('KRZ'), 'o-1', { answer: 'yes', reason: null });
    step();
  });

  it('drugi fotel na „brak": jego adresaci są „nieaktualni", ale ZOSTAJĄ i wracają z fotelem (decyzja 2026-09-29)', async () => {
    const result = await w.edits.edit(ORG_A, author, 'o-1', { seats: { pic: 'sought', dual: 'none' }, reason: 'Lecimy w jedną osobę' });
    expect(result).toMatchObject({ ok: true });
    expect(await row('o-1')).toMatchObject({ status: 'filled', label: 'dowódca: Ewa Sowa' });
    expect(await recipient('KRZ')).toMatchObject({ removed: false, seat: 'dual' });
    expect((await inbox(w.db, 'KRZ')).at(-1)).toMatchObject({ kind: 'order_filled', payload: { reason: 'seat_dropped' } });
    expect((await inbox(w.db, 'ANN')).at(-1)).toMatchObject({ kind: 'order_filled', payload: { reason: 'seat_dropped' } });
    expect((await w.queries.card(ORG_A, pilot('KRZ'), 'o-1'))?.me).toMatchObject({ inPlay: false, staleReason: 'seat_dropped' });
    expect((await kinds(w.db, 'EWA')).at(-1)).toBe('order_changed');
    // EWA była jedyną wskazaną imiennie na dowódcę - jej „tak" obsadziło fotel od razu.
    expect(await historyKinds(w.db, 'o-1')).toEqual(['created', 'assigned', 'edited']);

    // Fotel wraca: adresaci znów w grze, bez ponownego dopisywania - a zgłoszenie KRZ się liczy.
    step();
    await w.edits.edit(ORG_A, author, 'o-1', { seats: { pic: 'sought', dual: 'sought' } });
    expect((await inbox(w.db, 'KRZ')).at(-1)).toMatchObject({ kind: 'order_changed', payload: { changes: { seats: {} } } });
    expect((await w.queries.card(ORG_A, pilot('ANN'), 'o-1'))?.me).toMatchObject({ inPlay: true, staleReason: null });
    expect(await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'KRZ', seat: 'dual' })).toMatchObject({ ok: true });
  });

  it('dopisanie do fotela, którego zlecenie nie szuka - odmowa zamiast cichego zapisu', async () => {
    await w.edits.edit(ORG_A, author, 'o-1', { seats: { pic: 'sought', dual: 'none' } });
    step();
    expect(
      await w.edits.edit(ORG_A, author, 'o-1', { addRecipients: [{ seat: 'dual', list: { pilotIds: ['TOM'], groupIds: [] } }] }),
    ).toEqual({ ok: false, refusal: 'seat_not_sought' });
  });

  it('fotel dowódcy na „ja": przydzielona dostaje „Przydział cofnięty", nie „odebrane"', async () => {
    await w.edits.edit(ORG_A, author, 'o-1', { seats: { pic: 'self', dual: 'sought' } });
    const { rows } = await w.db.query<{ pilot_id: string | null }>(`SELECT pilot_id FROM bookings WHERE order_id = 'o-1'`);
    expect(rows[0]!.pilot_id).toBe('JSE');
    expect((await inbox(w.db, 'EWA')).at(-1)).toMatchObject({ kind: 'order_unassigned', payload: { seat: 'pic' } });
    expect(await kinds(w.db, 'EWA')).not.toContain('order_removed');
  });

  it('zmiana maszyny na wymagającą załogi 2-os. przy drugim fotelu „brak" - odmowa; zwykła zmiana - „edytowane"', async () => {
    await w.edits.edit(ORG_A, author, 'o-1', { seats: { pic: 'sought', dual: 'none' } });
    step();
    expect(await w.edits.edit(ORG_A, author, 'o-1', { aircraftId: 'SP-ANK' })).toEqual({ ok: false, refusal: 'dual_required' });
    const result = await w.edits.edit(ORG_A, author, 'o-1', { aircraftId: 'SP-FGK' });
    if (result == null || !result.ok) throw new Error('zmiana maszyny nie przeszła');
    expect(result.loaded.booking.aircraftId).toBe('SP-FGK');
    expect((await inbox(w.db, 'EWA')).at(-1)).toMatchObject({
      kind: 'order_changed',
      payload: { changes: { aircraft: { from: 'SP-AXA', to: 'SP-FGK' } } },
    });
  });
});

describe('adresaci: dopisanie, zamiana osoby, „Wyślij ponownie"', () => {
  beforeEach(async () => {
    await w.orders.create(ORG_A, author, draft());
    step();
  });

  it('dopisanie trafia wyłącznie do dopisanych; fotel imienny staje się fotelem „kilku osób"', async () => {
    expect(await recipient('PWI')).toMatchObject({ direct: true });
    const result = await w.edits.edit(ORG_A, author, 'o-1', { addRecipients: [{ seat: 'pic', list: { pilotIds: ['TOM'], groupIds: [] } }] });
    expect(result).toMatchObject({ ok: true });
    expect(await kinds(w.db, 'TOM')).toEqual(['order_offered']);
    expect(await kinds(w.db, 'PWI')).toEqual(['order_offered']);
    expect(await recipient('PWI')).toMatchObject({ direct: false });
    expect(await historyKinds(w.db, 'o-1')).toEqual(['created', 'recipients_added']);
  });

  it('zamiana osoby: odebrany dostaje „nieaktualne", nowa osoba - zlecenie i moc obsadzania', async () => {
    const result = await w.edits.edit(ORG_A, author, 'o-1', {
      removeRecipients: ['PWI'],
      addRecipients: [{ seat: 'pic', list: { pilotIds: ['TOM'], groupIds: [] } }],
      reason: 'Jednak Tomek',
    });
    expect(result).toMatchObject({ ok: true });
    expect(await recipient('PWI')).toMatchObject({ removed: true });
    expect((await inbox(w.db, 'PWI')).at(-1)).toMatchObject({ kind: 'order_removed', payload: { reason: 'Jednak Tomek' } });
    expect(await recipient('TOM')).toMatchObject({ direct: true });
    expect(await row('o-1')).toMatchObject({ label: 'dowódca: Tomasz Mazur' });
    // Odebrany nie wraca przez ponowne wysłanie (pkt 29).
    await w.edits.edit(ORG_A, author, 'o-1', { resend: true });
    expect(await recipient('PWI')).toMatchObject({ removed: true });
  });

  it('jawne dopisanie odebranej osoby przywraca jej zlecenie jak nowe; grupa ani „Wyślij ponownie" - nie', async () => {
    await group(w.db, 'g-pic', 'Dowódcy', ['PWI', 'KRZ']);
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'no', reason: 'Urlop' });
    step();
    await w.edits.edit(ORG_A, author, 'o-1', {
      removeRecipients: ['PWI'],
      addRecipients: [{ seat: 'pic', list: { pilotIds: ['TOM'], groupIds: [] } }],
    });
    step();
    // Grupa z PWI na liście nie przywraca go - przychodzi tylko KRZ.
    await w.edits.edit(ORG_A, author, 'o-1', { addRecipients: [{ seat: 'pic', list: { pilotIds: [], groupIds: ['g-pic'] } }] });
    expect(await recipient('PWI')).toMatchObject({ removed: true });
    expect(await kinds(w.db, 'KRZ')).toEqual(['order_offered']);
    step();

    const result = await w.edits.edit(ORG_A, author, 'o-1', { addRecipients: [{ seat: 'pic', list: { pilotIds: ['PWI'], groupIds: [] } }] });
    expect(result).toMatchObject({ ok: true });
    expect(await recipient('PWI')).toMatchObject({ removed: false });
    expect(await kinds(w.db, 'PWI')).toEqual(['order_offered', 'order_removed', 'order_offered']);
    const card = await w.queries.card(ORG_A, pilot('PWI'), 'o-1');
    expect(card?.me).toMatchObject({ answer: null, inPlay: true, seen: false });
    expect(await row('o-1')).toMatchObject({ label: 'dowódca: Dowódcy, Piotr Wiśniewski, Tomasz Mazur' });
    // Rozmowa znów otwarta do pisania.
    expect(await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-1', body: 'Jednak mogę' })).toMatchObject({ ok: true });
  });

  it('osoby przydzielonej nie da się odebrać wprost; ostatniej osoby fotela też nie', async () => {
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    expect(await w.edits.edit(ORG_A, author, 'o-1', { removeRecipients: ['PWI'] })).toEqual({
      ok: false,
      refusal: 'recipient_assigned',
    });
    await w.assignments.unassign(ORG_A, author, 'o-1', { seat: 'pic', reason: null });
    expect(await w.edits.edit(ORG_A, author, 'o-1', { removeRecipients: ['PWI'] })).toEqual({
      ok: false,
      refusal: 'no_recipients',
    });
  });
});

describe('„Wyślij ponownie" (pkt 41)', () => {
  beforeEach(async () => {
    await w.orders.create(ORG_A, author, draft({ audience: { kind: 'per_seat', pic: { pilotIds: [], groupIds: ['g-an2'] }, dual: null } }));
    step();
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    await w.responses.answer(ORG_A, pilot('ANN'), 'o-1', { answer: 'no', reason: null });
    await w.db.query(`INSERT INTO member_group_members (org_id, group_id, pilot_id) VALUES ($1, 'g-an2', 'EWA')`, [ORG_A]);
    step();
  });

  it('bez ponownego wysłania nowy członek grupy nic nie dostaje - także przy dopisaniu kogoś innego', async () => {
    await w.edits.edit(ORG_A, author, 'o-1', { addRecipients: [{ seat: 'pic', list: { pilotIds: ['TOM'], groupIds: [] } }] });
    expect(await kinds(w.db, 'EWA')).toEqual([]);
  });

  it('nowi członkowie grup dostają zlecenie, niezdecydowani przypomnienie, zdecydowani nic', async () => {
    const result = await w.edits.edit(ORG_A, author, 'o-1', { resend: true });
    expect(result).toMatchObject({ ok: true });
    expect(await inbox(w.db, 'EWA')).toMatchObject([{ kind: 'order_offered', payload: { reminder: false } }]);
    expect((await inbox(w.db, 'KRZ')).at(-1)).toMatchObject({ kind: 'order_offered', payload: { reminder: true } });
    expect(await kinds(w.db, 'PWI')).toEqual(['order_offered']);
    expect(await kinds(w.db, 'ANN')).toEqual(['order_offered']);
    expect(await historyKinds(w.db, 'o-1')).toEqual(['created', 'resent']);
  });
});
