/**
 * UZ Aero - panel 2.0: GEOMETRIA EKRANOWA śladu i profilu (moduł CZYSTY).
 *
 * Cała arytmetyka mapy i wykresu mieszka tutaj, a nie w `.tsx`, i to nie jest kaprys
 * porządkowy: reguła panelu („arytmetyka NIE mieszka w widoku", `test/architecture.test.ts`)
 * istnieje po to, żeby złapać moment, w którym panel zaczyna liczyć po swojemu. Ten moduł
 * jej nie łamie - bo NIE liczy niczego domenowego. Przelicza stopnie na piksele, czyli
 * robi dokładnie to samo, co arkusz stylów robi z jednostkami: układa istniejące dane
 * na powierzchni o znanym rozmiarze.
 *
 * ══ JEDYNY WYJĄTEK OD „Z DOMENY TYLKO TYPY" ══
 * Ten plik importuje z `@uzaero/domain` pięć WARTOŚCI (odwzorowanie Web Mercator,
 * kadrowanie, podziałka, katalog lotnisk w kadrze). Wyjątek jest wpisany imiennie do
 * `test/architecture.test.ts` i ma jeden powód: alternatywą jest kopia tej matematyki
 * obok, a kopia oznacza, że ten sam lot narysuje się w panelu inaczej niż w telefonie.
 * Rozjazd byłby CICHY - obie mapy wyglądałyby poprawnie - a psuje dokładnie tę rozmowę
 * administratora z pilotem o TYM SAMYM locie, dla której ten ekran istnieje.
 *
 * Granica wyjątku jest ostra i pilnuje jej test: wolno tu geometrię wykresu, nie wolno
 * niczego, co liczy fakty o locie. Liczby przychodzą policzone z serwera.
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

// Kształty wyników mieszkają PRZY komponentach, które je konsumują - warstwa `ui/`
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
 * `null`, gdy nie ma ani jednego punktu - wtedy ekran pokazuje stan pusty, nie pustą mapę.
 *
 * Kafelków NIE MA (decyzja 2026-08-04): tłem jest siatka współrzędnych, a odniesienie
 * w terenie dają pasy startowe lotnisk z katalogu. Skala pod mapą przestaje więc być
 * ozdobą - to jedyna rzecz, która mówi, czy krąg ma dwa kilometry, czy dwadzieścia.
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
      // Pas krótszy niż kilka pikseli jest nieczytelny - wtedy zostaje sam znacznik.
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
        // a obrót w układzie ekranu od osi X - stąd −90°.
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
      // NM, nie kilometry: cały produkt liczy dystans w milach morskich (2026-08-15).
      label: `${bar.nm} NM`,
      pixels: bar.pixels,
    },
  };
}

const AXIS_LEFT = 52;
const TOP = 10;
const BOTTOM_SPACE = 42;
const GRID_ROWS = 5;

/**
 * Układa profil wysokości CAŁEJ sesji. Skala pionowa zaczyna się od DNA lotu, nie od
 * zera: lot ze zrzutem odbywa się między elewacją pola a 13 000 ft, więc oś ciągnięta
 * do poziomu morza spłaszczyłaby cały przebieg w pasek przy górnej krawędzi.
 *
 * Przerwa między wyniesieniami nie jest dziurą w zapisie - to czas na ziemi między
 * lotami tego samego biegu silnika, i tak ma wyglądać (issue #38).
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

/** Podpis szczytu na profilu - pusty napis, gdy profil go nie zna. */
export function peakLabel(profile: FlightProfile): string {
  if (profile.peakAt == null || profile.peakAltitudeFt == null) return '';
  return `szczyt ${Math.round(profile.peakAltitudeFt).toLocaleString('pl-PL')} ft`;
}
