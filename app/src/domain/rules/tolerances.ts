/**
 * UZ Aero — progi tolerancji reguł domenowych (docs/_main.md.txt §4.5).
 *
 * ⚠️ WSZYSTKIE WARTOŚCI SĄ DO KALIBRACJI (§4.5: „Progi (do kalibracji)"). Trzymamy je
 * w jednym miejscu, żeby zmiana progu była jedną linią, a nie polowaniem po `if`-ach.
 *
 * Progi wzięte wprost z §4.5, żeby lokalne ostrzeżenie i flaga serwera mówiły to samo:
 * pilot nie ma się dowiadywać dzień później, że serwerowi coś nie pasuje, skoro telefon
 * mógł to powiedzieć od razu.
 */

/** Tolerancja odczytu paliwomierza (L) — §4.5: „paliwo ±10 L lub ±5% pojemności". */
export const FUEL_TOLERANCE_L = 10;

/** Alternatywna tolerancja paliwa jako ułamek pojemności zbiorników (§4.5). */
export const FUEL_TOLERANCE_FRACTION = 0.05;

/** Efektywna tolerancja paliwa: większa z dwóch (§4.5 „lub"). */
export function fuelToleranceL(capacityL: number | null): number {
  if (capacityL == null || capacityL <= 0) return FUEL_TOLERANCE_L;
  return Math.max(FUEL_TOLERANCE_L, capacityL * FUEL_TOLERANCE_FRACTION);
}

/** Tolerancja łańcucha motogodzin (h) — §4.5: „MH tolerancja 0.1 h / 6 min". */
export const MH_TOLERANCE_H = 0.1;

/** Próg rozjazdu zegarów device↔GPS (ms) — §4.5: „clock drift 120 s". */
export const CLOCK_DRIFT_MS = 120_000;

/**
 * Okno samodzielnej korekty po `day_close` (ms) — decyzja 2026-07-23: 24 h.
 * Po nim korektę wprowadza administrator (panel odłożony — decyzja 2026-07-24).
 */
export const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Epsilon arytmetyki zmiennoprzecinkowej dla litrów. `0.1 + 0.2 !== 0.3` w IEEE-754,
 * a paliwo wpisujemy z dokładnością do litra — 1 mL zapasu wystarczy z nawiązką.
 */
export const FUEL_EPSILON_L = 0.001;
