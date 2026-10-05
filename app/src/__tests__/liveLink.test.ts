/**
 * Ninerdeck - testy ŁĄCZA KANAŁU KLUBU (`application/live/liveLink.ts`; 4.0.0,
 * epik KK-C #246).
 *
 * Gniazdo, zegar i serwis poświadczeń są w pamięci - test steruje zdarzeniami
 * i sprawdza, co łącze wysłało, zamknęło, zaplanowało i komu co podało. Pod obserwacją:
 * uwierzytelnienie pierwszą ramką, odpowiedź na ping, ramki wyłącznie własnego klubu,
 * wznowienie z rosnącym odstępem, cisza, odświeżenie tokenów po `bye` (wygaśnięcie,
 * zerwana sesja, odmowa świeżego tokenu, brak sieci) i spóźnione zdarzenia po `stop`.
 */

import type { LiveDataFrame } from '../application/live/frames';
import { LiveLink, SILENCE_MS, type LiveAuth, type Timers } from '../application/live/liveLink';
import { RECONNECT_BASE_MS } from '../application/live/reconnect';
import type { LiveConnection } from '../application/ports';

const URL = 'wss://app.test/live';

/** Gniazdo w pamięci - test steruje zdarzeniami, gniazdo zapisuje, co wysłano i zamknięto. */
class FakeConnection implements LiveConnection {
  onopen: (() => void) | null = null;
  onmessage: ((data: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: unknown[] = [];
  closed: number | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data));
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

/**
 * Serwis poświadczeń w pamięci. `rotations` mówi, co zwrócą kolejne odświeżenia:
 * nowy token, `null` (odmowa) albo `'offline'` (brak sieci - wyjątek, jak w `AuthService`).
 */
class FakeAuth implements LiveAuth {
  token: string | null = 'jwt-1';
  revokedFlag = false;
  rotations: Array<string | null | 'offline'> = [];
  rotateCalls = 0;
  revokedCalls = 0;

  async freshToken(): Promise<string | null> {
    return this.token;
  }

  async rotate(): Promise<string | null> {
    this.rotateCalls += 1;
    const next = this.rotations.shift() ?? null;
    if (next === 'offline') throw new Error('brak sieci');
    if (next != null) this.token = next;
    return next;
  }

  async revoked(): Promise<boolean> {
    this.revokedCalls += 1;
    return this.revokedFlag;
  }
}

/** Do dna kolejki obietnic - łącze czeka na serwis poświadczeń asynchronicznie. */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function world() {
  const sockets: FakeConnection[] = [];
  const timers = new FakeTimers();
  const auth = new FakeAuth();
  const frames: LiveDataFrame[] = [];
  const opens: boolean[] = [];
  let revoked = 0;
  const link = new LiveLink({
    url: URL,
    auth,
    sockets: {
      open: (url) => {
        const socket = new FakeConnection(url);
        sockets.push(socket);
        return socket;
      },
    },
    // Losowa połowa odstępu na górze - opóźnienie = sufit dla danej próby.
    random: () => 1,
    timers,
    onFrame: (frame) => frames.push(frame),
    onOpen: (reconnected) => opens.push(reconnected),
    onRevoked: () => {
      revoked += 1;
    },
  });
  return { link, sockets, timers, auth, frames, opens, revoked: () => revoked };
}

const HELLO = { v: 1, type: 'hello', session: 's1', serverTime: '2026-10-05T08:00:00.000Z' };
const changed = (org: string) => ({ v: 1, type: 'changed', org, topics: ['calendar:2026-10-05'] });

/** Łącze otwarte i uwierzytelnione dla klubu `org-a` - punkt wyjścia większości testów. */
async function connected() {
  const w = world();
  w.link.start('org-a');
  await flush();
  w.sockets[0]!.openNow();
  w.sockets[0]!.receive(HELLO);
  return w;
}

describe('łącze kanału klubu w aplikacji pilota', () => {
  it('uwierzytelnia się PIERWSZĄ ramką z tokenem klubu - token nigdy nie trafia do adresu', async () => {
    const { link, sockets, opens } = world();
    link.start('org-a');
    await flush();
    expect(sockets.map((s) => s.url)).toEqual([URL]);

    sockets[0]!.openNow();
    expect(sockets[0]!.sent).toEqual([{ type: 'auth', token: 'jwt-1' }]);
    // Połączenie liczy się dopiero po powitaniu - wcześniej serwer jeszcze nie wpuścił.
    expect(opens).toEqual([]);
    sockets[0]!.receive(HELLO);
    expect(opens).toEqual([false]);
  });

  it('odpowiada na ping; podaje dalej `changed` i `notification` WYŁĄCZNIE swojego klubu', async () => {
    const { sockets, frames } = await connected();
    const socket = sockets[0]!;

    socket.receive({ v: 1, type: 'ping' });
    expect(socket.sent).toEqual([{ type: 'auth', token: 'jwt-1' }, { type: 'pong' }]);

    socket.receive(changed('org-b'));
    socket.receive({ v: 1, type: 'changed', topics: ['orders'] });
    socket.receive({ v: 1, type: 'message', org: 'org-a', text: 'Czy lecimy?' });
    socket.receive('nie json');
    socket.receive(changed('org-a'));
    socket.receive({ v: 1, type: 'notification', org: 'org-a', unread: 2 });
    expect(frames).toEqual([
      { type: 'changed', org: 'org-a', topics: ['calendar:2026-10-05'] },
      { type: 'notification', org: 'org-a', item: null, unread: 2 },
    ]);
  });

  it('`start` dla tego samego klubu nic nie robi; dla innego - łączy od nowa i podaje tylko jego ramki', async () => {
    const { link, sockets, frames } = await connected();
    link.start('org-a');
    await flush();
    expect(sockets).toHaveLength(1);

    link.start('org-b');
    await flush();
    expect(sockets[0]!.closed).toBe(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.openNow();
    sockets[1]!.receive(HELLO);
    sockets[1]!.receive(changed('org-a'));
    sockets[1]!.receive(changed('org-b'));
    expect(frames).toEqual([{ type: 'changed', org: 'org-b', topics: ['calendar:2026-10-05'] }]);
  });

  it('zerwane połączenie wznawia się z rosnącym odstępem; powitanie zeruje licznik i mówi „wznowione"', async () => {
    const { sockets, timers, opens } = await connected();
    sockets[0]!.drop();
    expect(timers.delays()).toEqual([RECONNECT_BASE_MS]);

    timers.fire(RECONNECT_BASE_MS);
    await flush();
    expect(sockets).toHaveLength(2);
    sockets[1]!.drop();
    expect(timers.delays()).toEqual([2 * RECONNECT_BASE_MS]);

    timers.fire(2 * RECONNECT_BASE_MS);
    await flush();
    sockets[2]!.openNow();
    sockets[2]!.receive(HELLO);
    expect(opens).toEqual([false, true]);
    sockets[2]!.drop();
    expect(timers.delays()).toEqual([RECONNECT_BASE_MS]);
  });

  it('minuta ciszy zamyka martwe połączenie i od razu planuje wznowienie', async () => {
    const { sockets, timers } = await connected();
    expect(timers.delays()).toEqual([SILENCE_MS]);

    // Każda ramka od serwera odsuwa ciszę - zegar jest jeden.
    sockets[0]!.receive({ v: 1, type: 'ping' });
    expect(timers.delays()).toEqual([SILENCE_MS]);

    timers.fire(SILENCE_MS);
    expect(sockets[0]!.closed).toBe(1000);
    expect(timers.delays()).toEqual([RECONNECT_BASE_MS]);
    // Późne zamknięcie przez system nie dokłada drugiego wznowienia.
    sockets[0]!.drop();
    expect(timers.delays()).toEqual([RECONNECT_BASE_MS]);
  });

  it('serwer, który nie wita po otwarciu, też jest ciszą - łącze nie wisi na pół otwartym gnieździe', async () => {
    const { link, sockets, timers } = world();
    link.start('org-a');
    await flush();
    sockets[0]!.openNow();
    expect(timers.delays()).toEqual([SILENCE_MS]);
    timers.fire(SILENCE_MS);
    expect(sockets[0]!.closed).toBe(1000);
    expect(timers.delays()).toEqual([RECONNECT_BASE_MS]);
  });

  it('`bye token_expired` → nowa para tokenów i od razu ponowne połączenie świeżym tokenem', async () => {
    const { sockets, timers, auth, opens } = await connected();
    auth.rotations = ['jwt-2'];
    sockets[0]!.receive({ v: 1, type: 'bye', reason: 'token_expired' });
    expect(sockets[0]!.closed).toBe(1000);
    await flush();

    expect(auth.rotateCalls).toBe(1);
    expect(sockets).toHaveLength(2);
    expect(timers.delays()).toEqual([]);
    sockets[1]!.openNow();
    expect(sockets[1]!.sent).toEqual([{ type: 'auth', token: 'jwt-2' }]);
    sockets[1]!.receive(HELLO);
    expect(opens).toEqual([false, true]);
    // Spóźnione zamknięcie starego gniazda niczego już nie planuje.
    sockets[0]!.drop();
    expect(timers.delays()).toEqual([SILENCE_MS]);
  });

  it('`bye session_revoked` → odświeżenie odmawia, łącze melduje zdalne wylogowanie i staje', async () => {
    const { sockets, timers, auth, revoked } = await connected();
    // Znacznik stawia samo odświeżenie (`AuthService.rotate`) - łącze go tylko czyta.
    auth.rotations = [null];
    auth.revokedFlag = true;
    sockets[0]!.receive({ v: 1, type: 'bye', reason: 'session_revoked' });
    await flush();

    expect(revoked()).toBe(1);
    expect(sockets).toHaveLength(1);
    expect(timers.delays()).toEqual([]);
  });

  it('odmowa odświeżenia bez zerwanej sesji (członkostwo wyłączone) → łącze staje bez meldunku', async () => {
    const { sockets, timers, auth, revoked } = await connected();
    auth.rotations = [null];
    sockets[0]!.receive({ v: 1, type: 'bye', reason: 'membership_disabled' });
    await flush();

    expect(auth.revokedCalls).toBe(1);
    expect(revoked()).toBe(0);
    expect(sockets).toHaveLength(1);
    expect(timers.delays()).toEqual([]);
  });

  it('świeży token odrzucony przed powitaniem nie kręci się w kółko - drugiego odświeżenia nie ma', async () => {
    const { sockets, timers, auth } = await connected();
    auth.rotations = ['jwt-2', 'jwt-3'];
    sockets[0]!.receive({ v: 1, type: 'bye', reason: 'token_expired' });
    await flush();
    sockets[1]!.openNow();
    sockets[1]!.receive({ v: 1, type: 'bye', reason: 'token_expired' });
    await flush();

    expect(auth.rotateCalls).toBe(1);
    expect(sockets).toHaveLength(2);
    expect(timers.delays()).toEqual([]);
  });

  it('brak sieci przy odświeżeniu → wznowienie później, nie koniec łączenia', async () => {
    const { sockets, timers, auth } = await connected();
    auth.rotations = ['offline'];
    sockets[0]!.receive({ v: 1, type: 'bye', reason: 'token_expired' });
    await flush();
    expect(timers.delays()).toEqual([RECONNECT_BASE_MS]);

    timers.fire(RECONNECT_BASE_MS);
    await flush();
    expect(sockets).toHaveLength(2);
  });

  it('bez poświadczeń łącze nie otwiera gniazda i niczego nie planuje', async () => {
    const { link, sockets, timers, auth } = world();
    auth.token = null;
    link.start('org-a');
    await flush();
    expect(sockets).toEqual([]);
    expect(timers.delays()).toEqual([]);
  });

  it('`stop` zamyka bez wznowień; zdarzenia starego gniazda nic nie robią; `start` łączy od nowa', async () => {
    const { link, sockets, timers, frames } = await connected();
    link.stop();
    expect(sockets[0]!.closed).toBe(1000);
    sockets[0]!.receive(changed('org-a'));
    sockets[0]!.drop();
    expect(frames).toEqual([]);
    expect(timers.delays()).toEqual([]);

    link.start('org-a');
    await flush();
    expect(sockets).toHaveLength(2);
  });

  it('`stop` w trakcie czytania tokenu albo odświeżania go nie otwiera gniazda po fakcie', async () => {
    const w = world();
    w.link.start('org-a');
    w.link.stop();
    await flush();
    expect(w.sockets).toEqual([]);

    const { link, sockets, timers, auth } = await connected();
    auth.rotations = ['jwt-2'];
    sockets[0]!.receive({ v: 1, type: 'bye', reason: 'token_expired' });
    link.stop();
    await flush();
    expect(sockets).toHaveLength(1);
    expect(timers.delays()).toEqual([]);
  });
});
