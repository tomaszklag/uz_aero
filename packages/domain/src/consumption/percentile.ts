/**
 * UZ Aero - centyl z interpolacją liniową.
 *
 * Wydzielony z `summary.ts` (issue #38), bo pasmo centylowe przestało być sprawą jednego
 * modułu: tak samo liczy się rozrzut sesji wokół modelu fazowego (`ratio.ts`). Reguła
 * „pasmo z OBSERWACJI, nie z przedziału ufności" ma odtąd jedną implementację i nie ma
 * jak się rozjechać między paliwem a motogodzinami.
 */

/**
 * Centyl z interpolacją liniową między sąsiednimi obserwacjami (metoda domyślna
 * w większości narzędzi statystycznych). Przy jednej obserwacji zwraca ją samą -
 * pasmo jest wtedy punktem i taka jest prawda o tych danych.
 */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;

  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;

  return sorted[lower]! + (position - lower) * (sorted[upper]! - sorted[lower]!);
}
