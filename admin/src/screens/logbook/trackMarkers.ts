/**
 * UZ Aero - panel 2.0: znaczniki startów i lądowań na śladzie sesji (moduł CZYSTY).
 *
 * ══ SKĄD BIORĄ SIĘ POZYCJE ══
 * Koperta śladu niesie WYŁĄCZNIE geometrię - nie ma w niej ani lotów, ani ich czasów
 * (`SessionTrackPayload`). Czasy przychodzą z REJESTRU, czyli z projekcji sesji już po
 * korektach, i to jest właściwa kolejność: mapa ma pokazywać lot tak, jak go dziś
 * rozumie rejestr. Pozycję znacznika znajdujemy więc po CZASIE - najbliższy wierzchołek
 * śladu - zamiast szukać jej w kopercie, której nie ma czego o to pytać.
 *
 * ══ DLACZEGO ZNACZNIK BYWA NIEOBECNY ══
 * Wierzchołek „najbliższy w czasie" bywa odległy o kwadrans: nagranie potrafi się urwać,
 * a lot ręczny nie ma go wcale. Znacznik postawiony wtedy kłamałby o miejscu startu, więc
 * przy odległości większej niż `MAX_MATCH_MS` po prostu go nie ma. Brak znacznika jest
 * czytelny (na mapie widać sam ślad), fałszywy - nie.
 */

import type { SessionTrackDto } from '../../api/dto';
import type { MapMarkerInput } from './trackChart';

/**
 * Najdalszy odstęp między czasem zdarzenia a wierzchołkiem śladu, przy którym jeszcze
 * mówimy „to jest to miejsce". Dwie minuty to przy prędkości przelotowej ~3 NM - na tyle
 * mało, żeby znacznik stał przy właściwym końcu pasa, i na tyle dużo, żeby przetrwał
 * rzadsze nagranie i pojedynczą dziurę po utracie fixa.
 */
export const MAX_MATCH_MS = 120_000;

/** Lot w postaci, w jakiej potrzebuje go mapa - tyle bierzemy z projekcji sesji. */
export interface FlightTimes {
  index: number;
  takeoffAt: number;
  landingAt: number | null;
}

/**
 * Znaczniki startów i lądowań dla całej sesji.
 *
 * Kolor niesie RODZAJ zdarzenia (start zielony, lądowanie błękitne) - ta sama para,
 * co na profilu pionowym, żeby oko przechodziło między wykresami bez tłumaczenia.
 * Pierścień dostaje wyłącznie PIERWSZY start: w dniu skokowym znaczników bywa
 * kilkanaście i bez tego nie widać, gdzie zaczyna się bieg.
 */
export function trackMarkers(
  track: SessionTrackDto,
  flights: readonly FlightTimes[],
): MapMarkerInput[] {
  const markers: MapMarkerInput[] = [];

  for (const flight of flights) {
    const takeoff = vertexAt(track, flight.takeoffAt);
    if (takeoff != null) {
      markers.push({
        position: takeoff,
        color: 'var(--green)',
        label: `T/O ${flight.index}`,
        ring: flight.index === 1,
      });
    }

    if (flight.landingAt == null) continue;
    const landing = vertexAt(track, flight.landingAt);
    if (landing != null) {
      markers.push({ position: landing, color: 'var(--blue)', label: `LDG ${flight.index}` });
    }
  }

  return markers;
}

/** Wierzchołek śladu najbliższy w czasie; `null`, gdy nagranie tej chwili nie obejmuje. */
function vertexAt(track: SessionTrackDto, time: number): { lat: number; lon: number } | null {
  let best: { lat: number; lon: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const vertex of track.line) {
    const distance = Math.abs(vertex.time - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { lat: vertex.lat, lon: vertex.lon };
    }
  }

  return bestDistance <= MAX_MATCH_MS ? best : null;
}
