/**
 * Ninerdeck - testy SZYNY KANAŁU KLUBU (`application/live/liveBus.ts`; 4.0.0,
 * epik KK-C #246).
 *
 * Pod obserwacją: dopasowanie tematów (cały rodzaj albo dokładnie ten), sklejanie serii
 * sygnałów w JEDNO odświeżenie ekranu (jedna zmiana przychodzi kilkoma ramkami),
 * skrzynka i rozmowy zleceń jako tematy lokalne telefonu, ramki rozmów w całości dla
 * otwartej rozmowy (epik Z-C #247), dociągnięcie stanu przez KAŻDY podpięty ekran
 * po powitaniu łącza (K2) i odpięcie, także z odświeżeniem w drodze.
 */

import {
  INBOX_TOPIC,
  LIVE_COALESCE_MS,
  LiveBus,
  THREAD_TOPIC,
  threadTopic,
  topicMatches,
} from '../application/live/liveBus';
import type { Timers } from '../application/live/timers';

/** Zegar w pamięci - odpala zaplanowane, gdy test każe. */
class FakeTimers implements Timers {
  private next = 1;
  private readonly pending = new Map<number, { fn: () => void; ms: number }>();

  set(fn: () => void, ms: number): unknown {
    const id = this.next++;
    this.pending.set(id, { fn, ms });
    return id;
  }

  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  delays(): number[] {
    return [...this.pending.values()].map((p) => p.ms);
  }

  fireAll(): void {
    for (const [id, timer] of [...this.pending]) {
      if (!this.pending.has(id)) continue;
      this.pending.delete(id);
      timer.fn();
    }
  }
}

const changed = (...topics: string[]) => ({ type: 'changed' as const, org: 'org-a', topics });

function counter() {
  let count = 0;
  return {
    refresh: () => {
      count += 1;
    },
    count: () => count,
  };
}

function world() {
  const timers = new FakeTimers();
  return { timers, bus: new LiveBus(timers) };
}

describe('dopasowanie tematu', () => {
  it('wzorzec bez dwukropka łapie cały rodzaj, z dwukropkiem - dokładnie ten temat', () => {
    expect(topicMatches('calendar', 'calendar:2026-10-05')).toBe(true);
    expect(topicMatches('orders', 'orders')).toBe(true);
    expect(topicMatches('booking:b1', 'booking:b1')).toBe(true);
    expect(topicMatches('booking:b1', 'booking:b2')).toBe(false);
    expect(topicMatches('booking', 'bookings')).toBe(false);
    expect(topicMatches('order', 'orders')).toBe(false);
    expect(topicMatches('calendar:2026-10-05', 'calendar')).toBe(false);
  });
});

describe('szyna kanału klubu', () => {
  it('`changed` odświeża ekrany, których tematy pasują - i tylko je', () => {
    const { bus, timers } = world();
    const calendar = counter();
    const booking = counter();
    const orders = counter();
    bus.subscribe(['calendar'], calendar.refresh);
    bus.subscribe(['booking:b1'], booking.refresh);
    bus.subscribe(['orders'], orders.refresh);

    bus.publish(changed('calendar:2026-10-05'));
    bus.publish(changed('booking:b2'));
    timers.fireAll();
    expect([calendar.count(), booking.count(), orders.count()]).toEqual([1, 0, 0]);

    bus.publish(changed('booking:b1', 'calendar:2026-10-06', 'orders'));
    timers.fireAll();
    expect([calendar.count(), booking.count(), orders.count()]).toEqual([2, 1, 1]);
  });

  it('seria sygnałów jednej zmiany to JEDNO odświeżenie ekranu, nie tyle, ile ramek', () => {
    // Zmiana rezerwacji przychodzi kilkoma ramkami (rezerwacja + doba, osobno samolot),
    // a ekran podpięty pod kilka tematów pytałby serwer tyle razy, ile ramek.
    const { bus, timers } = world();
    const card = counter();
    bus.subscribe(['booking:b1', 'calendar', INBOX_TOPIC], card.refresh);
    bus.publish(changed('booking:b1', 'calendar:2026-10-05'));
    bus.publish(changed('calendar:2026-10-06'));
    bus.publish({ type: 'notification', org: 'org-a', item: null, unread: 2, quiet: false });
    expect(timers.delays()).toEqual([LIVE_COALESCE_MS]);
    expect(card.count()).toBe(0);

    timers.fireAll();
    expect(card.count()).toBe(1);

    // Po odświeżeniu następny sygnał to nowe odświeżenie.
    bus.publish(changed('calendar:2026-10-05'));
    timers.fireAll();
    expect(card.count()).toBe(2);
  });

  it('nowa wiadomość jest dla skrzynki tym, czym `changed` dla kalendarza', () => {
    const { bus, timers } = world();
    const inbox = counter();
    const calendar = counter();
    bus.subscribe([INBOX_TOPIC], inbox.refresh);
    bus.subscribe(['calendar'], calendar.refresh);
    bus.publish({ type: 'notification', org: 'org-a', item: null, unread: 4, quiet: false });
    timers.fireAll();
    expect([inbox.count(), calendar.count()]).toEqual([1, 0]);
  });

  it('po powitaniu łącza KAŻDY podpięty ekran dociąga stan - ramka sprzed połączenia mogła przepaść (K2)', () => {
    const { bus, timers } = world();
    const inbox = counter();
    const calendar = counter();
    bus.subscribe([INBOX_TOPIC], inbox.refresh);
    bus.subscribe(['calendar', 'booking'], calendar.refresh);
    bus.reopened();
    timers.fireAll();
    expect([inbox.count(), calendar.count()]).toEqual([1, 1]);
  });

  it('nowa wiadomość idzie do słuchaczy banera OD RAZU i w całości - baner nie czeka na serię', () => {
    const { bus, timers } = world();
    const seen: unknown[] = [];
    const off = bus.onNotification((frame) => seen.push(frame));
    const item = {
      id: 'n1',
      kind: 'approval_requested',
      payload: { bookingId: 'b1' },
      createdAt: '2026-10-05T08:00:00.000Z',
      readAt: null,
      day: null,
    };

    bus.publish({ type: 'notification', org: 'org-a', item, unread: 3, quiet: false });
    bus.publish(changed('calendar:2026-10-05'));
    expect(seen).toEqual([{ type: 'notification', org: 'org-a', item, unread: 3, quiet: false }]);
    // Słuchacz banera nie jest ekranem: niczego nie planuje u siebie na później.
    expect(timers.delays()).toEqual([]);

    off();
    bus.publish({ type: 'notification', org: 'org-a', item, unread: 4, quiet: false });
    expect(seen).toHaveLength(1);
  });

  it('ramka rozmowy idzie do otwartej rozmowy OD RAZU i w całości - rozmowa nie czeka na serię', () => {
    // Wiadomość niesie treść (`docs/zlecenia.md` §11): rozmowa dopisuje ją bez pytania
    // serwera, więc czekanie na sklejenie serii byłoby opóźnieniem bez zysku.
    const { bus, timers } = world();
    const seen: unknown[] = [];
    const off = bus.onThread((frame) => seen.push(frame));
    const message = {
      type: 'message' as const,
      org: 'org-a',
      orderId: 'o1',
      recipientId: 'p2',
      message: { id: 'm1', authorId: 'p2', body: 'Mogę od 10.', createdAt: '2026-10-05T08:00:00.000Z' },
    };
    const read = {
      type: 'read' as const,
      org: 'org-a',
      orderId: 'o1',
      recipientId: 'p2',
      pilotId: 'p1',
      at: '2026-10-05T08:01:00.000Z',
    };

    bus.publish(message);
    bus.publish(read);
    bus.publish(changed('order:o1'));
    bus.publish({ type: 'notification', org: 'org-a', item: null, unread: 1, quiet: false });
    expect(seen).toEqual([message, read]);

    off();
    bus.publish(message);
    expect(seen).toHaveLength(2);
    expect(timers.delays()).toEqual([]);
  });

  it('ruch w rozmowach zlecenia odświeża ekrany podpięte pod `thread:<zlecenie>` - i tylko je', () => {
    // Karta prowadzącego i lista liczą nieprzeczytane wiadomości przy adresatach - ramka
    // rozmowy jest dla nich tym, czym `changed` dla kalendarza (temat lokalny telefonu).
    const { bus, timers } = world();
    const card = counter();
    const other = counter();
    const anyThread = counter();
    const order = counter();
    bus.subscribe([threadTopic('o1')], card.refresh);
    bus.subscribe([threadTopic('o2')], other.refresh);
    bus.subscribe([THREAD_TOPIC], anyThread.refresh);
    bus.subscribe(['order:o1'], order.refresh);

    bus.publish({
      type: 'read',
      org: 'org-a',
      orderId: 'o1',
      recipientId: 'p2',
      pilotId: 'p1',
      at: '2026-10-05T08:01:00.000Z',
    });
    timers.fireAll();
    expect([card.count(), other.count(), anyThread.count(), order.count()]).toEqual([1, 0, 1, 0]);
  });

  it('odpięty ekran nie dostaje już niczego - także odświeżenia, które było w drodze', () => {
    const { bus, timers } = world();
    const first = counter();
    const second = counter();
    const unsubscribeFirst = bus.subscribe(['orders'], first.refresh);
    const unsubscribeSecond = bus.subscribe(['orders'], second.refresh);

    bus.publish(changed('orders'));
    unsubscribeSecond();
    expect(timers.delays()).toEqual([LIVE_COALESCE_MS]);
    timers.fireAll();
    expect([first.count(), second.count()]).toEqual([1, 0]);

    unsubscribeFirst();
    bus.publish(changed('orders'));
    bus.reopened();
    timers.fireAll();
    expect([first.count(), second.count()]).toEqual([1, 0]);
    expect(timers.delays()).toEqual([]);
  });
});
