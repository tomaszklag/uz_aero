/**
 * Ninerdeck (serwer) - atrapa kanału klubu, która ZAPISUJE sygnały (4.0.0, issue #245).
 *
 * Rozsyłanie przychodzi z Z-E (#246), ale kto ma dostać który temat, rozstrzyga już
 * Z-B - i o to pytają testy. Atrapa trzyma wywołania w kolejności, w jakiej padły.
 */

import type { LiveAudience, LiveSignalsPort } from '../src/application/common/ports.ts';

export interface RecordedSignal {
  kind: 'changed' | 'message' | 'read';
  orgId: string;
  topics: readonly string[];
  audiences: readonly LiveAudience[];
  frame: Record<string, unknown> | null;
}

export class FakeLiveSignals implements LiveSignalsPort {
  readonly signals: RecordedSignal[] = [];

  changed(orgId: string, topics: readonly string[], audiences: readonly LiveAudience[]): void {
    this.signals.push({ kind: 'changed', orgId, topics, audiences, frame: null });
  }

  message(orgId: string, audiences: readonly LiveAudience[], frame: Record<string, unknown>): void {
    this.signals.push({ kind: 'message', orgId, topics: [], audiences, frame });
  }

  read(orgId: string, audiences: readonly LiveAudience[], frame: Record<string, unknown>): void {
    this.signals.push({ kind: 'read', orgId, topics: [], audiences, frame });
  }

  /** Osoby z pierwszego adresowania „people" sygnału o danym temacie. */
  peopleFor(topic: string): string[] {
    const signal = [...this.signals].reverse().find((s) => s.topics.includes(topic));
    const people = signal?.audiences.find((a) => a.kind === 'people');
    return people?.kind === 'people' ? [...people.pilotIds].sort() : [];
  }

  clear(): void {
    this.signals.length = 0;
  }
}
