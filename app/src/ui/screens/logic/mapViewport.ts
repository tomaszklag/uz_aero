/**
 * UZ Aero - KADR MAPY ŚLADU: przybliżenie i przesunięcie (issue #47 pkt 8).
 *
 * Czysta matematyka, osobno od `PanResponder`: gest jest wejściem, kadr wyjściem,
 * a między nimi nie ma nic do zgadywania. Dzięki temu reguły, które na urządzeniu
 * najłatwiej zepsuć - „mapa nie ucieka poza krawędź", „szczypta trzyma się palców",
 * „dwuklik wraca do całości" - dają się sprawdzić testem zamiast palcem.
 *
 * ══ DLACZEGO KADR, A NIE `transform` NA WIDOKU ══
 * Skalowanie całego widoku byłoby jedną linijką, ale powiększyłoby też PODPISY:
 * „ZRZUT 1 · 08:52" przy ×2,4 zajmowałby ćwierć mapy. Kadr przelicza WSPÓŁRZĘDNE,
 * więc geometria rośnie, a napisy zostają w rozmiarze czytelnym dla oka. Ta sama
 * decyzja jest w mockupie 14D (tam trzeba było ręcznie skorygować `font-size`).
 */

import type { Point2D } from '../../components/data/TrackPolyline';

export interface MapViewport {
  /** 1 = cały ślad w kadrze. Powyżej - przybliżenie. */
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Kadr wyjściowy: cały ślad, bez przesunięcia. */
export const IDENTITY_VIEWPORT: MapViewport = { scale: 1, offsetX: 0, offsetY: 0 };

/**
 * Górna granica przybliżenia.
 *
 * Przy ×8 podziałka schodzi z kilometrów do setek metrów, czyli do rozdzielczości,
 * w której widać już pojedyncze zakręty nad progiem pasa. Wyżej rośnie tylko błąd
 * pozycji GPS - powiększalibyśmy szum odbiornika, nie trasę.
 */
export const MAX_MAP_SCALE = 8;

export interface ViewportSize {
  width: number;
  height: number;
}

/** Współrzędna bazowa (kadr 1:1) → współrzędna na ekranie. */
export function applyViewport(point: Point2D, viewport: MapViewport): Point2D {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY,
  };
}

/** Odwrotność `applyViewport` - z dotknięcia ekranu na współrzędną bazową. */
export function unapplyViewport(point: Point2D, viewport: MapViewport): Point2D {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  };
}

/**
 * Szczypta wokół punktu między palcami.
 *
 * Ognisko musi zostać NIERUCHOME: to ono odpowiada za wrażenie, że mapa jest chwytana,
 * a nie sterowana. Stąd nowy offset liczy się z warunku „ten sam punkt bazowy pod tym
 * samym miejscem ekranu", a nie ze skalowania samego offsetu.
 */
export function pinchViewport(
  viewport: MapViewport,
  focus: Point2D,
  factor: number,
  size: ViewportSize,
): MapViewport {
  const scale = clamp(viewport.scale * factor, 1, MAX_MAP_SCALE);
  const ratio = scale / viewport.scale;

  return clampViewport(
    {
      scale,
      offsetX: focus.x - (focus.x - viewport.offsetX) * ratio,
      offsetY: focus.y - (focus.y - viewport.offsetY) * ratio,
    },
    size,
  );
}

/** Przesunięcie kadru o wektor (px ekranu). */
export function panViewport(
  viewport: MapViewport,
  dx: number,
  dy: number,
  size: ViewportSize,
): MapViewport {
  return clampViewport(
    { scale: viewport.scale, offsetX: viewport.offsetX + dx, offsetY: viewport.offsetY + dy },
    size,
  );
}

/**
 * Dociąga kadr tak, żeby nie było widać pustki poza rysunkiem.
 *
 * Przy `scale = 1` jedynym dozwolonym offsetem jest zero - bez tego mapa dałaby się
 * odsunąć w bok i pilot zobaczyłby puste tło zamiast trasy, nie wiedząc, że wystarczy
 * ją przesunąć z powrotem.
 */
export function clampViewport(viewport: MapViewport, size: ViewportSize): MapViewport {
  const scale = clamp(viewport.scale, 1, MAX_MAP_SCALE);
  const minX = size.width * (1 - scale);
  const minY = size.height * (1 - scale);

  return {
    scale,
    offsetX: clamp(viewport.offsetX, minX, 0),
    offsetY: clamp(viewport.offsetY, minY, 0),
  };
}

/** Czy kadr jest ruszony - decyduje o pokazaniu wyjścia „całość" (dwuklik). */
export function isZoomed(viewport: MapViewport): boolean {
  return viewport.scale > 1.001;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
