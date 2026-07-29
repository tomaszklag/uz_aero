/**
 * UZ Aero — rejestrator śladu kalibracyjnego (faza 5).
 *
 * ZAWSZE WŁĄCZONY przy pracującym silniku (decyzja 2026-07-29): anomalia z definicji
 * jest nieplanowana — przełącznik gwarantowałby, że najciekawszy lot będzie
 * niezapisany. Koszt: ~30 tys. wierszy/dzień ≈ 3 MB, bateria zero (subskrypcja GPS
 * i tak działa dla detekcji).
 *
 * Zapis jest fire-and-forget i NIE MOŻE przeszkodzić lotowi: każdy błąd magazynu
 * jest połykany — ślad to materiał badawczy, nie rejestr. Retencję (`purge`) woła
 * composition root przy starcie.
 */

import type { GpsFix } from '../domain';
import type { ClockPort, TracePort } from './ports';

/** Retencja śladu — po tylu dniach wpisy znikają przy starcie aplikacji. */
export const TRACE_RETENTION_DAYS = 14;

export class TraceRecorder {
  constructor(
    private readonly store: TracePort,
    private readonly clock: ClockPort,
  ) {}

  /** Surowy fix — SPRZED kwarantanny jakości (śmieci to najcenniejszy materiał). */
  fix(fix: GpsFix, sessionUuid: string | null): void {
    void this.store
      .appendTrace({
        sessionUuid,
        kind: 'fix',
        time: fix.time,
        deviceTime: this.clock.now(),
        gs: fix.groundSpeedKt,
        alt: fix.altitudeFt,
        lat: fix.lat ?? null,
        lon: fix.lon ?? null,
        accuracyM: fix.accuracyM ?? null,
        detail: null,
      })
      .catch(() => {});
  }

  /**
   * Marker pracy detektora: `detection` (toast pokazany) i `undo` (COFNIJ).
   * Para „detection bez commitu w rejestrze" + `undo` = fałszywa detekcja
   * oznaczona przez pilota — sedno materiału kalibracyjnego.
   */
  marker(kind: 'detection' | 'undo', detail: string, at: number, sessionUuid: string | null): void {
    void this.store
      .appendTrace({
        sessionUuid,
        kind,
        time: at,
        deviceTime: this.clock.now(),
        gs: null,
        alt: null,
        lat: null,
        lon: null,
        accuracyM: null,
        detail,
      })
      .catch(() => {});
  }

  /** Retencja przy starcie aplikacji. */
  purgeExpired(): Promise<number> {
    return this.store.purgeTraceOlderThan(this.clock.now() - TRACE_RETENTION_DAYS * 86_400_000);
  }

  stats() {
    return this.store.traceStats();
  }
}
