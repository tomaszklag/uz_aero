import { describe, expect, it } from 'vitest';

import type { LiveFrame } from './frames';
import { LiveSocket, SILENCE_MS, type SocketLike, type Timers } from './liveSocket';
import { RECONNECT_BASE_MS } from './reconnect';

/** Gniazdo w pamięci - test steruje zdarzeniami, gniazdo zapisuje, co wysłano i zamknięto. */
class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((data: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: string[] = [];
  closed: number | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closed = code ?? 0;
  }

  openNow(): void {
    this.onopen?.();
  }

  receive(frame: object | string): void {
    this.onmessage?.(typeof frame === 'string' ? frame : JSON.stringify(frame));
  }

  drop(): void {
    this.onclose?.();
  }
}

/** Zegar w pamięci - odpala zaplanowane po opóźnieniu, którego test zażąda. */
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
    return [...this.pending.values()].map((p) => p.ms).sort((a, b) => a - b);
  }

  fire(ms: number): void {
    for (const [id, timer] of [...this.pending]) {
      if (timer.ms !== ms) continue;
      this.pending.delete(id);
      timer.fn();
    }
  }
}

function world() {
  const sockets: FakeSocket[] = [];
  const timers = new FakeTimers();
  const frames: LiveFrame[] = [];
  const opens: boolean[] = [];
  const byes: string[] = [];
  const live = new LiveSocket({
    url: 'ws://panel.test/admin/api/live',
    open: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    // Losowa połowa odstępu na górze - opóźnienie = sufit dla danej próby.
    random: () => 1,
    timers,
    onFrame: (frame) => frames.push(frame),
    onOpen: (reconnected) => opens.push(reconnected),
    onBye: (reason) => byes.push(reason),
  });
  return { live, sockets, timers, frames, opens, byes };
}

const CHANGED = { v: 1, type: 'changed', org: 'org-a', topics: ['attention'] };

describe('gniazdo kanału klubu w panelu', () => {
  it('odpowiada na ping, podaje dalej `changed` i `notification`, resztę pomija', () => {
    const { live, sockets, frames, opens } = world();
    live.start();
    live.start();
    expect(sockets).toHaveLength(1);
    const socket = sockets[0]!;
    socket.openNow();
    expect(opens).toEqual([false]);

    socket.receive({ v: 1, type: 'ping' });
    expect(socket.sent).toEqual(['{"type":"pong"}']);

    socket.receive({ v: 1, type: 'hello', session: 's1', serverTime: '2026-10-01T08:00:00.000Z' });
    socket.receive({ v: 1, type: 'message', org: 'org-a', text: 'Czy lecimy?' });
    socket.receive('nie json');
    socket.receive(CHANGED);
    socket.receive({ v: 1, type: 'notification', org: 'org-a', item: { id: 'n1' }, unread: 2 });
    expect(frames).toEqual([
      { type: 'changed', topics: ['attention'] },
      { type: 'notification', item: { id: 'n1' }, unread: 2 },
    ]);
  });

  it('zerwane połączenie wznawia się z rosnącym odstępem; udane zeruje licznik i mówi „wznowione"', () => {
    const { live, sockets, timers, opens } = world();
    live.start();
    sockets[0]!.openNow();
    sockets[0]!.drop();
    expect(timers.delays()).toEqual([RECONNECT_BASE_MS]);

    timers.fire(RECONNECT_BASE_MS);
    expect(sockets).toHaveLength(2);
    sockets[1]!.drop();
    expect(timers.delays()).toEqual([2 * RECONNECT_BASE_MS]);

    timers.fire(2 * RECONNECT_BASE_MS);
    sockets[2]!.openNow();
    expect(opens).toEqual([false, true]);
    sockets[2]!.drop();
    expect(timers.delays()).toEqual([RECONNECT_BASE_MS]);
  });

  it('`bye`: powód idzie dalej, gniazdo się zamyka i NIE wznawia', () => {
    const { live, sockets, timers, byes } = world();
    live.start();
    sockets[0]!.openNow();
    sockets[0]!.receive({ v: 1, type: 'bye', reason: 'session_revoked' });
    expect(byes).toEqual(['session_revoked']);
    expect(sockets[0]!.closed).toBe(1000);
    // Spóźnione zamknięcie od serwera niczego już nie planuje.
    sockets[0]!.drop();
    expect(timers.delays()).toEqual([]);
    expect(sockets).toHaveLength(1);
  });

  it('`stop` zamyka gniazdo bez wznowień; zdarzenia starego gniazda nic nie robią; `start` łączy od nowa', () => {
    const { live, sockets, timers, frames } = world();
    live.start();
    sockets[0]!.openNow();
    live.stop();
    expect(sockets[0]!.closed).toBe(1000);
    sockets[0]!.receive(CHANGED);
    sockets[0]!.drop();
    expect(frames).toEqual([]);
    expect(timers.delays()).toEqual([]);

    live.start();
    expect(sockets).toHaveLength(2);
  });

  it('minuta ciszy od serwera zamyka martwe połączenie i od razu planuje wznowienie', () => {
    const { live, sockets, timers } = world();
    live.start();
    sockets[0]!.openNow();
    expect(timers.delays()).toEqual([SILENCE_MS]);

    // Każda ramka od serwera odsuwa ciszę - zegar jest jeden.
    sockets[0]!.receive({ v: 1, type: 'ping' });
    expect(timers.delays()).toEqual([SILENCE_MS]);

    timers.fire(SILENCE_MS);
    expect(sockets[0]!.closed).toBe(1000);
    expect(timers.delays()).toEqual([RECONNECT_BASE_MS]);
    // Późne zamknięcie przez przeglądarkę nie dokłada drugiego wznowienia.
    sockets[0]!.drop();
    expect(timers.delays()).toEqual([RECONNECT_BASE_MS]);

    timers.fire(RECONNECT_BASE_MS);
    expect(sockets).toHaveLength(2);
  });
});
