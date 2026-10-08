/**
 * Ninerdeck (serwer) - adaptery zleceń na prawdziwym Postgresie (PGlite): grupy,
 * zlecenia, adresaci, historia zmian, wątki i rezerwacja zlecenia (#245, §10).
 *
 * Tu żyje SQL, którego nie sprawdzi domena: idempotencja po uuidzie klienta, wiersz
 * odebranego adresata, który nie wraca, pierwszy odczyt w WERSJI, strona rozmowy
 * kursorem parą i zegar, który nie przypomina o zleceniu bez załogi.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Database, Queryable } from '../src/application/common/ports.ts';
import { PgBookingsRepo } from '../src/infrastructure/pg/common/bookingsRepo.ts';
import { PgFlightOrdersRepo } from '../src/infrastructure/pg/common/flightOrdersRepo.ts';
import { PgMemberGroupsRepo } from '../src/infrastructure/pg/common/memberGroupsRepo.ts';
import { PgOrderChangesRepo } from '../src/infrastructure/pg/common/orderChangesRepo.ts';
import { PgOrderRecipientsRepo } from '../src/infrastructure/pg/common/orderRecipientsRepo.ts';
import { PgThreadMessagesRepo } from '../src/infrastructure/pg/common/threadMessagesRepo.ts';
import { PgThreadsRepo } from '../src/infrastructure/pg/common/threadsRepo.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import { newPglite } from './pglite.ts';
import { ORG_A, ORG_B, seedTestWorld } from './testWorld.ts';

const AT = new Date('2026-10-01T08:00:00Z');
const H = 3_600_000;

let db: Database;

beforeEach(async () => {
  const pglite = newPglite();
  db = {
    query: (text, params) => pglite.query(text, params as never) as never,
    transaction: (fn) => pglite.transaction((tx) => fn(tx as unknown as Queryable)) as never,
    exec: (sql: string) => pglite.exec(sql),
  } as Database;
  await migrate(db);
  await seedTestWorld(db);
});

const groups = new PgMemberGroupsRepo();
const orders = new PgFlightOrdersRepo();
const recipients = new PgOrderRecipientsRepo();
const changes = new PgOrderChangesRepo();
const threads = new PgThreadsRepo();
const messages = new PgThreadMessagesRepo();
const bookings = new PgBookingsRepo();

/** Zlecenie z rezerwacją: dowódca szukany, drugi fotel „brak", termin za dobę. */
async function order(id: string, startsAt = AT.getTime() + 24 * H, aircraftId = 'SP-AXA'): Promise<string> {
  await db.transaction(async (tx) => {
    await orders.insert(
      tx,
      ORG_A,
      {
        id,
        createdBy: 'AKO',
        seats: { pic: 'sought', dual: 'none' },
        addressing: 'per_seat',
        status: 'open',
        audience: { kind: 'per_seat', pic: { pilotIds: ['JSE'], groupIds: [] }, dual: null },
        audienceLabel: 'dowódca: Jan Serafin',
      },
      AT,
    );
    const write = await bookings.insert(tx, ORG_A, {
      id: `bk-${id}`,
      aircraftId,
      kind: 'flight',
      status: 'confirmed',
      startsAt,
      endsAt: startsAt + 2 * H,
      pilotId: null,
      dualId: null,
      operation: 'przelot',
      fromIcao: 'EPKP',
      toIcao: 'EPWA',
      plannedAirMin: null,
      plannedFuelL: null,
      blockReason: null,
      note: null,
      createdBy: 'AKO',
      orderId: id,
    });
    if (!write.ok) throw new Error('termin zajęty w teście');
  });
  return `bk-${id}`;
}

describe('grupy klubu', () => {
  it('zapis z listą osób, powtórzenie tym samym uuidem oddaje tę samą grupę', async () => {
    const first = await db.transaction((tx) =>
      groups.insert(tx, ORG_A, { id: 'g-1', name: 'Instruktorzy', memberIds: ['JSE', 'PWI'], createdBy: 'AKO' }, AT),
    );
    expect(first).toMatchObject({ ok: true, created: true, group: { name: 'Instruktorzy', memberIds: ['JSE', 'PWI'] } });
    const again = await db.transaction((tx) =>
      groups.insert(tx, ORG_A, { id: 'g-1', name: 'Instruktorzy', memberIds: [], createdBy: 'AKO' }, AT),
    );
    expect(again).toMatchObject({ ok: true, created: false, group: { memberIds: ['JSE', 'PWI'] } });
  });

  it('nazwa jedyna w klubie bez względu na wielkość liter - odmowa, nie wyjątek', async () => {
    await db.transaction((tx) => groups.insert(tx, ORG_A, { id: 'g-1', name: 'Piloci An-2', memberIds: [], createdBy: 'AKO' }, AT));
    const clash = await db.transaction((tx) =>
      groups.insert(tx, ORG_A, { id: 'g-2', name: 'piloci an-2', memberIds: [], createdBy: 'AKO' }, AT),
    );
    expect(clash).toEqual({ ok: false, reason: 'name_taken' });
    // Drugi klub ma własną przestrzeń nazw.
    const other = await db.transaction((tx) =>
      groups.insert(tx, ORG_B, { id: 'g-3', name: 'Piloci An-2', memberIds: [], createdBy: 'BAD' }, AT),
    );
    expect(other).toMatchObject({ ok: true });
  });

  it('zmiana listy zastępuje ją w całości; cudza grupa jest nieistniejąca', async () => {
    await db.transaction((tx) => groups.insert(tx, ORG_A, { id: 'g-1', name: 'G', memberIds: ['JSE'], createdBy: 'AKO' }, AT));
    const updated = await db.transaction((tx) => groups.update(tx, ORG_A, 'g-1', { memberIds: ['PWI', 'KRZ'] }, AT));
    expect(updated).toMatchObject({ ok: true, group: { memberIds: ['KRZ', 'PWI'] } });
    expect(await db.transaction((tx) => groups.update(tx, ORG_B, 'g-1', { name: 'X' }, AT))).toBeNull();
    expect(await groups.byId(db, ORG_B, 'g-1')).toBeNull();
    expect(await db.transaction((tx) => groups.remove(tx, ORG_A, 'g-1'))).toBe(true);
    expect(await groups.list(db, ORG_A)).toEqual([]);
  });
});

describe('zlecenia', () => {
  it('definicja adresowania wraca taka, jaką zapisano; powtórny zapis nie tworzy drugiego', async () => {
    await order('o-1');
    const saved = await orders.byId(db, ORG_A, 'o-1');
    expect(saved).toMatchObject({
      status: 'open',
      revision: 1,
      seats: { pic: 'sought', dual: 'none' },
      audience: { kind: 'per_seat', pic: { pilotIds: ['JSE'], groupIds: [] }, dual: null },
    });
    const again = await db.transaction((tx) =>
      orders.insert(
        tx,
        ORG_A,
        { ...saved!, audience: saved!.audience, status: 'open' },
        AT,
      ),
    );
    expect(again).toBe(false);
    expect(await orders.byId(db, ORG_B, 'o-1')).toBeNull();
  });

  it('wersję podnosi zmiana terminu, „edytowane" stempluje edycja; zamknięte nie przyjmuje zmian', async () => {
    await order('o-1');
    const bumped = await db.transaction((tx) => orders.update(tx, ORG_A, 'o-1', { bumpRevision: true }, AT));
    expect(bumped).toMatchObject({ revision: 2, editedAt: null });
    const edited = await db.transaction((tx) => orders.update(tx, ORG_A, 'o-1', { edited: true, status: 'filled' }, AT));
    expect(edited).toMatchObject({ revision: 2, editedAt: AT.getTime(), status: 'filled' });

    const closed = await db.transaction((tx) =>
      orders.close(tx, ORG_A, 'o-1', { status: 'cancelled', at: AT, by: 'AKO', reason: null }),
    );
    expect(closed).toMatchObject({ status: 'cancelled', closedBy: 'AKO' });
    expect(await db.transaction((tx) => orders.update(tx, ORG_A, 'o-1', { edited: true }, AT))).toBeNull();
    expect(
      await db.transaction((tx) => orders.close(tx, ORG_A, 'o-1', { status: 'expired', at: AT, by: null, reason: null })),
    ).toBeNull();
  });

  it('lista idzie po TERMINIE i sięga po terminy kończące się po `endsAfter` - żywe i zamknięte', async () => {
    await order('o-late', AT.getTime() + 48 * H);
    await order('o-soon', AT.getTime() + 24 * H, 'SP-FGK');
    await order('o-past', AT.getTime() - 48 * H, 'SP-FGK');
    await db.transaction((tx) =>
      recipients.insertMany(tx, ORG_A, 'o-late', [{ pilotId: 'JSE', seat: 'pic', namedSeat: null, direct: true, viaGroupId: null }]),
    );
    const since = { endsAfter: AT };
    expect((await orders.list(db, ORG_A, since)).map((o) => o.id)).toEqual(['o-soon', 'o-late']);
    expect((await orders.list(db, ORG_A, { ...since, recipientId: 'JSE' })).map((o) => o.id)).toEqual(['o-late']);

    // Odwołane zostaje na liście, dopóki termin nie minie - „Zakończone" na makiecie 30.
    await db.transaction((tx) => orders.close(tx, ORG_A, 'o-soon', { status: 'cancelled', at: AT, by: 'AKO', reason: null }));
    expect((await orders.list(db, ORG_A, since)).map((o) => o.id)).toEqual(['o-soon', 'o-late']);
    // Termin sprzed granicy wypada, także żywy - komplet załogi jest `filled` na zawsze.
    expect((await orders.list(db, ORG_A, { endsAfter: new Date(AT.getTime() - 72 * H) })).map((o) => o.id)).toEqual([
      'o-past',
      'o-soon',
      'o-late',
    ]);
    expect(await orders.list(db, ORG_B, since)).toEqual([]);
  });

  it('zegar widzi otwarte zlecenia przed terminem; ostrzeżenie rozstrzyga się raz', async () => {
    const booking = await order('o-1', AT.getTime() + 2 * H);
    const due = await orders.dueOpen(db, new Date(AT.getTime() + 3 * H));
    expect(due).toEqual([
      expect.objectContaining({ orderId: 'o-1', orgId: ORG_A, bookingId: booking, status: 'open', unfilledWarnedAt: null }),
    ]);
    expect(await orders.dueOpen(db, new Date(AT.getTime() + H))).toEqual([]);
    expect(await db.transaction((tx) => orders.markWarnDecided(tx, ORG_A, 'o-1', AT))).toBe(true);
    expect(await db.transaction((tx) => orders.markWarnDecided(tx, ORG_A, 'o-1', AT))).toBe(false);
  });

  it('rozstrzygnięcia czekają zlecenia otwarte I z kompletem - bez już rozstrzygniętych', async () => {
    await order('o-open', AT.getTime() + 2 * H);
    await order('o-full', AT.getTime() + 2 * H, 'SP-FGK');
    await order('o-done', AT.getTime() + 2 * H, 'SP-ANK');
    await db.transaction(async (tx) => {
      await orders.update(tx, ORG_A, 'o-full', { status: 'filled' }, AT);
      await orders.markWarnDecided(tx, ORG_A, 'o-done', AT);
    });
    const due = await orders.dueWarnDecisions(db, new Date(AT.getTime() + 3 * H));
    expect(due.map((d) => [d.orderId, d.status]).sort()).toEqual([
      ['o-full', 'filled'],
      ['o-open', 'open'],
    ]);
    // Zlecenie z kompletem da się rozstrzygnąć (bez wiadomości), zamknięte - nie.
    expect(await db.transaction((tx) => orders.markWarnDecided(tx, ORG_A, 'o-full', AT))).toBe(true);
    await db.transaction((tx) => orders.close(tx, ORG_A, 'o-open', { status: 'cancelled', at: AT, by: 'AKO', reason: null }));
    expect(await db.transaction((tx) => orders.markWarnDecided(tx, ORG_A, 'o-open', AT))).toBe(false);
  });
});

describe('adresaci', () => {
  it('dopisanie pomija istniejących - także ODEBRANYCH, którzy nie wracają', async () => {
    await order('o-1');
    const first = await db.transaction((tx) =>
      recipients.insertMany(tx, ORG_A, 'o-1', [
        { pilotId: 'JSE', seat: 'pic', namedSeat: null, direct: false, viaGroupId: 'g-1' },
        { pilotId: 'PWI', seat: 'pic', namedSeat: null, direct: false, viaGroupId: 'g-1' },
      ]),
    );
    expect(first).toEqual(['JSE', 'PWI']);
    await db.transaction((tx) => recipients.remove(tx, ORG_A, 'o-1', 'PWI', 'AKO', AT));
    const again = await db.transaction((tx) =>
      recipients.insertMany(tx, ORG_A, 'o-1', [
        { pilotId: 'PWI', seat: 'pic', namedSeat: null, direct: false, viaGroupId: 'g-1' },
        { pilotId: 'KRZ', seat: 'pic', namedSeat: null, direct: false, viaGroupId: 'g-1' },
      ]),
    );
    expect(again).toEqual(['KRZ']);
    const list = await recipients.listFor(db, ORG_A, 'o-1');
    expect(list.find((r) => r.pilotId === 'PWI')).toMatchObject({ removedBy: 'AKO' });
  });

  it('plan uaktualnia wyłącznie żywych adresatów', async () => {
    await order('o-1');
    await db.transaction((tx) =>
      recipients.insertMany(tx, ORG_A, 'o-1', [
        { pilotId: 'JSE', seat: 'pic', namedSeat: null, direct: true, viaGroupId: null },
        { pilotId: 'PWI', seat: 'pic', namedSeat: null, direct: false, viaGroupId: null },
      ]),
    );
    await db.transaction((tx) => recipients.remove(tx, ORG_A, 'o-1', 'PWI', 'AKO', AT));
    await db.transaction((tx) =>
      recipients.updatePlan(tx, ORG_A, 'o-1', [
        { pilotId: 'JSE', seat: 'pic', namedSeat: null, direct: false, viaGroupId: null },
        { pilotId: 'PWI', seat: null, namedSeat: 'pic', direct: false, viaGroupId: null },
      ]),
    );
    const list = await recipients.listFor(db, ORG_A, 'o-1');
    expect(list.find((r) => r.pilotId === 'JSE')).toMatchObject({ direct: false });
    expect(list.find((r) => r.pilotId === 'PWI')).toMatchObject({ seat: 'pic', namedSeat: null });
  });

  it('pierwsze otwarcie w WERSJI zostaje, ostatnie idzie za każdym otwarciem', async () => {
    await order('o-1');
    await db.transaction((tx) =>
      recipients.insertMany(tx, ORG_A, 'o-1', [{ pilotId: 'JSE', seat: 'pic', namedSeat: null, direct: true, viaGroupId: null }]),
    );
    const later = new Date(AT.getTime() + H);
    await recipients.seen(db, ORG_A, 'o-1', 'JSE', 1, AT);
    await recipients.seen(db, ORG_A, 'o-1', 'JSE', 1, later);
    let row = (await recipients.listFor(db, ORG_A, 'o-1'))[0]!;
    expect(row).toMatchObject({ seenAt: AT.getTime(), seenRevision: 1, lastSeenAt: later.getTime() });
    // Nowa wersja (zmiana terminu) - odczyt liczy się od nowa.
    const next = new Date(AT.getTime() + 2 * H);
    await recipients.seen(db, ORG_A, 'o-1', 'JSE', 2, next);
    row = (await recipients.listFor(db, ORG_A, 'o-1'))[0]!;
    expect(row).toMatchObject({ seenAt: next.getTime(), seenRevision: 2 });
    expect(await recipients.seen(db, ORG_A, 'o-1', 'KRZ', 2, next)).toBe(false);
  });

  it('odpowiedź należy do wersji i nadpisuje poprzednią; odebrany nie odpowiada', async () => {
    await order('o-1');
    await db.transaction((tx) =>
      recipients.insertMany(tx, ORG_A, 'o-1', [
        { pilotId: 'JSE', seat: 'pic', namedSeat: null, direct: false, viaGroupId: null },
        { pilotId: 'PWI', seat: 'pic', namedSeat: null, direct: false, viaGroupId: null },
      ]),
    );
    await db.transaction((tx) => recipients.answer(tx, ORG_A, 'o-1', 'JSE', { answer: 'yes', reason: null, revision: 1 }, AT));
    await db.transaction((tx) =>
      recipients.answer(tx, ORG_A, 'o-1', 'JSE', { answer: 'no', reason: 'dyżur', revision: 1 }, AT),
    );
    await db.transaction((tx) => recipients.remove(tx, ORG_A, 'o-1', 'PWI', 'AKO', AT));
    expect(
      await db.transaction((tx) => recipients.answer(tx, ORG_A, 'o-1', 'PWI', { answer: 'yes', reason: null, revision: 1 }, AT)),
    ).toBe(false);
    const jse = (await recipients.listFor(db, ORG_A, 'o-1')).find((r) => r.pilotId === 'JSE');
    expect(jse).toMatchObject({ answer: 'no', answerReason: 'dyżur', answeredRevision: 1 });
  });
});

describe('przywrócenie odebranego adresata (decyzja 2026-09-29)', () => {
  it('wraca jak nowy: bez odpowiedzi i odczytu, z nowym planem; żywego wiersza nie rusza', async () => {
    await order('o-1');
    await db.transaction((tx) =>
      recipients.insertMany(tx, ORG_A, 'o-1', [
        { pilotId: 'JSE', seat: 'pic', namedSeat: null, direct: true, viaGroupId: null },
        { pilotId: 'PWI', seat: 'pic', namedSeat: null, direct: false, viaGroupId: null },
      ]),
    );
    await db.transaction(async (tx) => {
      await recipients.answer(tx, ORG_A, 'o-1', 'JSE', { answer: 'no', reason: 'Urlop', revision: 1 }, AT);
      await recipients.seen(tx, ORG_A, 'o-1', 'JSE', 1, AT);
      await recipients.remove(tx, ORG_A, 'o-1', 'JSE', 'AKO', AT);
    });

    const restored = await db.transaction((tx) =>
      recipients.restore(tx, ORG_A, 'o-1', [
        { pilotId: 'JSE', seat: 'pic', namedSeat: null, direct: false, viaGroupId: null },
        { pilotId: 'PWI', seat: 'pic', namedSeat: null, direct: true, viaGroupId: null },
      ]),
    );
    expect(restored).toEqual(['JSE']);
    const rows = await recipients.listFor(db, ORG_A, 'o-1');
    expect(rows.find((r) => r.pilotId === 'JSE')).toMatchObject({
      removedAt: null,
      answer: null,
      answerReason: null,
      seenRevision: null,
      direct: false,
    });
    // Żywego wiersza przywrócenie nie dotyka - to nie jest droga zmiany planu.
    expect(rows.find((r) => r.pilotId === 'PWI')).toMatchObject({ direct: false });
    expect(await db.transaction((tx) => recipients.restore(tx, ORG_B, 'o-1', [
      { pilotId: 'JSE', seat: 'pic', namedSeat: null, direct: false, viaGroupId: null },
    ]))).toEqual([]);
  });
});

describe('historia zmian', () => {
  it('najstarsze pierwsze, zegar bez sprawcy', async () => {
    await order('o-1');
    await db.transaction((tx) =>
      changes.insert(tx, ORG_A, 'o-1', [{ id: 'c-1', actorId: 'AKO', kind: 'created', payload: { seats: 'pic' } }], AT),
    );
    await db.transaction((tx) =>
      changes.insert(tx, ORG_A, 'o-1', [{ id: 'c-2', actorId: null, kind: 'expired', payload: {} }], new Date(AT.getTime() + H)),
    );
    const list = await changes.listFor(db, ORG_A, 'o-1');
    expect(list.map((c) => [c.kind, c.actorId])).toEqual([
      ['created', 'AKO'],
      ['expired', null],
    ]);
    expect(list[0]!.payload).toEqual({ seats: 'pic' });
    expect(await changes.listFor(db, ORG_B, 'o-1')).toEqual([]);
  });
});

describe('wątki i wiadomości', () => {
  async function thread(): Promise<void> {
    await order('o-1');
    await db.transaction((tx) =>
      threads.create(tx, ORG_A, { id: 't-1', subjectKind: 'order', subjectId: 'o-1', participantIds: ['AKO', 'JSE'] }, AT),
    );
  }

  it('piszą uczestnicy; odczyt stempluje wyłącznie uczestnik', async () => {
    await thread();
    expect((await threads.byId(db, ORG_A, 't-1'))?.participants.map((p) => p.pilotId)).toEqual(['AKO', 'JSE']);
    expect(await threads.markRead(db, ORG_A, 't-1', 'JSE', AT)).toBe(true);
    // Koordynator czyta, ale uczestnikiem nie jest - odczyt niczego nie stempluje.
    expect(await threads.markRead(db, ORG_A, 't-1', 'BNO', AT)).toBe(false);
    expect(await threads.byId(db, ORG_B, 't-1')).toBeNull();
  });

  it('powtórzony POST to ta sama wiadomość; strona idzie kursorem PARĄ', async () => {
    await thread();
    const send = (id: string, author: string, body: string, at: Date) =>
      db.transaction((tx) => messages.insert(tx, ORG_A, { id, threadId: 't-1', authorId: author, body }, at));
    // Trzy wiadomości w tej samej chwili - sam stempel nie porządkuje ich jednoznacznie.
    expect(await send('m-a', 'AKO', 'Pierwsza', AT)).toMatchObject({ created: true });
    expect(await send('m-a', 'AKO', 'Pierwsza', AT)).toMatchObject({ created: false });
    await send('m-b', 'JSE', 'Druga', AT);
    await send('m-c', 'JSE', 'Trzecia', AT);

    const first = await messages.page(db, ORG_A, 't-1', { limit: 2 });
    expect(first.map((m) => m.id)).toEqual(['m-c', 'm-b']);
    const last = first[first.length - 1]!;
    const second = await messages.page(db, ORG_A, 't-1', { limit: 2, before: { createdAt: last.createdAt, id: last.id } });
    expect(second.map((m) => m.id)).toEqual(['m-a']);
  });

  it('nieprzeczytane liczą się z CUDZYCH wiadomości po ostatnim odczycie', async () => {
    await thread();
    await db.transaction((tx) => messages.insert(tx, ORG_A, { id: 'm-1', threadId: 't-1', authorId: 'JSE', body: 'a' }, AT));
    await db.transaction((tx) => messages.insert(tx, ORG_A, { id: 'm-2', threadId: 't-1', authorId: 'AKO', body: 'b' }, AT));
    expect(await messages.unreadFor(db, ORG_A, 't-1', 'AKO')).toBe(1);
    await threads.markRead(db, ORG_A, 't-1', 'AKO', new Date(AT.getTime() + H));
    expect(await messages.unreadFor(db, ORG_A, 't-1', 'AKO')).toBe(0);
  });

  it('godzina najnowszej nieprzeczytanej - z tego samego zbioru, co licznik', async () => {
    await thread();
    const later = new Date(AT.getTime() + 10 * 60_000);
    await db.transaction((tx) => messages.insert(tx, ORG_A, { id: 'm-1', threadId: 't-1', authorId: 'JSE', body: 'a' }, AT));
    await db.transaction((tx) => messages.insert(tx, ORG_A, { id: 'm-2', threadId: 't-1', authorId: 'JSE', body: 'b' }, later));
    // Własna wiadomość - nawet późniejsza - nie jest „nową wiadomością" dla autora.
    await db.transaction((tx) =>
      messages.insert(tx, ORG_A, { id: 'm-3', threadId: 't-1', authorId: 'AKO', body: 'c' }, new Date(later.getTime() + H)),
    );
    expect(await messages.lastUnreadAt(db, ORG_A, 't-1', 'AKO')).toBe(later.getTime());
    await threads.markRead(db, ORG_A, 't-1', 'AKO', new Date(later.getTime() + 2 * H));
    expect(await messages.lastUnreadAt(db, ORG_A, 't-1', 'AKO')).toBeNull();
    // Inny klub nie widzi cudzej rozmowy.
    expect(await messages.lastUnreadAt(db, ORG_B, 't-1', 'JSE')).toBeNull();
  });

  it('uuid zajęty w innym klubie - odmowa zamiast potwierdzenia cudzej treści', async () => {
    await thread();
    await db.transaction((tx) => messages.insert(tx, ORG_A, { id: 'm-x', threadId: 't-1', authorId: 'AKO', body: 'tajne' }, AT));
    await db.query(
      `INSERT INTO threads (id, org_id, subject_kind, subject_id) VALUES ('t-b', 'org-b', 'order', 'o-b')`,
    );
    const stolen = await db.transaction((tx) =>
      messages.insert(tx, ORG_B, { id: 'm-x', threadId: 't-b', authorId: 'BAD', body: 'x' }, AT),
    );
    expect(stolen).toBeNull();
  });
});

describe('rezerwacja zlecenia', () => {
  it('załogę zmienia wyłącznie rezerwacja zlecenia', async () => {
    const booking = await order('o-1');
    const crewed = await db.transaction((tx) => bookings.setCrew(tx, ORG_A, booking, { pic: 'JSE', dual: null }, AT));
    expect(crewed).toMatchObject({ pilotId: 'JSE', orderId: 'o-1' });
    expect((await bookings.byOrders(db, ORG_A, ['o-1'])).get('o-1')).toMatchObject({ pilotId: 'JSE' });
    expect((await bookings.byOrders(db, ORG_B, ['o-1'])).size).toBe(0);

    await db.transaction((tx) =>
      bookings.insert(tx, ORG_A, {
        id: 'bk-plain',
        aircraftId: 'SP-FGK',
        kind: 'flight',
        status: 'confirmed',
        startsAt: AT.getTime() + 24 * H,
        endsAt: AT.getTime() + 26 * H,
        pilotId: 'PWI',
        dualId: null,
        operation: 'przelot',
        fromIcao: null,
        toIcao: null,
        plannedAirMin: null,
        plannedFuelL: null,
        blockReason: null,
        note: null,
        createdBy: 'PWI',
      }),
    );
    expect(await db.transaction((tx) => bookings.setCrew(tx, ORG_A, 'bk-plain', { pic: 'JSE', dual: null }, AT))).toBeNull();
  });

  it('zegar nie przypomina i nie zwalnia terminu zlecenia BEZ załogi (§16 pkt 4)', async () => {
    const start = AT.getTime() + 30 * 60_000;
    const booking = await order('o-1', start);
    const window = { startsBefore: new Date(AT.getTime() + H), endsAfter: AT };
    expect(await bookings.dueReminders(db, window)).toEqual([]);
    expect(await bookings.due(db, { startedBefore: new Date(start + 1), endsAfter: new Date(start) })).toEqual([]);

    // Po obsadzeniu - zlecenie ma komplet, więc to zwykły lot z przypomnieniem.
    await db.transaction(async (tx) => {
      await bookings.setCrew(tx, ORG_A, booking, { pic: 'JSE', dual: null }, AT);
      await orders.update(tx, ORG_A, 'o-1', { status: 'filled' }, AT);
    });
    expect((await bookings.dueReminders(db, window)).map((b) => b.id)).toEqual([booking]);
    expect((await bookings.due(db, { startedBefore: new Date(start + 1), endsAfter: new Date(start) })).map((b) => b.id)).toEqual([
      booking,
    ]);
  });
});
