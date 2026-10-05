/**
 * Ninerdeck - testy SZYNY KANAŁU KLUBU (`application/live/liveBus.ts`; 4.0.0,
 * epik KK-C #246).
 *
 * Pod obserwacją: dopasowanie tematów (cały rodzaj albo dokładnie ten), jedno
 * odświeżenie ekranu na ramkę, skrzynka jako temat lokalny telefonu, dociągnięcie stanu
 * przez KAŻDY podpięty ekran po wznowieniu łącza (K2) i odpięcie.
 */

import { INBOX_TOPIC, LiveBus, topicMatches } from '../application/live/liveBus';

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
    const bus = new LiveBus();
    const calendar = counter();
    const booking = counter();
    const orders = counter();
    bus.subscribe(['calendar'], calendar.refresh);
    bus.subscribe(['booking:b1'], booking.refresh);
    bus.subscribe(['orders'], orders.refresh);

    bus.publish(changed('calendar:2026-10-05'));
    bus.publish(changed('booking:b2'));
    expect([calendar.count(), booking.count(), orders.count()]).toEqual([1, 0, 0]);

    bus.publish(changed('booking:b1', 'calendar:2026-10-06', 'orders'));
    expect([calendar.count(), booking.count(), orders.count()]).toEqual([2, 1, 1]);
  });

  it('jedna ramka odświeża ekran RAZ, choć pasuje kilka jego tematów', () => {
    const bus = new LiveBus();
    const card = counter();
    bus.subscribe(['booking:b1', 'calendar'], card.refresh);
    bus.publish(changed('booking:b1', 'calendar:2026-10-05', 'calendar:2026-10-06'));
    expect(card.count()).toBe(1);
  });

  it('nowa wiadomość jest dla skrzynki tym, czym `changed` dla kalendarza', () => {
    const bus = new LiveBus();
    const inbox = counter();
    const calendar = counter();
    bus.subscribe([INBOX_TOPIC], inbox.refresh);
    bus.subscribe(['calendar'], calendar.refresh);
    bus.publish({ type: 'notification', org: 'org-a', item: null, unread: 4 });
    expect([inbox.count(), calendar.count()]).toEqual([1, 0]);
  });

  it('po wznowieniu łącza KAŻDY podpięty ekran dociąga stan - ramka sprzed przerwy mogła przepaść (K2)', () => {
    const bus = new LiveBus();
    const inbox = counter();
    const calendar = counter();
    bus.subscribe([INBOX_TOPIC], inbox.refresh);
    bus.subscribe(['calendar', 'booking'], calendar.refresh);
    bus.reopened();
    expect([inbox.count(), calendar.count()]).toEqual([1, 1]);
  });

  it('odpięty ekran nie dostaje już niczego - także ramki w trakcie rozsyłania; pozostali nie przepadają', () => {
    // Ekran, który zszedł ze stosu w środku rozsyłania, nie ma czego odświeżać - zasada
    // jak w DOM: słuchacz odpięty w trakcie zdarzenia nie dostaje już tego zdarzenia.
    const bus = new LiveBus();
    const first = counter();
    const second = counter();
    const third = counter();
    let unsubscribeSecond: () => void = () => {};
    const unsubscribeFirst = bus.subscribe(['orders'], () => {
      first.refresh();
      unsubscribeSecond();
    });
    unsubscribeSecond = bus.subscribe(['orders'], second.refresh);
    bus.subscribe(['orders'], third.refresh);

    bus.publish(changed('orders'));
    expect([first.count(), second.count(), third.count()]).toEqual([1, 0, 1]);

    unsubscribeFirst();
    bus.publish(changed('orders'));
    bus.reopened();
    expect([first.count(), second.count(), third.count()]).toEqual([1, 0, 3]);
  });
});
