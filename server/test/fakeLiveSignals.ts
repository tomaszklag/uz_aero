/**
 * Ninerdeck (serwer) - atrapa kanału klubu, która ZAPISUJE sygnały (4.0.0, issue #245).
 *
 * Kto ma dostać który temat, rozstrzygają komendy - i o to pytają testy. Atrapa trzyma
 * wywołania w kolejności, w jakiej padły, a podana `inner` (prawdziwy rejestr połączeń,
 * epik Z-E #246) dostaje każde dalej: testy tras WebSocket sprawdzają ramki, które
 * naprawdę doszły, na tym samym harnessie.
 */

import { ClubSignals } from '../src/application/common/notify/clubSignals.ts';
import type { Database, LiveAudience, LiveSignalsPort } from '../src/application/common/ports.ts';
import { PgClubSettingsRepo } from '../src/infrastructure/pg/common/clubSettingsRepo.ts';
import { PgSessionsProjection } from '../src/infrastructure/pg/common/sessionsProjection.ts';

export interface RecordedSignal {
  kind: 'changed' | 'message' | 'read';
  orgId: string;
  topics: readonly string[];
  audiences: readonly LiveAudience[];
  frame: Record<string, unknown> | null;
}

export class FakeLiveSignals implements LiveSignalsPort {
  readonly signals: RecordedSignal[] = [];

  constructor(private readonly inner: LiveSignalsPort | null = null) {}

  changed(orgId: string, topics: readonly string[], audiences: readonly LiveAudience[]): void {
    this.signals.push({ kind: 'changed', orgId, topics, audiences, frame: null });
    this.inner?.changed(orgId, topics, audiences);
  }

  message(orgId: string, audiences: readonly LiveAudience[], frame: Record<string, unknown>): void {
    this.signals.push({ kind: 'message', orgId, topics: [], audiences, frame });
    this.inner?.message(orgId, audiences, frame);
  }

  read(orgId: string, audiences: readonly LiveAudience[], frame: Record<string, unknown>): void {
    this.signals.push({ kind: 'read', orgId, topics: [], audiences, frame });
    this.inner?.read(orgId, audiences, frame);
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

/**
 * Sygnały zmian klubu na atrapie, która tylko zapisuje - dla testów, które składają
 * komendy wprost (zegar rezerwacji, ścieżka zgód) i o kanał klubu nie pytają.
 */
export function silentClubSignals(db: Database): ClubSignals {
  return new ClubSignals(new FakeLiveSignals(), db, new PgClubSettingsRepo(), new PgSessionsProjection());
}
