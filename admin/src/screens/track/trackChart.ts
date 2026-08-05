/**
 * UZ Aero — panel: GEOMETRIA EKRANOWA śladu i profilu (moduł CZYSTY).
 *
 * Cała arytmetyka mapy i wykresu mieszka tutaj, a nie w `.tsx`, i to nie jest kaprys
 * porządkowy: reguła panelu („arytmetyka NIE mieszka w widoku", `test/architecture.test.ts`)
 * istnieje po to, żeby złapać moment, w którym panel zaczyna liczyć po swojemu. Ten moduł
 * jej nie łamie — bo NIE liczy niczego domenowego. Przelicza stopnie na piksele, czyli
 * robi dokładnie to samo, co arkusz stylów robi z jednostkami: układa istniejące dane
 * na powierzchni o znanym rozmiarze.
 *
 * Dlatego jest to zarazem JEDYNE miejsce w panelu, któremu wolno importować z domeny
 * WARTOŚCI (odwzorowanie Merkatora), a nie tylko typy — z jawnym wyjątkiem wpisanym
 * do testu architektury. Alternatywą była kopia tej matematyki obok, a kopia oznacza,
 * że ślad prędzej czy później wygląda inaczej w panelu niż w telefonie. Przy narzędziu,
 * którego cała wartość polega na wspólnej rozmowie administratora z pilotem o TYM SAMYM
 * locie, to najgorszy możliwy rodzaj rozjazdu.
 */

import {
  airfieldsInView,
  boundsOf,
  fitBounds,
  scaleBar,
  toScreen,
  type FlightProfile,
  type LatLon,
  type TrackVertex,
} from '@uzaero/domain';

// Kształty wyników mieszkają PRZY komponentach, które je konsumują — warstwa `ui/`
// nie zna `screens/`, więc kierunek zależności biegnie tędy, a nie odwrotnie.
import type { MapPlot } from '../../ui/components/TrackMap';
import type { ProfileGridRow, ProfilePlot } from '../../ui/components/VerticalProfile';

export interface MapMarkerInput {
  position: LatLon;
  color: string;
  label: string;
  ring?: boolean;
}

/**
 * Układa ślad, lotniska i znaczniki na płótnie `width`×`height`.
 * `null`, gdy nie ma ani jednego punktu — wtedy ekran pokazuje stan pusty, nie pustą mapę.
 *
 * Kafelków NIE MA (decyzja 2026-08-04): tłem jest siatka współrzędnych, a odniesienie
 * w terenie dają pasy startowe lotnisk z katalogu. Skala pod mapą przestaje więc być
 * ozdobą — to jedyna rzecz, która mówi, czy krąg ma dwa kilometry, czy dwadzieścia.
 */
export function mapPlot(
  line: readonly TrackVertex[],
  markers: readonly MapMarkerInput[],
  width: number,
  height: number,
  departureIcao: string | null = null,
): MapPlot | null {
  const positions: LatLon[] = [...line, ...markers.map((m) => m.position)];
  const bounds = boundsOf(positions);
  if (bounds == null) return null;

  const view = fitBounds(bounds, width, height, 40);
  const bar = scaleBar(view, line[0]?.lat ?? bounds.north);
  const metersPerPixel = bar.pixels > 0 ? bar.meters / bar.pixels : null;

  return {
    polyline: line
      .map((point) => {
        const p = toScreen(point, view);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(' '),

    airfields: airfieldsInView(bounds, { preferredIcao: departureIcao }).map((airfield) => {
      const p = toScreen(airfield, view);
      // Pas krótszy niż kilka pikseli jest nieczytelny — wtedy zostaje sam znacznik.
      const lengthPx =
        airfield.runway != null && metersPerPixel != null
          ? airfield.runway.lengthM / metersPerPixel
          : 0;
      return {
        icao: airfield.icao,
        name: airfield.name,
        x: p.x,
        y: p.y,
        // Kurs geograficzny liczy się od północy zgodnie z ruchem wskazówek,
        // a obrót w układzie ekranu od osi X — stąd −90°.
        runway:
          lengthPx >= 10 && airfield.runway != null
            ? { lengthPx, rotateDeg: airfield.runway.headingDeg - 90 }
            : null,
      };
    }),

    markers: markers.map((marker) => {
      const p = toScreen(marker.position, view);
      return {
        label: marker.label,
        color: marker.color,
        x: p.x,
        y: p.y,
        ring: marker.ring === true,
      };
    }),

    scale: {
      label: bar.meters >= 1000 ? `${bar.meters / 1000} km` : `${bar.meters} m`,
      pixels: bar.pixels,
    },
  };
}

const AXIS_LEFT = 52;
const TOP = 10;
const BOTTOM_SPACE = 42;
const GRID_ROWS = 5;

/**
 * Układa profil wysokości. Skala pionowa zaczyna się od DNA lotu, nie od zera: lot ze
 * zrzutem odbywa się między elewacją pola a 13 000 ft, więc oś ciągnięta do poziomu
 * morza spłaszczyłaby cały przebieg w pasek przy górnej krawędzi.
 */
export function profilePlot(
  profile: FlightProfile,
  width: number,
  height: number,
): ProfilePlot | null {
  const samples = profile.samples;
  if (samples.length < 2) return null;

  const plotWidth = width - AXIS_LEFT - 8;
  const plotHeight = height - BOTTOM_SPACE;

  const t0 = samples[0]!.time;
  const t1 = samples[samples.length - 1]!.time;
  const spanMs = Math.max(1, t1 - t0);

  const altitudes = samples.map((s) => s.altitudeFt);
  const minAlt = Math.min(...altitudes);
  const maxAlt = Math.max(...altitudes);
  const pad = Math.max(50, (maxAlt - minAlt) * 0.05);
  const lowAlt = minAlt - pad;
  const highAlt = maxAlt + pad;
  const spanAlt = Math.max(1, highAlt - lowAlt);

  const toXY = (time: number, altitudeFt: number) => ({
    x: AXIS_LEFT + ((time - t0) / spanMs) * plotWidth,
    y: TOP + plotHeight - ((altitudeFt - lowAlt) / spanAlt) * plotHeight,
  });

  const polyline = samples
    .map((s) => {
      const p = toXY(s.time, s.altitudeFt);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  const base = TOP + plotHeight;
  const grid: ProfileGridRow[] = [];
  for (let i = 0; i < GRID_ROWS; i++) {
    const ratio = i / (GRID_ROWS - 1);
    grid.push({
      y: TOP + plotHeight * ratio,
      label: Math.round(highAlt - (highAlt - lowAlt) * ratio).toLocaleString('pl-PL'),
      solid: i === GRID_ROWS - 1,
    });
  }

  return {
    polyline,
    area: `${AXIS_LEFT},${base} ${polyline} ${AXIS_LEFT + plotWidth},${base}`,
    grid,
    left: AXIS_LEFT,
    plotWidth,
    peak:
      profile.peakAt != null && profile.peakAltitudeFt != null
        ? toXY(profile.peakAt, profile.peakAltitudeFt)
        : null,
  };
}

/** Zaokrąglone wartości do podpisów — widok nie ma prawa liczyć nawet tego. */
export function profileFooter(profile: FlightProfile): {
  climb: string | null;
  descent: string | null;
} {
  return {
    climb:
      profile.averageClimbFtPerMin != null
        ? `${Math.round(profile.averageClimbFtPerMin)} ft/min`
        : null,
    descent:
      profile.averageDescentFtPerMin != null
        ? `${Math.round(profile.averageDescentFtPerMin)} ft/min`
        : null,
  };
}

/** Podpis szczytu na profilu — pusty napis, gdy profil go nie zna. */
export function peakLabel(profile: FlightProfile): string {
  if (profile.peakAt == null || profile.peakAltitudeFt == null) return '';
  return `szczyt ${Math.round(profile.peakAltitudeFt).toLocaleString('pl-PL')} ft`;
}

/** Liczby kafli nad mapą — formatowanie w module czystym, jak reszta napisów panelu. */
export function trackTiles(track: {
  distanceNm: number;
  maxAltitudeFt: number | null;
  usableCount: number;
  totalCount: number;
}): { distance: string; maxAltitude: string; usable: string; total: string; rejected: string } {
  return {
    distance: track.distanceNm.toFixed(1),
    maxAltitude:
      track.maxAltitudeFt != null ? Math.round(track.maxAltitudeFt).toLocaleString('pl-PL') : '—',
    usable: track.usableCount.toLocaleString('pl-PL'),
    total: track.totalCount.toLocaleString('pl-PL'),
    rejected: (track.totalCount - track.usableCount).toLocaleString('pl-PL'),
  };
}
