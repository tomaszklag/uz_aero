/**
 * Ninerdeck (serwer) - rejestr połączeń kanału klubu (4.0.0, `docs/kanal-klubu.md` §3.1,
 * §5; epik Z-E #246).
 *
 * Najważniejsze własności: ramka idzie WYŁĄCZNIE do połączeń klubu, którego dotyczy -
 * osoba połączona w innym klubie jej nie dostaje (§5); odbiorców wyznacza serwer (cały
 * klub, osoby, posiadacze zdolności); połączenie zerwane w trakcie wysyłki odpada po
 * cichu, a reszta dostaje ramkę dalej; zamknięcie z powodem trafia dokładnie w zakres.
 */

import { describe, expect, it } from 'vitest';

import type { LiveByeReason, LiveFrame, LivePeer, LiveSink } from '../src/application/common/ports.ts';
import { LiveRegistry } from '../src/infrastructure/live/liveRegistry.ts';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

class FakeSink implements LiveSink {
  readonly frames: LiveFrame[] = [];
  closed: LiveByeReason | null = null;

  constructor(private readonly broken = false) {}

  send(frame: LiveFrame): void {
    if (this.broken) throw new Error('połączenie zerwane');
    this.frames.push(frame);
  }

  close(reason: LiveByeReason): void {
    this.closed = reason;
  }
}

const peer = (over: Partial<LivePeer> & Pick<LivePeer, 'pilotId'>): LivePeer => ({
  orgId: ORG_A,
  sessionId: `sid-${over.pilotId}`,
  surface: 'mobile',
  capabilities: [],
  ...over,
});

/** Trzy osoby w Alfie i PWI także w Becie - ta sama osoba, dwa kluby, dwie sesje. */
function world() {
  const live = new LiveRegistry();
  const sinks = {
    ako: new FakeSink(),
    pwiA: new FakeSink(),
    krz: new FakeSink(),
    pwiB: new FakeSink(),
  };
  live.attach(peer({ pilotId: 'AKO', surface: 'panel', capabilities: ['panel.access', 'reservations.manage'] }), sinks.ako);
  live.attach(peer({ pilotId: 'PWI' }), sinks.pwiA);
  live.attach(peer({ pilotId: 'KRZ', capabilities: ['fleet.watch'] }), sinks.krz);
  live.attach(peer({ pilotId: 'PWI', orgId: ORG_B, sessionId: 'sid-PWB' }), sinks.pwiB);
  return { live, sinks };
}

describe('rejestr połączeń kanału klubu', () => {
  it('`changed` do całego klubu dochodzi wyłącznie do połączeń TEGO klubu', () => {
    const { live, sinks } = world();
    live.changed(ORG_A, ['calendar:2026-06-24'], [{ kind: 'club' }]);

    expect(sinks.ako.frames).toEqual([{ v: 1, type: 'changed', org: ORG_A, topics: ['calendar:2026-06-24'] }]);
    expect(sinks.pwiA.frames).toHaveLength(1);
    expect(sinks.krz.frames).toHaveLength(1);
    // Ta sama osoba połączona w Becie - ramka Alfy do niej nie idzie (§5).
    expect(sinks.pwiB.frames).toEqual([]);
  });

  it('osoby i posiadacze zdolności; kilku odbiorców naraz to wciąż JEDNA ramka na połączenie', () => {
    const { live, sinks } = world();
    live.changed(ORG_A, ['order:o-1'], [{ kind: 'people', pilotIds: ['PWI'] }]);
    expect(sinks.pwiA.frames).toHaveLength(1);
    expect(sinks.pwiB.frames).toEqual([]);
    expect(sinks.ako.frames).toEqual([]);

    live.changed(ORG_A, ['aircraft:SP-AXA'], [{ kind: 'capability', capability: 'fleet.watch' }]);
    expect(sinks.krz.frames.map((f) => f.topics)).toEqual([['aircraft:SP-AXA']]);
    expect(sinks.ako.frames).toEqual([]);

    live.changed(
      ORG_A,
      ['order:o-2'],
      [
        { kind: 'people', pilotIds: ['AKO', 'PWI'] },
        { kind: 'capability', capability: 'reservations.manage' },
      ],
    );
    expect(sinks.ako.frames).toHaveLength(1);
  });

  it('`message` i `read` jadą w kopercie, której treść nie przestawi rodzaju ani klubu', () => {
    const { live, sinks } = world();
    live.message(ORG_A, [{ kind: 'people', pilotIds: ['PWI'] }], { orderId: 'o-1', type: 'changed', org: ORG_B });
    live.read(ORG_A, [{ kind: 'people', pilotIds: ['PWI'] }], { orderId: 'o-1', pilotId: 'AKO' });

    expect(sinks.pwiA.frames).toEqual([
      { orderId: 'o-1', v: 1, type: 'message', org: ORG_A },
      { orderId: 'o-1', pilotId: 'AKO', v: 1, type: 'read', org: ORG_A },
    ]);
  });

  it('bez tematów albo bez odbiorców nie wychodzi nic', () => {
    const { live, sinks } = world();
    live.changed(ORG_A, [], [{ kind: 'club' }]);
    live.changed(ORG_A, ['attention'], []);
    expect(Object.values(sinks).flatMap((s) => s.frames)).toEqual([]);
  });

  it('sesje połączone liczą się W KLUBIE; osoba bez sesji niczego nie wycisza', () => {
    const { live } = world();
    expect([...live.connectedSessions(ORG_A, 'PWI')]).toEqual(['sid-PWI']);
    expect([...live.connectedSessions(ORG_B, 'PWI')]).toEqual(['sid-PWB']);
    expect([...live.connectedSessions(ORG_A, 'JSE')]).toEqual([]);

    live.attach(peer({ pilotId: 'JSE', sessionId: null }), new FakeSink());
    expect([...live.connectedSessions(ORG_A, 'JSE')]).toEqual([]);
  });

  it('połączenie liczy się W KLUBIE - także bez sesji logowania (rozdzielnik pyta o to przed ramką)', () => {
    const { live } = world();
    expect(live.isConnected(ORG_A, 'PWI')).toBe(true);
    expect(live.isConnected(ORG_B, 'PWI')).toBe(true);
    expect(live.isConnected(ORG_B, 'KRZ')).toBe(false);
    expect(live.isConnected(ORG_A, 'JSE')).toBe(false);

    // Token sprzed 2.1.0 nie niesie sesji: niczego nie wycisza, ale ramkę dostaje.
    live.attach(peer({ pilotId: 'JSE', sessionId: null }), new FakeSink());
    expect(live.isConnected(ORG_A, 'JSE')).toBe(true);
  });

  it('ramka do osoby idzie na każde jej połączenie w klubie - i mówi, ile ich było', () => {
    const { live, sinks } = world();
    const tablet = new FakeSink();
    live.attach(peer({ pilotId: 'PWI', sessionId: 'sid-tablet' }), tablet);

    const frame: LiveFrame = { v: 1, type: 'notification', org: ORG_A };
    expect(live.sendToPerson(ORG_A, 'PWI', frame)).toBe(2);
    expect(sinks.pwiA.frames).toEqual([frame]);
    expect(tablet.frames).toEqual([frame]);
    expect(sinks.pwiB.frames).toEqual([]);
    expect(live.sendToPerson(ORG_A, 'JSE', frame)).toBe(0);
  });

  it('zamknięcie trafia dokładnie w zakres, a zamknięte połączenie nie dostaje już ramek', () => {
    const { live, sinks } = world();
    live.close({ kind: 'member', orgId: ORG_A, pilotId: 'PWI' }, 'membership_disabled');
    expect(sinks.pwiA.closed).toBe('membership_disabled');
    expect(sinks.pwiB.closed).toBeNull();

    live.close({ kind: 'sessions', sessionIds: ['sid-KRZ'] }, 'session_revoked');
    expect(sinks.krz.closed).toBe('session_revoked');

    live.changed(ORG_A, ['attention'], [{ kind: 'club' }]);
    expect(sinks.pwiA.frames).toEqual([]);
    expect(sinks.krz.frames).toEqual([]);
    expect(sinks.ako.frames).toHaveLength(1);
    expect([...live.connectedSessions(ORG_A, 'PWI')]).toEqual([]);

    live.close({ kind: 'club', orgId: ORG_A }, 'membership_disabled');
    expect(sinks.ako.closed).toBe('membership_disabled');
    expect(sinks.pwiB.closed).toBeNull();
    live.close({ kind: 'person', pilotId: 'PWI' }, 'membership_disabled');
    expect(sinks.pwiB.closed).toBe('membership_disabled');
  });

  it('połączenie zerwane w trakcie wysyłki odpada po cichu, a reszta dostaje ramkę', () => {
    const live = new LiveRegistry();
    const broken = new FakeSink(true);
    const healthy = new FakeSink();
    live.attach(peer({ pilotId: 'PWI' }), broken);
    live.attach(peer({ pilotId: 'KRZ' }), healthy);

    expect(() => live.changed(ORG_A, ['attention'], [{ kind: 'club' }])).not.toThrow();
    expect(healthy.frames).toHaveLength(1);
    expect([...live.connectedSessions(ORG_A, 'PWI')]).toEqual([]);
  });

  it('odłączenie kończy połączenie w rejestrze', () => {
    const live = new LiveRegistry();
    const sink = new FakeSink();
    const detach = live.attach(peer({ pilotId: 'PWI' }), sink);
    detach();
    live.changed(ORG_A, ['attention'], [{ kind: 'club' }]);
    expect(sink.frames).toEqual([]);
    expect([...live.connectedSessions(ORG_A, 'PWI')]).toEqual([]);
  });
});
