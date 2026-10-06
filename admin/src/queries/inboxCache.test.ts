import { describe, expect, it } from 'vitest';

import type { InboxItemDto, InboxPageDto } from '../api/dto';
import { asInboxItem, cursorOf, inboxItems, unreadCount, withNotification, withRead, type InboxData } from './inboxCache';

const DAY = { date: '2026-10-06', startsAt: '2026-10-05T22:00:00.000Z', endsAt: '2026-10-06T22:00:00.000Z' };

function item(id: string, over: Partial<InboxItemDto> = {}): InboxItemDto {
  return {
    id,
    kind: 'approval_requested',
    payload: { bookingId: `rez-${id}` },
    createdAt: '2026-10-01T06:26:07.262Z',
    readAt: null,
    day: DAY,
    ...over,
  };
}

function page(items: InboxItemDto[], unread: number): InboxPageDto {
  return { timezone: 'Europe/Warsaw', unread, items };
}

function data(...pages: InboxPageDto[]): InboxData {
  return { pages, pageParams: pages.map((_, index) => (index === 0 ? null : { at: 'x', id: `p${index}` })) };
}

describe('wiadomość z ramki kanału', () => {
  it('kształt wiersza skrzynki przechodzi, a brakujące pola dostają wartości „nie wiadomo"', () => {
    expect(asInboxItem({ id: 'n1', kind: 'aircraft_released', createdAt: '2026-10-01T08:00:00.000Z', day: DAY })).toEqual({
      id: 'n1',
      kind: 'aircraft_released',
      payload: {},
      createdAt: '2026-10-01T08:00:00.000Z',
      readAt: null,
      day: DAY,
    });
  });

  it('ramka spoza kształtu wiersza nie trafia do skrzynki', () => {
    expect(asInboxItem(null)).toBeNull();
    expect(asInboxItem('n1')).toBeNull();
    expect(asInboxItem([{ id: 'n1' }])).toBeNull();
    expect(asInboxItem({ id: 'n1', kind: 'x' })).toBeNull();
    expect(asInboxItem({ id: 7, kind: 'x', createdAt: 'teraz' })).toBeNull();
  });

  it('treść nie-obiekt i doba bez daty nie udają danych', () => {
    const parsed = asInboxItem({ id: 'n1', kind: 'x', createdAt: 'teraz', payload: ['a'], day: { startsAt: 'a' } });
    expect(parsed?.payload).toEqual({});
    expect(parsed?.day).toBeNull();
  });
});

describe('ramka dopisuje się do pobranej skrzynki', () => {
  it('skrzynki jeszcze nie ma - nic do poprawiania, przyjdzie z odczytem', () => {
    expect(withNotification(undefined, item('n9'), 1)).toBeUndefined();
  });

  it('nowa wiadomość staje na górze pierwszej strony, liczba idzie z ramki', () => {
    const next = withNotification(data(page([item('n1')], 0)), item('n2'), 3);
    expect(inboxItems(next).map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(unreadCount(next)).toBe(3);
  });

  it('odświeżona rozmowa przenosi się z dalszej strony na górę - bez drugiego wiersza', () => {
    const before = data(page([item('n3'), item('n2')], 0), page([item('watek'), item('n1')], 0));
    const next = withNotification(before, item('watek', { payload: { text: 'nowa treść' } }), 1);
    expect(next?.pages.map((p) => p.items.map((n) => n.id))).toEqual([['watek', 'n3', 'n2'], ['n1']]);
    expect(next?.pages[0]?.items[0]?.payload).toEqual({ text: 'nowa treść' });
  });

  it('ramka bez liczby zostawia liczbę strony', () => {
    expect(unreadCount(withNotification(data(page([], 2)), item('n1'), null))).toBe(2);
  });
});

describe('przeczytanie z otwarciem listy', () => {
  it('stempluje nieprzeczytane z listy i odejmuje od liczby tylko je', () => {
    // Liczba strony obejmuje też wiadomości spoza pobranej części skrzynki (liczy serwer).
    const before = data(page([item('n2'), item('n1', { readAt: '2026-10-01T07:00:00.000Z' })], 3), page([item('n0')], 0));
    const next = withRead(before, new Set(['n2', 'n1', 'n0']), '2026-10-01T09:00:00.000Z');
    expect(inboxItems(next).map((n) => n.readAt)).toEqual([
      '2026-10-01T09:00:00.000Z',
      '2026-10-01T07:00:00.000Z',
      '2026-10-01T09:00:00.000Z',
    ]);
    // n1 było przeczytane wcześniej - nie odejmuje się drugi raz.
    expect(unreadCount(next)).toBe(1);
  });

  it('liczba nie schodzi pod zero, gdy pamięć wyprzedziła serwer', () => {
    const before = data(page([item('n2'), item('n1')], 1));
    expect(unreadCount(withRead(before, new Set(['n2', 'n1']), '2026-10-01T09:00:00.000Z'))).toBe(0);
  });

  it('pusta lista nie rusza pamięci', () => {
    const before = data(page([item('n1')], 1));
    expect(withRead(before, new Set(), '2026-10-01T09:00:00.000Z')).toBe(before);
  });
});

describe('strony', () => {
  it('kursor następnej strony to para (chwila, identyfikator) ostatniego wiersza', () => {
    expect(cursorOf(item('n1'))).toEqual({ at: '2026-10-01T06:26:07.262Z', id: 'n1' });
  });

  it('bez pobranej skrzynki liczba przy dzwonku jest nieznana, a lista pusta', () => {
    expect(unreadCount(undefined)).toBeNull();
    expect(inboxItems(undefined)).toEqual([]);
  });
});
