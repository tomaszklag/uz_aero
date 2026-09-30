/**
 * Ninerdeck (serwer) - rozmowa zlecającego z adresatem na prawdziwym Postgresie
 * (#245, `docs/zlecenia.md` §7, §10.5, §12).
 *
 * Najważniejsze własności: piszą DOKŁADNIE dwie osoby (autor i adresat), koordynator czyta
 * bez pisania i bez ruszania odczytów, rozmowa zamyka się razem z grą adresata (28B),
 * a skrzynka dostaje JEDEN nieprzeczytany wiersz na wątek - z licznikiem.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ORG_A } from './testWorld.ts';
import { author, coordinator, draft, group, inbox, orderWorld, pilot, type OrderWorld } from './orderWorld.ts';

let w: OrderWorld;
const step = (): void => w.clock.advance(60_000);

beforeEach(async () => {
  w = await orderWorld();
  await group(w.db, 'g-an2', 'Piloci An-2', ['PWI', 'KRZ']);
  await w.orders.create(ORG_A, author, draft({ audience: { kind: 'per_seat', pic: { pilotIds: [], groupIds: ['g-an2'] }, dual: null } }));
  step();
  w.live.clear();
});

describe('wiadomości', () => {
  it('pierwsza wiadomość zakłada wątek; skrzynka autora ma JEDEN wiersz z licznikiem', async () => {
    const first = await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-1', body: '  Mogę o 14?  ' });
    expect(first).toMatchObject({ ok: true, created: true, message: { body: 'Mogę o 14?', authorId: 'PWI' } });
    step();
    await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-2', body: 'Albo o 15.' });

    const messages = (await inbox(w.db, 'JSE')).filter((n) => n.kind === 'order_message');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.payload).toMatchObject({ recipientId: 'PWI', authorId: 'PWI', unread: 2 });
    // Ramka `message` do uczestników i czytających z `reservations.manage` (pkt 19).
    const frame = w.live.signals.filter((s) => s.kind === 'message').at(-1)!;
    expect(frame.frame).toMatchObject({ orderId: 'o-1', recipientId: 'PWI', message: { id: 'm-2' } });
    expect(frame.audiences).toContainEqual({ kind: 'capability', capability: 'reservations.manage' });
  });

  it('powtórzony zapis tym samym uuidem to ta sama wiadomość - bez drugiego powiadomienia', async () => {
    await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-1', body: 'Hej' });
    const again = await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-1', body: 'Hej' });
    expect(again).toMatchObject({ ok: true, created: false });
    const [row] = (await inbox(w.db, 'JSE')).filter((n) => n.kind === 'order_message');
    expect(row!.payload.unread).toBe(1);
  });

  it('autor odpisuje - adresat dostaje wiadomość; odczyt autora zeruje licznik następnej', async () => {
    await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-1', body: 'Pytanie' });
    step();
    await w.threads.send(ORG_A, author, 'o-1', 'PWI', { id: 'm-2', body: 'Odpowiedź' });
    expect((await inbox(w.db, 'PWI')).at(-1)).toMatchObject({ kind: 'order_message', payload: { authorId: 'JSE', unread: 1 } });

    step();
    expect(await w.threads.read(ORG_A, author, 'o-1', 'PWI')).toEqual({ ok: true });
    expect(w.live.signals.filter((s) => s.kind === 'read').at(-1)?.frame).toMatchObject({ pilotId: 'JSE', recipientId: 'PWI' });
    step();
    await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-3', body: 'Dzięki' });
    const [row] = (await inbox(w.db, 'JSE')).filter((n) => n.kind === 'order_message');
    expect(row!.payload.unread).toBe(1);
  });

  it('koordynator czyta, ale nie pisze - i jego odczyt niczego nie rusza', async () => {
    await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-1', body: 'Hej' });
    expect(await w.threads.send(ORG_A, coordinator, 'o-1', 'PWI', { id: 'm-2', body: 'Wtrącę się' })).toEqual({
      ok: false,
      refusal: 'read_only',
    });
    w.live.clear();
    expect(await w.threads.read(ORG_A, coordinator, 'o-1', 'PWI')).toEqual({ ok: true });
    expect(w.live.signals).toEqual([]);
    const page = await w.threadQueries.page(ORG_A, coordinator, 'o-1', 'PWI', { limit: 20 });
    expect(page).toMatchObject({ role: 'reader', closed: 'read_only', messages: [{ id: 'm-1' }] });
  });

  it('cudza rozmowa nie istnieje: adresat nie otworzy wątku innego adresata, osoba spoza zlecenia żadnego', async () => {
    expect(await w.threads.send(ORG_A, pilot('KRZ'), 'o-1', 'PWI', { id: 'm-1', body: 'x' })).toBeNull();
    expect(await w.threadQueries.page(ORG_A, pilot('KRZ'), 'o-1', 'PWI', { limit: 20 })).toBeNull();
    expect(await w.threads.send(ORG_A, pilot('TOM'), 'o-1', 'TOM', { id: 'm-1', body: 'x' })).toBeNull();
  });

  it('pusta wiadomość - odmowa, bez zakładania wątku', async () => {
    expect(await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-1', body: '   ' })).toEqual({
      ok: false,
      refusal: 'message_invalid',
    });
    const { rows } = await w.db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM threads`);
    expect(rows[0]!.n).toBe(0);
  });
});

describe('rozmowa do odczytu (28B)', () => {
  it('fotel obsadzony przez kogoś innego zamyka rozmowę po OBU stronach; odwołanie też', async () => {
    await w.threads.send(ORG_A, pilot('KRZ'), 'o-1', 'KRZ', { id: 'm-1', body: 'Hej' });
    await w.responses.answer(ORG_A, pilot('PWI'), 'o-1', { answer: 'yes', reason: null });
    await w.assignments.assign(ORG_A, author, 'o-1', { pilotId: 'PWI', seat: 'pic' });

    expect(await w.threads.send(ORG_A, pilot('KRZ'), 'o-1', 'KRZ', { id: 'm-2', body: 'x' })).toEqual({
      ok: false,
      refusal: 'thread_closed',
    });
    expect(await w.threads.send(ORG_A, author, 'o-1', 'KRZ', { id: 'm-3', body: 'x' })).toEqual({
      ok: false,
      refusal: 'thread_closed',
    });
    // Przydzielony pisze dalej - lot jest jego.
    expect(await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-4', body: 'Jestem' })).toMatchObject({ ok: true });

    const page = await w.threadQueries.page(ORG_A, pilot('KRZ'), 'o-1', 'KRZ', { limit: 20 });
    expect(page).toMatchObject({ role: 'participant', closed: 'thread_closed', messages: [{ id: 'm-1' }] });

    await w.orders.cancel(ORG_A, author, 'o-1', null);
    expect(await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id: 'm-5', body: 'x' })).toEqual({
      ok: false,
      refusal: 'thread_closed',
    });
  });
});

describe('strona rozmowy', () => {
  it('od najnowszej, kursorem parą; bez wątku - pusta lista z uczestnikami', async () => {
    const empty = await w.threadQueries.page(ORG_A, pilot('PWI'), 'o-1', 'PWI', { limit: 2 });
    expect(empty).toMatchObject({ threadId: null, messages: [], next: null, closed: null });
    expect(empty?.participants.map((p) => p.pilotId)).toEqual(['JSE', 'PWI']);

    for (const id of ['m-1', 'm-2', 'm-3']) {
      await w.threads.send(ORG_A, pilot('PWI'), 'o-1', 'PWI', { id, body: id });
      step();
    }
    const first = await w.threadQueries.page(ORG_A, author, 'o-1', 'PWI', { limit: 2 });
    expect(first?.messages.map((m) => m.id)).toEqual(['m-3', 'm-2']);
    expect(first?.next).not.toBeNull();
    const second = await w.threadQueries.page(ORG_A, author, 'o-1', 'PWI', { limit: 2, before: first!.next! });
    expect(second?.messages.map((m) => m.id)).toEqual(['m-1']);
    expect(second?.next).toBeNull();
  });
});
