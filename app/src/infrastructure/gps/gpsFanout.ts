/**
 * UZ Aero — rozgałęźnik fixów GPS (jedno źródło, wielu odbiorców).
 *
 * Powód istnienia jest praktyczny i kosztował lot: odbiornik w telefonie jest JEDEN,
 * a chętnych na jego odczyty dwóch — kokpit (autodetekcja startu i lądowania) oraz
 * diagnostyka GPS na ekranie 13. Dopóki adapter trzymał pojedynczą subskrypcję
 * i pojedynczego słuchacza, wejście w ustawienia podmieniało słuchacza kokpitu na
 * swojego, a wyjście z ustawień gasiło subskrypcję do zera. Kokpit nie dostawał już
 * ani jednego fixa do końca dnia i — zgodnie z watchdogiem — pokazywał „GPS: brak
 * sygnału", którego nic nie potrafiło zdjąć.
 *
 * Stąd kontrakt: każde `start()` to WŁASNA subskrypcja odbiorcy. Źródło otwiera się
 * przy pierwszym i zamyka dopiero przy ostatnim — nikt nikomu nie zabiera GPS-a.
 */

import type { GpsFix } from '../../domain';
import type { GpsListener } from '../../application/ports';

export class GpsFanout {
  private readonly listeners = new Set<GpsListener>();

  /** Dopisuje odbiorcę. `true` = pierwszy, czyli trzeba otworzyć źródło. */
  add(listener: GpsListener): boolean {
    const wasEmpty = this.listeners.size === 0;
    this.listeners.add(listener);
    return wasEmpty;
  }

  /** Zdejmuje odbiorcę. `true` = było ostatnie, czyli można zamknąć źródło. */
  remove(listener: GpsListener): boolean {
    return this.listeners.delete(listener) && this.listeners.size === 0;
  }

  get empty(): boolean {
    return this.listeners.size === 0;
  }

  /**
   * Rozsyła fix. Kopia listy, bo odbiorca ma prawo wypisać się w reakcji na fix
   * (tak robi hook detekcji przy przełączeniu nasłuchu) — mutacja w trakcie
   * iteracji po żywym `Set` gubiłaby pozostałych.
   */
  emit(fix: GpsFix): void {
    for (const listener of [...this.listeners]) listener(fix);
  }
}
