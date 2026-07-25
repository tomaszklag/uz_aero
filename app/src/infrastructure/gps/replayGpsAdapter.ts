/**
 * UZ Aero — adapter GPS odtwarzający zadaną serię fixów.
 *
 * Po co: pozwala przejść cały lot — start, zrzut, lądowanie — bez samolotu i bez
 * czekania w czasie rzeczywistym. Używany w testach oraz do ręcznego sprawdzenia
 * detekcji na urządzeniu (podstawiony zamiast `ExpoLocationAdapter`).
 *
 * Nie dotyka modułów natywnych, więc może żyć w barrelu infrastruktury.
 */

import type { GpsFix } from '../../domain';
import type { GpsListener, GpsPermission, GpsPort } from '../../application/ports';

export interface ReplayOptions {
  /**
   * Tempo odtwarzania: ile realnych ms między fixami. `0` = natychmiast (testy),
   * 1000 = wiernie, sekunda po sekundzie (podgląd na urządzeniu).
   */
  intervalMs?: number;
}

export class ReplayGpsAdapter implements GpsPort {
  private last: GpsFix | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly fixes: readonly GpsFix[],
    private readonly options: ReplayOptions = {},
  ) {}

  async requestPermission(): Promise<GpsPermission> {
    return 'granted';
  }

  async start(listener: GpsListener): Promise<() => void> {
    this.stop();
    const interval = this.options.intervalMs ?? 0;
    let index = 0;

    const emit = () => {
      if (index >= this.fixes.length) return;
      const fix = this.fixes[index++];
      this.last = fix;
      listener(fix);
      if (index < this.fixes.length) {
        this.timer = setTimeout(emit, interval);
      }
    };

    if (interval === 0) {
      // Bez opóźnień: cała seria synchronicznie — deterministyczne w testach.
      for (const fix of this.fixes) {
        this.last = fix;
        listener(fix);
      }
    } else {
      emit();
    }

    return () => this.stop();
  }

  lastFix(): GpsFix | null {
    return this.last;
  }

  private stop(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
  }
}
