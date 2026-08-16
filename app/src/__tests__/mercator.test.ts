/**
 * UZ Aero — testy odwzorowania Web Mercator i doboru kafelków.
 *
 * Ta matematyka nie ma testu „na oko": błąd w niej nie wywala aplikacji, tylko przesuwa
 * ślad o kilometr względem mapy — a to jest dokładnie ten rodzaj wady, którą łatwo
 * przeoczyć na ekranie i niemożliwie trudno wytłumaczyć potem pilotowi.
 *
 * Punkty odniesienia są znane z definicji odwzorowania (środek świata, zawijanie osi X,
 * odwracalność), więc test sprawdza matematykę, a nie zapamiętane wyniki.
 */

import {
  TILE_SIZE,
  boundsOf,
  fitBounds,
  project,
  scaleBar,
  tilesFor,
  toScreen,
  unproject,
} from '../domain';

const EPZG = { lat: 52.1387, lon: 15.7986 };

describe('project / unproject', () => {
  it('środek świata (0,0) ląduje w środku płótna', () => {
    const p = project({ lat: 0, lon: 0 }, 0);
    expect(p.x).toBeCloseTo(TILE_SIZE / 2, 6);
    expect(p.y).toBeCloseTo(TILE_SIZE / 2, 6);
  });

  it('antypody osi X: −180° to lewa krawędź, +180° prawa', () => {
    expect(project({ lat: 0, lon: -180 }, 0).x).toBeCloseTo(0, 6);
    expect(project({ lat: 0, lon: 180 }, 0).x).toBeCloseTo(TILE_SIZE, 6);
  });

  it('każdy poziom zoomu podwaja płótno', () => {
    const z3 = project(EPZG, 3);
    const z4 = project(EPZG, 4);
    expect(z4.x).toBeCloseTo(z3.x * 2, 6);
    expect(z4.y).toBeCloseTo(z3.y * 2, 6);
  });

  it('unproject odwraca project', () => {
    for (const zoom of [0, 5, 12, 18]) {
      const back = unproject(project(EPZG, zoom), zoom);
      expect(back.lat).toBeCloseTo(EPZG.lat, 6);
      expect(back.lon).toBeCloseTo(EPZG.lon, 6);
    }
  });

  it('północ ma mniejsze Y niż południe — oś rośnie na południe', () => {
    const north = project({ lat: 60, lon: 0 }, 8);
    const south = project({ lat: 40, lon: 0 }, 8);
    expect(north.y).toBeLessThan(south.y);
  });

  it('przycina bieguny zamiast produkować nieskończoność', () => {
    const p = project({ lat: 90, lon: 0 }, 5);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

describe('boundsOf', () => {
  it('obejmuje wszystkie punkty', () => {
    const bounds = boundsOf([
      { lat: 52.0, lon: 15.0 },
      { lat: 52.5, lon: 16.0 },
      { lat: 51.5, lon: 15.5 },
    ]);
    expect(bounds).toEqual({ north: 52.5, south: 51.5, east: 16.0, west: 15.0 });
  });

  it('pusty zbiór nie ma prostokąta', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('fitBounds', () => {
  const bounds = { north: 52.2, south: 52.1, east: 15.9, west: 15.7 };

  it('mieści cały ślad w oknie', () => {
    const view = fitBounds(bounds, 360, 300, 20);

    const nw = toScreen({ lat: bounds.north, lon: bounds.west }, view);
    const se = toScreen({ lat: bounds.south, lon: bounds.east }, view);

    expect(nw.x).toBeGreaterThanOrEqual(0);
    expect(nw.y).toBeGreaterThanOrEqual(0);
    expect(se.x).toBeLessThanOrEqual(360);
    expect(se.y).toBeLessThanOrEqual(300);
  });

  it('środek śladu ląduje w środku okna', () => {
    const view = fitBounds(bounds, 360, 300);
    const center = toScreen(
      { lat: (bounds.north + bounds.south) / 2, lon: (bounds.east + bounds.west) / 2 },
      view,
    );
    expect(center.x).toBeCloseTo(180, 6);
    expect(center.y).toBeCloseTo(150, 6);
  });

  it('zoom jest liczbą całkowitą — kafelki istnieją tylko dla takich poziomów', () => {
    const view = fitBounds(bounds, 360, 300);
    expect(Number.isInteger(view.zoom)).toBe(true);
  });

  it('mniejszy obszar dostaje wyższy zoom', () => {
    const wide = fitBounds({ north: 54, south: 50, east: 20, west: 14 }, 360, 300);
    const tight = fitBounds({ north: 52.11, south: 52.1, east: 15.71, west: 15.7 }, 360, 300);
    expect(tight.zoom).toBeGreaterThan(wide.zoom);
  });
});

describe('tilesFor', () => {
  it('pokrywa całe okno', () => {
    const view = fitBounds({ north: 52.2, south: 52.1, east: 15.9, west: 15.7 }, 360, 300);
    const tiles = tilesFor(view);

    expect(tiles.length).toBeGreaterThan(0);
    // Lewy górny róg okna musi być przykryty pierwszym kafelkiem.
    const first = tiles[0]!;
    expect(first.left).toBeLessThanOrEqual(0);
    expect(first.top).toBeLessThanOrEqual(0);

    // Prawa i dolna krawędź też.
    const right = Math.max(...tiles.map((t) => t.left + TILE_SIZE));
    const bottom = Math.max(...tiles.map((t) => t.top + TILE_SIZE));
    expect(right).toBeGreaterThanOrEqual(360);
    expect(bottom).toBeGreaterThanOrEqual(300);
  });

  it('indeksy kafelków mieszczą się w zakresie poziomu', () => {
    const view = fitBounds({ north: 52.2, south: 52.1, east: 15.9, west: 15.7 }, 360, 300);
    const count = 2 ** view.zoom;
    for (const tile of tilesFor(view)) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(count);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeLessThan(count);
    }
  });

  it('zawija oś X — mapa jest cylindrem', () => {
    // Okno wychodzące poza prawą krawędź świata na zoomie 1 (płótno 512 px).
    const view = { zoom: 1, originX: 500, originY: 100, width: 200, height: 100 };
    const tiles = tilesFor(view);
    expect(tiles.every((t) => t.x >= 0 && t.x < 2)).toBe(true);
  });

  it('pomija kafelki spoza osi Y — nad biegunem nie ma mapy', () => {
    const view = { zoom: 1, originX: 0, originY: -300, width: 200, height: 200 };
    const tiles = tilesFor(view);
    expect(tiles.every((t) => t.y >= 0 && t.y < 2)).toBe(true);
  });
});

describe('scaleBar', () => {
  it('wybiera ładną liczbę MIL MORSKICH z ciągu 1-2-5', () => {
    const view = fitBounds({ north: 52.2, south: 52.1, east: 15.9, west: 15.7 }, 360, 300);
    const bar = scaleBar(view, EPZG.lat);

    // Ładna ma być liczba w NM, bo to ona stoi pod kreską — metry są tylko pochodną
    // do przeliczenia długości pasa startowego na piksele (2026-08-15).
    const mantissa = bar.nm / 10 ** Math.floor(Math.log10(bar.nm));
    expect([1, 2, 5]).toContain(Math.round(mantissa));
    expect(bar.meters).toBeCloseTo(bar.nm * 1852, 6);
  });

  it('podziałka nie przekracza zadanej szerokości', () => {
    const view = fitBounds({ north: 52.2, south: 52.1, east: 15.9, west: 15.7 }, 360, 300);
    expect(scaleBar(view, EPZG.lat, 90).pixels).toBeLessThanOrEqual(90);
  });

  it('wyższy zoom daje krótszy dystans pod tą samą kreską', () => {
    const low = scaleBar({ zoom: 8, originX: 0, originY: 0, width: 360, height: 300 }, EPZG.lat);
    const high = scaleBar({ zoom: 14, originX: 0, originY: 0, width: 360, height: 300 }, EPZG.lat);
    expect(high.meters).toBeLessThan(low.meters);
  });
});
