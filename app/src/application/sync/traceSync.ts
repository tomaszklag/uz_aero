/**
 * UZ Aero — wysyłka śladu kalibracyjnego (faza 5).
 *
 * Osobny, NISKOPRIORYTETOWY tor obok outboxa zdarzeń: pętla okazji woła go na końcu
 * przebiegu (po zdarzeniach i cache referencyjnym), jedna paczka na okazję — ślad
 * nigdzie się nie śpieszy, a nie wolno mu konkurować o łącze z rejestrem dnia.
 *
 * Księgowość jak w outboksie: wysłane wpisy dostają `uploadedAt`; brak odpowiedzi
 * = wpisy zostają i czekają na następną okazję (`authorizedFetch` zwija offline
 * i odmowy do `null`).
 */

import type { AuthService } from '../auth/authService';
import type { ServerPort, TracePort } from '../ports';
import { authorizedFetch } from './authorizedFetch';

/** Paczka wysyłki — ~2000 wpisów ≈ 200 KB JSON; poniżej limitu koperty serwera. */
export const TRACE_BATCH_LIMIT = 2000;

export class TraceSync {
  constructor(
    private readonly store: TracePort,
    private readonly server: ServerPort,
    private readonly auth: AuthService,
  ) {}

  /** Jedna paczka na okazję. Zwraca liczbę wysłanych (0 = nic do wysłania / offline). */
  async uploadOnce(): Promise<number> {
    const batch = await this.store.getTraceBatch(TRACE_BATCH_LIMIT);
    if (batch.length === 0) return 0;

    const wire = batch.map(({ id: _local, uploadedAt: _up, ...entry }) => entry);
    const result = await authorizedFetch(this.auth, (token) =>
      this.server.pushTraces(token, wire),
    );
    if (result == null) return 0;

    await this.store.markTraceUploaded(
      batch.map((e) => e.id),
      Date.now(),
    );
    return batch.length;
  }
}
