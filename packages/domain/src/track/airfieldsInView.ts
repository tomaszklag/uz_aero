/**
 * UZ Aero - które lotniska pokazać na mapie śladu.
 *
 * Ekran rysuje trasę na siatce współrzędnych, bez kafelków (decyzja 2026-08-04), więc
 * lotniska są JEDYNYM odniesieniem w terenie. Tym ważniejsze, żeby nie było ich za dużo:
 * pas z podpisem przy każdym lądowisku w promieniu 50 km zamieniłby mapę w listę nazw,
 * przez którą nie widać śladu.
 *
 * Stąd dwie reguły. Bierzemy lotniska LEŻĄCE W KADRZE (plus wąski margines, żeby pas
 * przy samej krawędzi nie znikał w połowie), a gdy i tak jest ich dużo - zostawiamy te
 * najbliższe środkowi trasy, bo lot toczy się wokół nich, a nie wokół krawędzi ekranu.
 *
 * Lotnisko wskazane w preflighcie (`departureIcao`) wchodzi ZAWSZE, nawet spoza kadru:
 * pilot podał je ręcznie, więc jest odpowiedzią na pytanie „gdzie to było", a nie
 * przypadkowym sąsiadem trasy.
 */

import { POLISH_AIRFIELDS, type Airfield } from '../airfields';
import { distanceNm, type LatLon } from '../detection/geo';
import type { LatLonBounds } from './mercator';

/** Ile lotnisk najwyżej rysujemy - powyżej tego mapa przestaje być czytelna. */
export const MAX_AIRFIELDS_IN_VIEW = 6;

/**
 * Margines wokół kadru w stopniach (~5 km w szerokości). Pas leżący tuż za krawędzią
 * i tak wystaje do środka, więc jego pominięcie zostawiłoby ucięty prostokąt bez podpisu.
 */
const EDGE_MARGIN_DEG = 0.05;

export interface AirfieldsInViewOptions {
  /** Kod ICAO z preflightu - to lotnisko pokazujemy zawsze. */
  preferredIcao?: string | null;
  limit?: number;
  /** Katalog do przeszukania; podmieniany w testach. */
  catalogue?: readonly Airfield[];
}

/**
 * Lotniska do narysowania w danym kadrze, od najbliższego środkowi.
 *
 * @param bounds prostokąt obejmujący ślad (z `boundsOf`).
 */
export function airfieldsInView(
  bounds: LatLonBounds,
  options: AirfieldsInViewOptions = {},
): Airfield[] {
  const catalogue = options.catalogue ?? POLISH_AIRFIELDS;
  const limit = options.limit ?? MAX_AIRFIELDS_IN_VIEW;

  const center: LatLon = {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2,
  };

  const inside = catalogue.filter(
    (a) =>
      a.lat <= bounds.north + EDGE_MARGIN_DEG &&
      a.lat >= bounds.south - EDGE_MARGIN_DEG &&
      a.lon <= bounds.east + EDGE_MARGIN_DEG &&
      a.lon >= bounds.west - EDGE_MARGIN_DEG,
  );

  // Szukamy w PODANYM katalogu, a nie globalnym `airfieldByIcao` - inaczej test
  // z własnym zestawem lotnisk dostawałby wynik z prawdziwych danych.
  const key = options.preferredIcao?.trim().toUpperCase();
  const preferred = key == null || key === '' ? null : (catalogue.find((a) => a.icao === key) ?? null);

  // Wskazane w preflighcie na początek, reszta wg odległości od środka trasy.
  const rest = inside
    .filter((a) => a.icao !== preferred?.icao)
    .sort((a, b) => distanceNm(center, a) - distanceNm(center, b));

  const picked = preferred == null ? rest : [preferred, ...rest];
  return picked.slice(0, limit);
}
