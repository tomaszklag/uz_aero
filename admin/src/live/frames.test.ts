import { describe, expect, it } from 'vitest';

import { parseFrame } from './frames';

describe('ramki kanału klubu', () => {
  it('rozpoznaje to, z czego panel korzysta', () => {
    expect(parseFrame('{"v":1,"type":"hello","session":"s1","serverTime":"2026-10-01T08:00:00.000Z"}')).toEqual({
      type: 'hello',
    });
    expect(parseFrame('{"v":1,"type":"ping"}')).toEqual({ type: 'ping' });
    expect(parseFrame('{"v":1,"type":"changed","org":"org-a","topics":["calendar:2026-10-03","attention"]}')).toEqual({
      type: 'changed',
      topics: ['calendar:2026-10-03', 'attention'],
    });
    expect(parseFrame('{"v":1,"type":"bye","reason":"session_revoked"}')).toEqual({
      type: 'bye',
      reason: 'session_revoked',
    });
    expect(parseFrame('{"v":1,"type":"notification","org":"org-a","item":{"id":"n1"},"unread":3}')).toEqual({
      type: 'notification',
      item: { id: 'n1' },
      unread: 3,
    });
  });

  it('ramka nieznanego typu jest ignorowana, nie odrzucana - nowszy serwer nie psuje starszego panelu', () => {
    expect(parseFrame('{"v":2,"type":"cos-nowego"}')).toEqual({ type: 'ignored' });
  });

  it('rozmowa w zleceniu: wiadomość w całości i odczyt drugiej strony, ze wskazaniem rozmowy', () => {
    const message = { id: 'm1', threadId: 't1', authorId: 'ako', body: 'Mogę od 10', createdAt: '2026-10-02T17:10:00.000Z' };
    expect(
      parseFrame(JSON.stringify({ v: 1, type: 'message', org: 'org-a', orderId: 'o1', recipientId: 'ako', message })),
    ).toEqual({
      type: 'message',
      orderId: 'o1',
      recipientId: 'ako',
      message: { id: 'm1', authorId: 'ako', body: 'Mogę od 10', createdAt: '2026-10-02T17:10:00.000Z' },
    });
    expect(
      parseFrame('{"v":1,"type":"read","org":"org-a","orderId":"o1","recipientId":"ako","pilotId":"mzi","at":"2026-10-03T05:41:00.000Z"}'),
    ).toEqual({ type: 'read', orderId: 'o1', recipientId: 'ako', pilotId: 'mzi', at: '2026-10-03T05:41:00.000Z' });
  });

  it('ramka rozmowy bez wskazania rozmowy albo z treścią spoza kształtu jest ignorowana', () => {
    expect(parseFrame('{"v":1,"type":"message","org":"org-a","text":"Czy lecimy?"}')).toEqual({ type: 'ignored' });
    expect(parseFrame('{"type":"message","orderId":"o1","recipientId":"ako","message":{"id":"m1"}}')).toEqual({ type: 'ignored' });
    expect(parseFrame('{"type":"read","orderId":"o1","recipientId":"ako"}')).toEqual({ type: 'ignored' });
  });

  it('to, co nie jest obiektem JSON z napisem `type`, nie jest ramką', () => {
    expect(parseFrame('nie json')).toBeNull();
    expect(parseFrame('[1,2]')).toBeNull();
    expect(parseFrame('null')).toBeNull();
    expect(parseFrame('{"type":7}')).toBeNull();
  });

  it('pola obce w znanej ramce nie przechodzą dalej; tematy tylko napisami', () => {
    expect(parseFrame('{"type":"changed","topics":["booking:b1",7,null]}')).toEqual({
      type: 'changed',
      topics: ['booking:b1'],
    });
    expect(parseFrame('{"type":"changed"}')).toEqual({ type: 'changed', topics: [] });
    expect(parseFrame('{"type":"bye"}')).toEqual({ type: 'bye', reason: 'unknown' });
  });
});
