/**
 * Ninerdeck (serwer) - REJESTR POŁĄCZEŃ KANAŁU KLUBU w pamięci procesu (4.0.0,
 * `docs/kanal-klubu.md` §3.1; epik Z-E #246).
 *
 * Jedna klasa, dwie role: `LivePort` (połączenia - kto jest, co mu wysłać, kogo zamknąć)
 * i `LiveSignalsPort` (sygnały, które ogłaszają komendy po commicie). Jedna instancja
 * serwera wystarcza (`docs/architektura-panelu-serwer.md` §8.8); druga instancja wymieni
 * tę klasę na adapter `LISTEN/NOTIFY`, a komendy nie zauważą różnicy.
 *
 * ══ ODBIORCÓW WYZNACZA SERWER (§2) ══
 * Klient niczego nie subskrybuje: ramka idzie do połączeń klubu `orgId`, które pasują do
 * któregokolwiek odbiorcy sygnału - cały klub, wymienione osoby albo posiadacze zdolności.
 * Zdolności są te z bramy w chwili nawiązania połączenia; kanał nie jest źródłem prawdy,
 * więc najgorszym skutkiem nieaktualnego zbioru jest sygnał „coś się zmieniło" do kogoś,
 * kto po odczycie REST i tak zobaczy wyłącznie to, co mu wolno.
 *
 * ══ NIC NIE RZUCA ══
 * Połączenie, które padło w trakcie wysyłki, jest po cichu odłączane, a pozostałe dostają
 * ramkę dalej. Wyjątek tutaj wracałby do komendy, która JUŻ zapisała swoją zmianę.
 */

import { changedFrame, messageFrame, readFrame } from '../../application/common/live/frames.ts';
import type {
  LiveAudience,
  LiveByeReason,
  LiveCloseScope,
  LiveFrame,
  LivePeer,
  LivePort,
  LiveSignalsPort,
  LiveSink,
} from '../../application/common/ports.ts';
import { can } from '../../domain/roles.ts';

interface Connection {
  peer: LivePeer;
  sink: LiveSink;
}

export class LiveRegistry implements LivePort, LiveSignalsPort {
  private readonly connections = new Map<number, Connection>();
  private nextId = 1;

  attach(peer: LivePeer, sink: LiveSink): () => void {
    const id = this.nextId++;
    this.connections.set(id, { peer, sink });
    return () => {
      this.connections.delete(id);
    };
  }

  isConnected(orgId: string, pilotId: string): boolean {
    for (const { peer } of this.connections.values()) {
      if (peer.orgId === orgId && peer.pilotId === pilotId) return true;
    }
    return false;
  }

  connectedSessions(orgId: string, pilotId: string): ReadonlySet<string> {
    const sessions = new Set<string>();
    for (const { peer } of this.connections.values()) {
      if (peer.orgId === orgId && peer.pilotId === pilotId && peer.sessionId != null) sessions.add(peer.sessionId);
    }
    return sessions;
  }

  sendToPerson(orgId: string, pilotId: string, frame: LiveFrame): number {
    let delivered = 0;
    for (const [id, connection] of [...this.connections]) {
      if (connection.peer.orgId !== orgId || connection.peer.pilotId !== pilotId) continue;
      if (this.deliver(id, connection, frame)) delivered += 1;
    }
    return delivered;
  }

  close(scope: LiveCloseScope, reason: LiveByeReason): void {
    for (const [id, connection] of [...this.connections]) {
      if (!inScope(connection.peer, scope)) continue;
      // Najpierw z rejestru: ramka wysłana w trakcie zamykania nie ma już dokąd iść.
      this.connections.delete(id);
      try {
        connection.sink.close(reason);
      } catch {
        // Połączenie zerwane wcześniej - zamykać nie ma czego.
      }
    }
  }

  changed(orgId: string, topics: readonly string[], audiences: readonly LiveAudience[]): void {
    if (topics.length === 0) return;
    this.broadcast(orgId, audiences, changedFrame(orgId, topics));
  }

  message(orgId: string, audiences: readonly LiveAudience[], frame: Record<string, unknown>): void {
    this.broadcast(orgId, audiences, messageFrame(orgId, frame));
  }

  read(orgId: string, audiences: readonly LiveAudience[], frame: Record<string, unknown>): void {
    this.broadcast(orgId, audiences, readFrame(orgId, frame));
  }

  private broadcast(orgId: string, audiences: readonly LiveAudience[], frame: LiveFrame): void {
    if (audiences.length === 0) return;
    for (const [id, connection] of [...this.connections]) {
      if (connection.peer.orgId !== orgId) continue;
      if (!audiences.some((audience) => reaches(audience, connection.peer))) continue;
      this.deliver(id, connection, frame);
    }
  }

  private deliver(id: number, connection: Connection, frame: LiveFrame): boolean {
    try {
      connection.sink.send(frame);
      return true;
    } catch {
      this.connections.delete(id);
      return false;
    }
  }
}

function reaches(audience: LiveAudience, peer: LivePeer): boolean {
  switch (audience.kind) {
    case 'club':
      return true;
    case 'people':
      return audience.pilotIds.includes(peer.pilotId);
    case 'capability':
      return can(peer.capabilities, audience.capability);
  }
}

function inScope(peer: LivePeer, scope: LiveCloseScope): boolean {
  switch (scope.kind) {
    case 'sessions':
      return peer.sessionId != null && scope.sessionIds.includes(peer.sessionId);
    case 'member':
      return peer.orgId === scope.orgId && peer.pilotId === scope.pilotId;
    case 'person':
      return peer.pilotId === scope.pilotId;
    case 'club':
      return peer.orgId === scope.orgId;
  }
}
