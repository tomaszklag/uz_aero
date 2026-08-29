/**
 * UZ Aero - panel: mapa śladu lotu (`A02c-slad.html`, sekcja „Trasa").
 *
 * Komponent jest CZYSTYM UKŁADEM: nie liczy nic, dostaje gotowe piksele z `mapPlot`
 * (`screens/track/trackChart.ts`). To ta sama zasada, co w karcie dnia - decyzja
 * o treści mieszka w module testowalnym w Node, a `.tsx` odpowiada za rozmieszczenie.
 *
 * **Bez kafelków** (decyzja 2026-08-04): tłem jest siatka współrzędnych, a odniesienie
 * w terenie dają lotniska z katalogu - pas startowy z podpisem ICAO. Panel nie pobiera
 * więc niczego z zewnątrz, dokładnie tak samo jak telefon.
 *
 * Typy kształtów mieszkają TUTAJ, a nie przy module liczącym, bo warstwa `ui/` nie zna
 * `screens/` (reguła `test/architecture.test.ts`) - kierunek zależności biegnie od
 * ekranu do komponentu i tylko tak.
 */

/** Lotnisko po przeliczeniu na piksele. */
export interface AirfieldPlacement {
  icao: string;
  name: string;
  x: number;
  y: number;
  /** Pas w skali mapy; `null`, gdy byłby nieczytelnie krótki albo dane go nie znają. */
  runway: { lengthPx: number; rotateDeg: number } | null;
}

export interface MarkerPlacement {
  label: string;
  color: string;
  x: number;
  y: number;
  ring: boolean;
}

export interface MapPlot {
  /** Punkty łamanej w formacie atrybutu `points` SVG. */
  polyline: string;
  airfields: AirfieldPlacement[];
  markers: MarkerPlacement[];
  scale: { label: string; pixels: number };
}

interface TrackMapProps {
  plot: MapPlot;
  width: number;
  height: number;
}

/** Odstęp siatki (px) - ten sam co w aplikacji, żeby oba ekrany czytało się tak samo. */
const GRID_STEP = 60;

export function TrackMap({ plot, width, height }: TrackMapProps) {
  const verticals: number[] = [];
  for (let x = GRID_STEP; x < width; x += GRID_STEP) verticals.push(x);
  const horizontals: number[] = [];
  for (let y = GRID_STEP; y < height; y += GRID_STEP) horizontals.push(y);

  return (
    <div className="map-canvas" style={{ height }}>
      <svg className="map-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* ── siatka współrzędnych: podkład, który zastąpił kafelki ──────── */}
        <g className="map-grid">
          {verticals.map((x) => (
            <line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} />
          ))}
          {horizontals.map((y) => (
            <line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} />
          ))}
        </g>

        {/* ── lotniska: pas i podpis, POD śladem ─────────────────────────── */}
        {plot.airfields.map((airfield) => (
          <g key={airfield.icao}>
            {airfield.runway == null ? (
              <rect
                x={airfield.x - 3}
                y={airfield.y - 3}
                width={6}
                height={6}
                className="map-airfield-dot"
              />
            ) : (
              <rect
                x={airfield.x - airfield.runway.lengthPx / 2}
                y={airfield.y - 2}
                width={airfield.runway.lengthPx}
                height={4}
                className="map-runway"
                transform={`rotate(${airfield.runway.rotateDeg} ${airfield.x} ${airfield.y})`}
              />
            )}
            <text x={airfield.x + 9} y={airfield.y + 14} className="axis-label">
              {airfield.icao} · {airfield.name}
            </text>
          </g>
        ))}

        <polyline
          points={plot.polyline}
          fill="none"
          stroke="var(--green)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.92}
        />

        {plot.markers.map((marker) => (
          <g key={marker.label}>
            {marker.ring && (
              <circle
                cx={marker.x}
                cy={marker.y}
                r={15}
                fill="none"
                stroke={marker.color}
                strokeWidth={1.6}
                opacity={0.4}
              />
            )}
            <circle cx={marker.x} cy={marker.y} r={8} fill={marker.color} />
            <text
              x={marker.x + 13}
              y={marker.y + 4}
              className="axis-label"
              fill={marker.color}
              fontSize={11}
            >
              {marker.label}
            </text>
          </g>
        ))}
      </svg>

      <div className="map-legend">
        <div className="map-legend-title">Legenda</div>
        <div className="legend-row">
          <span className="legend-dot line" style={{ background: 'var(--green)' }} />
          Trasa lotu
        </div>
        {plot.markers.map((marker) => (
          <div className="legend-row" key={marker.label}>
            <span className="legend-dot" style={{ background: marker.color }} />
            {marker.label}
          </div>
        ))}
        {plot.airfields.length > 0 && (
          <div className="legend-row">
            <span className="legend-dot line" style={{ background: 'var(--border-strong)' }} />
            Pas startowy
          </div>
        )}
      </div>

      {/* Bez kafelków podziałka jest JEDYNYM odniesieniem odległości. */}
      <div className="map-scale">
        <span className="map-scale-label">{plot.scale.label}</span>
        <span className="map-scale-bar" style={{ width: plot.scale.pixels }} />
      </div>

      {/* Atrybucja ODbL - część pasów w katalogu pochodzi z OpenStreetMap. */}
      <div className="map-attrib">lotniska: OurAirports · © OpenStreetMap</div>
    </div>
  );
}
