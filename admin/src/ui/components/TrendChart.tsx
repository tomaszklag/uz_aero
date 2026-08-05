/**
 * UZ Aero — panel: WYKRES SZEREGU DZIENNEGO (`.trend` z `SZABLON.html`).
 *
 * SVG polyline w viewBoxie 600×96 mockupu `A10` — bez biblioteki wykresów, jak
 * `Sparkline`. Geometria (punkty, kropki dni zerowych) przychodzi policzona
 * z `screens/stats/statsTrend.ts`; komponent nie liczy niczego.
 *
 * Dzień ZEROWY dostaje kropkę na osi — mockup podpisuje go wprost jako „dzień bez
 * ani jednej sesji, nie brak danych", więc ma być widoczny, a nie pusty.
 */

interface TrendChartProps {
  points: string;
  zeroDots: { key: string; x: number }[];
  lastDot: { x: number; y: number } | null;
  axis: string[];
  /** Opis dla czytnika ekranu — linia sama z siebie nie niesie żadnej treści. */
  label: string;
}

export function TrendChart({ points, zeroDots, lastDot, axis, label }: TrendChartProps) {
  return (
    <>
      <svg className="trend" viewBox="0 0 600 96" role="img" aria-label={label}>
        <line x1="0" y1="85" x2="600" y2="85" stroke="var(--border)" strokeWidth="1" />
        <line x1="0" y1="45" x2="600" y2="45" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
        <line x1="0" y1="5" x2="600" y2="5" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
        <polyline
          fill="none"
          stroke="var(--green)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {zeroDots.map((dot) => (
          <circle key={dot.key} cx={dot.x} cy={85} r={2.5} fill="var(--border-strong)" />
        ))}
        {lastDot == null ? null : <circle cx={lastDot.x} cy={lastDot.y} r={3} fill="var(--green)" />}
      </svg>
      <div className="trend-axis">
        {/* Klucz z pozycji — podpisy osi bywają identyczne przy krótkich zakresach. */}
        {axis.map((tick, index) => (
          <span key={`tick-${index}`}>{tick}</span>
        ))}
      </div>
    </>
  );
}
