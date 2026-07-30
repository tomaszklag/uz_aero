/**
 * UZ Aero — nachylenie prostej regresji po czasie.
 *
 * Wydzielone, bo ta sama metoda liczy teraz dwie różne rzeczy: prędkość pionową
 * (`flightPhase.ts`) i przyspieszenie podłużne (`trends.ts`). Powód, dla którego
 * w ogóle jest to regresja, a nie różnica skrajnych punktów, jest udokumentowany
 * awarią: metoda „ostatni minus pierwszy" dawała jednemu artefaktowi GPS pełną wagę
 * i produkowała fałszywe „Climb" z 30-stopowej szpilki. Regresja rozkłada ten sam
 * błąd na całe okno.
 *
 * Zwracamy `null`, nie zero, gdy danych brakuje albo są zbyt ciasne w czasie —
 * „nie wiem" i „nie zmienia się" to dwie różne informacje, a detektor podejmuje
 * na ich podstawie różne decyzje.
 */

/** Punkt pomiarowy: `t` w SEKUNDACH (dowolne odniesienie), `v` w jednostce mierzonej. */
export interface TimePoint {
  t: number;
  v: number;
}

/**
 * Nachylenie w jednostkach `v` na sekundę.
 *
 * `minSpanSec` to bezpiecznik przed dzieleniem szumu przez małą liczbę: dwa pomiary
 * sekundę po sobie zawsze wyznaczą jakąś prostą, tylko że o nachyleniu wziętym z sufitu.
 */
export function slopePerSecond(
  points: readonly TimePoint[],
  minSpanSec: number,
): number | null {
  if (points.length < 2) return null;

  const span = points[points.length - 1]!.t - points[0]!.t;
  if (span < minSpanSec) return null;

  const n = points.length;
  const meanT = points.reduce((s, p) => s + p.t, 0) / n;
  const meanV = points.reduce((s, p) => s + p.v, 0) / n;

  let covariance = 0;
  let variance = 0;
  for (const p of points) {
    covariance += (p.t - meanT) * (p.v - meanV);
    variance += (p.t - meanT) ** 2;
  }
  if (variance === 0) return null; // wszystkie punkty z tą samą etykietą czasu

  return covariance / variance;
}
