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
import { GpsFanout } from './gpsFanout';

export interface ReplayOptions {
  /**
   * Tempo odtwarzania: ile realnych ms między fixami. `0` = natychmiast (testy),
   * 1000 = wiernie, sekunda po sekundzie (podgląd na urządzeniu).
   */
  intervalMs?: number;
}

export class ReplayGpsAdapter implements GpsPort {
  private readonly fanout = new GpsFanout();
  private last: GpsFix | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly fixes: readonly GpsFix[],
    private readonly options: ReplayOptions = {},
  ) {}

  async requestPermission(): Promise<GpsPermission> {
    return 'granted';
  }

  /**
   * Jak w adapterze urządzenia: każde wywołanie to własna subskrypcja odbiorcy.
   * Odtwarzanie rusza z pierwszym słuchaczem i gaśnie z ostatnim — kto dołączy
   * w trakcie, słyszy resztę serii, bo jeden odbiornik nie odtwarza trasy od nowa
   * osobno dla każdego ekranu.
   */
  async start(listener: GpsListener): Promise<() => void> {
    if (this.fanout.add(listener)) this.play();
    return () => {
      if (this.fanout.remove(listener)) this.stop();
    };
  }

  lastFix(): GpsFix | null {
    return this.last;
  }

  private play(): void {
    const interval = this.options.intervalMs ?? 0;
    let index = 0;

    const emit = () => {
      if (index >= this.fixes.length) return;
      const fix = this.fixes[index++];
      this.last = fix;
      this.fanout.emit(fix);
      if (index < this.fixes.length) {
        this.timer = setTimeout(emit, interval);
      }
    };

    if (interval === 0) {
      // Bez opóźnień: cała seria synchronicznie — deterministyczne w testach.
      for (const fix of this.fixes) {
        this.last = fix;
        this.fanout.emit(fix);
      }
    } else {
      emit();
    }
  }

  private stop(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
  }
}
