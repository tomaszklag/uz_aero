/**
 * Ninerdeck - ZEGAR ODSTĘPÓW kanału klubu (4.0.0, epik KK-C #246).
 *
 * Łącze (wznowienia, cisza) i szyna (sklejanie sygnałów) planują rzeczy na później.
 * W produkcji robi to `setTimeout`, w testach zegar sterowany ręcznie - inaczej
 * test wznowienia musiałby czekać prawdziwe sekundy albo podmieniać zegar globalny.
 */

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const GLOBAL_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
