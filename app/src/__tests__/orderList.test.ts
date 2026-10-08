/**
 * Ninerdeck - testy LISTY ZLECEŃ (`logic/orderList.ts`; epik Z-C #247; makiety 30, 30A).
 *
 * Obie ramki makiety 30 jeden do jednego - „Do mnie" Adama w piątek 21:50 i „Zlecone"
 * Marty o 21:45 - plus stany z decyzji właściciela 2026-10-06: odmowa zostaje na liście
 * („Nie mogę"), przydział przez prowadzącego to „Przydzielone", a fotel zniesiony czyta
 * się jak obsadzony.
 */

import type { RemoteCalendarDay, RemoteOrderListItem } from '../application';
import { awaitingAnswerIds, awaitsMyAnswer, orderListVm, type ListPart, type OrderRowVm } from '../ui/screens/logic/orderList';
import { booking, local, localMs, me, nameOf, order, regOf, SATURDAY } from './support/orderFixtures';

const flat = (parts: readonly ListPart[] | null): string | null =>
  parts == null ? null : parts.map((p) => (p.strong ? `[${p.text}]` : p.tone != null ? `<${p.tone}>${p.text}` : p.text)).join('');

/** Doba klubu przesunięta o pełne dni od soboty (październik - UTC+2). */
const dayAt = (offset: number, date: string): RemoteCalendarDay => ({
  date,
  startsAt: new Date(Date.parse(SATURDAY.startsAt) + offset * 86_400_000).toISOString(),
  endsAt: new Date(Date.parse(SATURDAY.endsAt) + offset * 86_400_000).toISOString(),
});

function item(over: Partial<RemoteOrderListItem> = {}): RemoteOrderListItem {
  return { day: SATURDAY, order: order(), booking: booking(), me: null, progress: null, unread: 0, ...over };
}

const view = (row: OrderRowVm) => ({
  hours: row.hours,
  tag: `${row.tag.text}/${row.tag.tone}`,
  line: [row.aircraft, row.operation, row.route].join(' · '),
  meta: flat(row.meta),
  progress: flat(row.progress),
  unread: row.unread,
  target: row.target,
});

describe('„Do mnie" - Adam Kowalski, piątek 21:50 (30, ramka 1)', () => {
  const zlecenieB = item({ me: me({ seat: 'dual', seen: true }) });
  const zlecenieA = item({
    order: order({ id: 'o-a', seats: { pic: 'sought', dual: 'none' }, status: 'filled' }),
    booking: booking({
      id: 'b-a',
      aircraftId: 'ac-axa',
      startsAt: local(0, '10:00'),
      endsAt: local(0, '12:00'),
      operation: 'ferry',
      fromIcao: 'EPKK',
      toIcao: 'EPRJ',
      pilotId: 'AKO',
    }),
    me: me({ seat: 'pic', direct: true, answer: 'yes', answeredAt: local(-1, '07:40'), assignedSeat: 'pic', threadId: 't-a', unread: 1 }),
    unread: 1,
  });
  const obsadzone = item({
    day: dayAt(-6, '2026-09-27'),
    order: order({ id: 'o-old', createdBy: 'PWL' }),
    booking: booking({ id: 'b-old', startsAt: local(-6, '08:00'), endsAt: local(-6, '12:00') }),
    me: me({ inPlay: false, staleReason: 'seat_filled' }),
  });
  const vm = orderListVm({
    list: { timezone: 'Europe/Warsaw', items: [zlecenieA, obsadzone, zlecenieB] },
    box: 'inbox',
    now: localMs(-1, '21:50'),
    pilotId: 'AKO',
    nameOf,
    regOf,
  });

  it('jutro: skoki od 9, przelot od 10 - kolejność godziną startu, nie wagą', () => {
    expect(vm.days.map((d) => d.label)).toEqual(['Jutro · sobota 3 października']);
    expect(vm.days[0]!.rows.map(view)).toEqual([
      {
        hours: '09:00 → 13:00',
        tag: 'Czeka na odpowiedź/blue',
        line: 'SP-ANA · Skoki · EPKP',
        meta: 'Fotel: [drugi pilot] · zleca Marta Zięba',
        progress: null,
        unread: false,
        target: { screen: 'order', orderId: 'o-b' },
      },
      {
        hours: '10:00 → 12:00',
        tag: 'Przyjęte/green',
        line: 'SP-AXA · Przelot · EPKK → EPRJ',
        meta: 'Fotel: [dowódca] · zleca Marta Zięba',
        progress: null,
        unread: true,
        // Lot, który już jest mój, jest rezerwacją - wiersz prowadzi do niej (23F, §14.3).
        target: { screen: 'booking', bookingId: 'b-a' },
      },
    ]);
  });

  it('„Zakończone": fotel obsadzony przez kogoś innego - bez nazwiska, z datą w wierszu', () => {
    expect(vm.done.map(view)).toEqual([
      {
        hours: '27 WRZ · 08:00 → 12:00',
        tag: 'Nieaktualne/neutral',
        line: 'SP-ANA · Skoki · EPKP',
        meta: 'Fotel obsadzony · zleca Paweł Wilk',
        progress: null,
        unread: false,
        target: { screen: 'order', orderId: 'o-old' },
      },
    ]);
  });
});

describe('„Do mnie" - stany z decyzji właściciela (2026-10-06)', () => {
  const rowFor = (m: Parameters<typeof me>[0], over: Partial<RemoteOrderListItem> = {}): OrderRowVm => {
    const vm = orderListVm({
      list: { timezone: 'Europe/Warsaw', items: [item({ me: me(m), ...over })] },
      box: 'inbox',
      now: localMs(-1, '21:50'),
      pilotId: 'AKO',
      nameOf,
      regOf,
    });
    return vm.days[0]?.rows[0] ?? vm.done[0]!;
  };

  it('odmowa zostaje wśród aktywnych z neutralnym „Nie mogę" - zlecenie dalej żyje', () => {
    const row = rowFor({ answer: 'no', answeredAt: local(-1, '19:14') });
    expect([row.done, row.tag]).toEqual([false, { text: 'Nie mogę', tone: 'neutral' }]);
  });

  it('zgłoszenie bez przydziału - neutralne „Zgłoszone"; przydział przez prowadzącego - „Przydzielone"', () => {
    expect(rowFor({ answer: 'yes' }).tag).toEqual({ text: 'Zgłoszone', tone: 'neutral' });
    const assigned = rowFor({ answer: 'yes', assignedSeat: 'dual' }, { booking: booking({ dualId: 'AKO' }) });
    expect(assigned.tag).toEqual({ text: 'Przydzielone', tone: 'green' });
    expect(assigned.target).toEqual({ screen: 'booking', bookingId: 'b-b' });
  });

  it('termin do potwierdzenia - fotela nie ma, jest termin', () => {
    expect(flat(rowFor({ seat: null, namedSeat: 'pic' }).meta)).toBe('Termin do potwierdzenia · zleca Marta Zięba');
  });

  it('fotel zniesiony czyta się jak obsadzony; odebrane - jak cofnięte; odwołane i wygasłe mają własną plakietkę', () => {
    expect(flat(rowFor({ inPlay: false, staleReason: 'seat_dropped' }).meta)).toBe('Fotel obsadzony · zleca Marta Zięba');
    expect(flat(rowFor({ inPlay: false, staleReason: 'removed', removed: true }).meta)).toBe('Nie jest już do Ciebie · zleca Marta Zięba');
    const cancelled = rowFor({ inPlay: false, staleReason: 'closed' }, { order: order({ status: 'cancelled' }) });
    expect([cancelled.tag.text, flat(cancelled.meta)]).toEqual(['Odwołane', 'zleca Marta Zięba']);
    const expired = rowFor({ inPlay: false, staleReason: 'closed' }, { order: order({ status: 'expired' }) });
    expect([expired.tag.text, flat(expired.meta)]).toEqual(['Wygasło', 'Bez kompletu załogi · zleca Marta Zięba']);
  });

  it('termin, który minął, schodzi do „Zakończonych" - nawet przyjęty', () => {
    const row = orderListVm({
      list: {
        timezone: 'Europe/Warsaw',
        items: [item({ me: me({ seat: 'pic', direct: true, answer: 'yes', assignedSeat: 'pic' }), booking: booking({ pilotId: 'AKO' }) })],
      },
      box: 'inbox',
      now: localMs(0, '14:00'),
      pilotId: 'AKO',
      nameOf,
      regOf,
    });
    expect(row.days).toEqual([]);
    expect(row.done[0]?.tag).toEqual({ text: 'Przyjęte', tone: 'neutral' });
  });
});

describe('„Zlecone" - Marta Zięba, piątek 21:45 (30, ramka 2)', () => {
  const vm = orderListVm({
    list: {
      timezone: 'Europe/Warsaw',
      items: [
        // Zlecenie B - własne, oba fotele szukane, nieprzeczytana wiadomość od Anny.
        item({ progress: { recipients: 6, seen: 5, volunteers: 2, single: null }, unread: 1 }),
        // Zlecenie A - własne, jedna osoba imiennie, przyjęte rano.
        item({
          order: order({ id: 'o-a', status: 'filled', seats: { pic: 'sought', dual: 'none' } }),
          booking: booking({ id: 'b-a', aircraftId: 'ac-axa', startsAt: local(0, '10:00'), endsAt: local(0, '12:00'), operation: 'ferry', fromIcao: 'EPKK', toIcao: 'EPRJ', pilotId: 'AKO' }),
          progress: { recipients: 1, seen: 1, volunteers: 0, single: { pilotId: 'AKO', seen: true, answer: 'yes', answeredAt: local(-1, '07:40') } },
        }),
        // Cudze z kompletem załogi - załoga i osoba zlecająca.
        item({
          order: order({ id: 'o-c', createdBy: 'PWL', status: 'filled', seats: { pic: 'sought', dual: 'none' } }),
          booking: booking({ id: 'b-c', aircraftId: 'ac-bkl', startsAt: local(0, '14:00'), endsAt: local(0, '15:30'), operation: 'techniczny', fromIcao: 'EPKK', toIcao: 'EPKK', pilotId: 'BNO' }),
          progress: { recipients: 3, seen: 3, volunteers: 2, single: null },
        }),
        // Zlecenie instruktora - dowódca „ja", drugi pilot imiennie do uczennicy.
        item({
          day: dayAt(1, '2026-10-04'),
          order: order({ id: 'o-d', createdBy: 'AKO', seats: { pic: 'self', dual: 'sought' } }),
          booking: booking({ id: 'b-d', aircraftId: 'ac-bkl', startsAt: local(1, '10:00'), endsAt: local(1, '11:30'), operation: 'ferry', fromIcao: 'EPKK', toIcao: 'EPKP', pilotId: 'AKO' }),
          progress: { recipients: 1, seen: 0, volunteers: 0, single: { pilotId: 'ESO', seen: false, answer: null, answeredAt: null } },
        }),
        // Wygasło - bez kompletu załogi.
        item({
          day: dayAt(-2, '2026-10-01'),
          order: order({ id: 'o-e', status: 'expired', seats: { pic: 'sought', dual: 'none' } }),
          booking: booking({ id: 'b-e', aircraftId: 'ac-bkl', status: 'released', startsAt: local(-2, '16:00'), endsAt: local(-2, '18:00'), operation: 'ferry', fromIcao: 'EPKK', toIcao: 'EPRJ' }),
          progress: { recipients: 2, seen: 1, volunteers: 0, single: null },
        }),
      ],
    },
    box: 'managed',
    now: localMs(-1, '21:45'),
    pilotId: 'MZI',
    nameOf,
    regOf,
  });

  it('postęp w dwóch kształtach; „zleca …" wyłącznie przy cudzym zleceniu', () => {
    expect(vm.days.map((d) => d.label)).toEqual(['Jutro · sobota 3 października', 'Niedziela · 4 października']);
    expect(vm.days.flatMap((d) => d.rows).map(view)).toEqual([
      {
        hours: '09:00 → 13:00',
        tag: 'Szuka załogi/blue',
        line: 'SP-ANA · Skoki · EPKP',
        meta: null,
        progress: '5 z 6 odczytało · <ok>2 mogą lecieć',
        unread: true,
        target: { screen: 'order', orderId: 'o-b' },
      },
      {
        hours: '10:00 → 12:00',
        tag: 'Komplet załogi/green',
        line: 'SP-AXA · Przelot · EPKK → EPRJ',
        meta: null,
        progress: 'Adam Kowalski · przyjęte 07:40',
        unread: false,
        target: { screen: 'order', orderId: 'o-a' },
      },
      {
        hours: '14:00 → 15:30',
        tag: 'Komplet załogi/green',
        line: 'SP-BKL · Lot tech. · EPKK',
        meta: 'Załoga: [Barbara Nowak] · zleca Paweł Wilk',
        progress: null,
        unread: false,
        target: { screen: 'order', orderId: 'o-c' },
      },
      {
        hours: '10:00 → 11:30',
        tag: 'Szuka drugiego pilota/blue',
        line: 'SP-BKL · Przelot · EPKK → EPKP',
        meta: 'zleca Adam Kowalski',
        progress: 'Ewa Sowa · <dim>Nieodczytane',
        unread: false,
        target: { screen: 'order', orderId: 'o-d' },
      },
    ]);
  });

  it('„Zakończone": wygasłe bez kompletu, z datą i bez postępu', () => {
    expect(vm.done.map(view)).toEqual([
      {
        hours: '1 PAŹ · 16:00 → 18:00',
        tag: 'Wygasło/neutral',
        line: 'SP-BKL · Przelot · EPKK → EPRJ',
        meta: 'Bez kompletu załogi',
        progress: null,
        unread: false,
        target: { screen: 'order', orderId: 'o-e' },
      },
    ]);
  });
});

describe('wiersz bez dającego się przeczytać terminu', () => {
  it('wypada z listy - „gdzieś na liście" kłamałby o tym, kiedy lot jest', () => {
    const vm = orderListVm({
      list: { timezone: 'Europe/Warsaw', items: [item({ me: me(), booking: booking({ startsAt: 'jutro' }) })] },
      box: 'inbox',
      now: localMs(-1, '21:50'),
      pilotId: 'AKO',
      nameOf,
      regOf,
    });
    expect(vm).toEqual({ days: [], done: [] });
  });
});

describe('czeka na moją odpowiedź - plakietki skrzynki (25D)', () => {
  const list = (items: RemoteOrderListItem[]) => ({ timezone: 'Europe/Warsaw', items });
  const NOW = localMs(-1, '21:50');

  it('w grze, bez fotela, bez odpowiedzi i przed końcem terminu - czeka; reszta nie', () => {
    const ids = awaitingAnswerIds(
      list([
        item({ order: order({ id: 'czeka' }), me: me() }),
        item({ order: order({ id: 'zgloszone' }), me: me({ answer: 'yes' }) }),
        item({ order: order({ id: 'nie-moge' }), me: me({ answer: 'no' }) }),
        item({ order: order({ id: 'przydzielone' }), me: me({ assignedSeat: 'dual' }) }),
        item({ order: order({ id: 'nieaktualne' }), me: me({ inPlay: false, staleReason: 'seat_filled' }) }),
        item({ order: order({ id: 'minelo' }), booking: booking({ endsAt: local(-1, '20:00') }), me: me() }),
        item({ order: order({ id: 'prowadzone' }), me: null }),
      ]),
      NOW,
    );
    expect([...ids]).toEqual(['czeka']);
  });

  it('ta sama reguła maluje plakietkę listy na niebiesko - jedna definicja dla dwóch ekranów', () => {
    expect(awaitsMyAnswer(me(), localMs(0, '13:00'), NOW)).toBe(true);
    expect(awaitsMyAnswer(me(), localMs(0, '13:00'), localMs(0, '13:00'))).toBe(false);
  });
});
