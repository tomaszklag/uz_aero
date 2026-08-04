/**
 * UZ Aero — panel: mapa śladu lotu (`A02c-slad.html`, sekcja „Trasa").
 *
 * Komponent jest CZYSTYM UKŁADEM: nie liczy nic, dostaje gotowe piksele z `mapPlot`
 * (`screens/track/trackChart.ts`). To ta sama zasada, co w karcie dnia — decyzja
 * o treści mieszka w module testowalnym w Node, a `.tsx` odpowiada za rozmieszczenie.
 *
 * Kafelki to zwykłe `<img>`, ślad to `<polyline>`. Bez biblioteki mapowej: ekran jest
 * retrospektywny i potrzebuje obrazków oraz odwzorowania, a nie silnika GL z gestami.
 * Kafelek, który nie doszedł, zostaje pusty — geometria leży w warstwie NAD kafelkami
 * i jest kompletna niezależnie od nich.
 */

/**
 * Kształt, którego oczekuje komponent. Typ mieszka TUTAJ, a nie przy module liczącym,
 * bo warstwa `ui/` nie zna `screens/` (reguła `test/architecture.test.ts`) — kierunek
 * zależności biegnie od ekranu do komponentu i tylko tak.
 */
export interface TilePlacement {
  key: string;
  url: string;
  left: number;
  top: number;
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
  tiles: TilePlacement[];
  markers: MarkerPlacement[];
  scale: { label: string; pixels: number };
}

interface TrackMapProps {
  plot: MapPlot;
  width: number;
  height: number;
}

export function TrackMap({ plot, width, height }: TrackMapProps) {
  return (
    <div className="map-canvas" style={{ height }}>
      <div className="map-tiles">
        {plot.tiles.map((tile) => (
          <img key={tile.key} src={tile.url} alt="" loading="lazy" style={{ left: tile.left, top: tile.top }} />
        ))}
      </div>

      <svg className="map-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
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
            <text x={marker.x + 13} y={marker.y + 4} className="axis-label" fill={marker.color} fontSize={11}>
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
      </div>

      <div className="map-scale">
        <span className="map-scale-label">{plot.scale.label}</span>
        <span className="map-scale-bar" style={{ width: plot.scale.pixels }} />
      </div>

      <div className="map-attrib">© OpenStreetMap contributors</div>
    </div>
  );
}
