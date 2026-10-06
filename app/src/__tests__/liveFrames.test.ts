/**
 * Ninerdeck - testy RAMEK KANAŁU KLUBU na telefonie (`application/live/frames.ts`;
 * 4.0.0, epik KK-C #246).
 *
 * Pod obserwacją: rozpoznanie tego, z czego telefon korzysta, klub przy ramkach z danymi
 * (łącze porównuje go z klubem, dla którego je otwarto), pozycja skrzynki w kształcie
 * REST, ignorowanie ramek nieznanego typu (nowszy serwer nie wywraca starszej aplikacji)
 * i odrzucenie tego, co ramką nie jest.
 */

import { parseFrame } from '../application/live/frames';

const ITEM = {
  id: 'n1',
  kind: 'approval_requested',
  payload: { bookingId: 'b1', startsAt: '2026-10-05T07:00:00.000Z' },
  createdAt: '2026-10-05T06:40:00.000Z',
  readAt: null,
  day: { date: '2026-10-05', startsAt: '2026-10-04T22:00:00.000Z', endsAt: '2026-10-05T22:00:00.000Z' },
};

const frame = (value: object): string => JSON.stringify(value);

describe('ramki kanału klubu na telefonie', () => {
  it('rozpoznaje to, z czego telefon korzysta', () => {
    expect(
      parseFrame(frame({ v: 1, type: 'hello', session: 's1', serverTime: '2026-10-05T08:00:00.000Z' })),
    ).toEqual({ type: 'hello' });
    expect(parseFrame(frame({ v: 1, type: 'ping' }))).toEqual({ type: 'ping' });
    expect(
      parseFrame(frame({ v: 1, type: 'changed', org: 'org-a', topics: ['calendar:2026-10-05', 'orders'] })),
    ).toEqual({ type: 'changed', org: 'org-a', topics: ['calendar:2026-10-05', 'orders'] });
    expect(parseFrame(frame({ v: 1, type: 'notification', org: 'org-a', item: ITEM, unread: 3 }))).toEqual({
      type: 'notification',
      org: 'org-a',
      item: ITEM,
      unread: 3,
      quiet: false,
    });
    expect(parseFrame(frame({ v: 1, type: 'bye', reason: 'token_expired' }))).toEqual({
      type: 'bye',
      reason: 'token_expired',
    });
  });

  it('ramka z danymi bez klubu niesie `null` - łącze nie poda jej dalej', () => {
    expect(parseFrame(frame({ type: 'changed', topics: ['orders'] }))).toEqual({
      type: 'changed',
      org: null,
      topics: ['orders'],
    });
    expect(parseFrame(frame({ type: 'notification', org: 7, item: ITEM, unread: 1 }))).toEqual({
      type: 'notification',
      org: null,
      item: ITEM,
      unread: 1,
      quiet: false,
    });
  });

  it('pozycja skrzynki spoza kształtu REST nie przechodzi, licznik przechodzi osobno', () => {
    expect(parseFrame(frame({ type: 'notification', org: 'org-a', item: { id: 7 }, unread: 2 }))).toEqual({
      type: 'notification',
      org: 'org-a',
      item: null,
      unread: 2,
      quiet: false,
    });
    expect(parseFrame(frame({ type: 'notification', org: 'org-a' }))).toEqual({
      type: 'notification',
      org: 'org-a',
      item: null,
      unread: null,
      quiet: false,
    });
    // Doba terminu nie do przeczytania nie odbiera wiadomości - wiersz pokaże się bez godzin.
    expect(
      parseFrame(frame({ type: 'notification', org: 'org-a', item: { ...ITEM, day: { date: 1 } }, unread: 1 })),
    ).toEqual({ type: 'notification', org: 'org-a', item: { ...ITEM, day: null }, unread: 1, quiet: false });
  });

  it('wiadomość do ZAŁOGI operacji w toku przychodzi cicha - wyłącznie z flagą równą `true`', () => {
    // Cisza w kokpicie (decyzje 2026-10-06): baner w aplikacji jej nie pokaże.
    expect(parseFrame(frame({ type: 'notification', org: 'org-a', item: ITEM, unread: 1, quiet: true }))).toEqual({
      type: 'notification',
      org: 'org-a',
      item: ITEM,
      unread: 1,
      quiet: true,
    });
    // Wartość nie-logiczna nie wycisza - cisza jest wyjątkiem, nie domysłem.
    expect(parseFrame(frame({ type: 'notification', org: 'org-a', item: ITEM, unread: 1, quiet: 'tak' }))).toMatchObject({
      quiet: false,
    });
  });

  it('pola obce nie przechodzą dalej; tematy wyłącznie napisami', () => {
    expect(
      parseFrame(frame({ type: 'notification', org: 'org-a', item: { ...ITEM, secret: 'x' }, unread: 1, extra: true })),
    ).toEqual({ type: 'notification', org: 'org-a', item: ITEM, unread: 1, quiet: false });
    expect(parseFrame(frame({ type: 'changed', org: 'org-a', topics: ['booking:b1', 7, null] }))).toEqual({
      type: 'changed',
      org: 'org-a',
      topics: ['booking:b1'],
    });
    expect(parseFrame(frame({ type: 'changed', org: 'org-a' }))).toEqual({
      type: 'changed',
      org: 'org-a',
      topics: [],
    });
    expect(parseFrame(frame({ type: 'bye' }))).toEqual({ type: 'bye', reason: 'unknown' });
  });

  it('ramka nieznanego typu jest ignorowana, nie odrzucana - nowszy serwer nie psuje starszej aplikacji', () => {
    // Rozmowy zleceń przyjdą z ekranami zleceń (Z-C) - do tego czasu są ramką nieznaną.
    expect(parseFrame(frame({ v: 1, type: 'message', org: 'org-a', text: 'Czy lecimy?' }))).toEqual({
      type: 'ignored',
    });
    expect(parseFrame(frame({ v: 1, type: 'read', org: 'org-a' }))).toEqual({ type: 'ignored' });
    expect(parseFrame(frame({ v: 2, type: 'cos-nowego' }))).toEqual({ type: 'ignored' });
  });

  it('to, co nie jest obiektem JSON z napisem `type`, nie jest ramką', () => {
    expect(parseFrame('nie json')).toBeNull();
    expect(parseFrame('[1,2]')).toBeNull();
    expect(parseFrame('null')).toBeNull();
    expect(parseFrame('{"type":7}')).toBeNull();
  });
});
