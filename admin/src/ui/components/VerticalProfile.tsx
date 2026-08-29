/**
 * UZ Aero - panel: profil pionowy lotu (`A02c-slad.html`, sekcja „Profil pionowy").
 *
 * Jak `TrackMap`: CZYSTY UKŁAD, zero arytmetyki. Współrzędne, siatkę i podpisy liczy
 * `profilePlot` (`screens/track/trackChart.ts`), tutaj zostaje rozmieszczenie.
 *
 * Wysokość jest GPS-owa, nie ciśnieniowa - ekran mówi o tym w stopce pod wykresem,
 * bo różnica względem wysokościomierza w kokpicie potrafi sięgnąć kilkuset stóp,
 * a ten widok bywa czytany obok dokumentów pilota.
 */

import { timeUtc } from '@uzaero/format';

/** Poziom siatki profilu: linia i podpis wysokości. */
export interface ProfileGridRow {
  y: number;
  label: string;
  solid: boolean;
}

/** Kształt oczekiwany przez komponent - typ przy komponencie, jak w `TrackMap`. */
export interface ProfilePlot {
  polyline: string;
  /** Ta sama łamana domknięta do podstawy - wypełnienie pod krzywą. */
  area: string;
  grid: ProfileGridRow[];
  left: number;
  plotWidth: number;
  /** Szczyt lotu w pikselach; `null`, gdy profil go nie zna. */
  peak: { x: number; y: number } | null;
}

interface VerticalProfileProps {
  plot: ProfilePlot;
  width: number;
  height: number;
  /** Czas pierwszego i ostatniego odczytu - podpisy osi. */
  startAt: number;
  endAt: number;
  /** Podpis szczytu; pusty napis = szczytu nie pokazujemy. */
  peakLabel: string;
}

export function VerticalProfile({
  plot,
  width,
  height,
  startAt,
  endAt,
  peakLabel,
}: VerticalProfileProps) {
  return (
    <div className="profile-chart" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="alt-fill-panel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--green)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {plot.grid.map((row) => (
          <g key={row.label + String(row.y)}>
            <line
              x1={plot.left}
              y1={row.y}
              x2={plot.left + plot.plotWidth}
              y2={row.y}
              className={row.solid ? 'grid-line' : 'grid-line dashed'}
            />
            <text x={0} y={row.y + 3} className="axis-label">
              {row.label}
            </text>
          </g>
        ))}

        <polygon points={plot.area} fill="url(#alt-fill-panel)" />
        <polyline
          points={plot.polyline}
          fill="none"
          stroke="var(--green)"
          strokeWidth={2.6}
          strokeLinecap="round"
        />

        {plot.peak != null && (
          <g>
            <line
              x1={plot.peak.x}
              y1={6}
              x2={plot.peak.x}
              y2={height - 22}
              stroke="var(--blue)"
              strokeWidth={1.2}
              strokeDasharray="4 4"
            />
            <circle cx={plot.peak.x} cy={plot.peak.y} r={5} fill="var(--blue)" />
            <text
              x={plot.peak.x + 8}
              y={plot.peak.y + 16}
              className="axis-label"
              fill="var(--blue)"
              fontSize={9.5}
            >
              {peakLabel}
            </text>
          </g>
        )}

        <text x={plot.left} y={height - 6} className="axis-label">
          {timeUtc(startAt)}
        </text>
        <text x={width - 40} y={height - 6} className="axis-label">
          {timeUtc(endAt)}
        </text>
      </svg>
    </div>
  );
}
