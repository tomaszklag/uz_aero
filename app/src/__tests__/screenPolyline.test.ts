/**
 * UZ Aero — ciągłość łamanej śladu (issue #47 pkt 1).
 *
 * Test istnieje, bo błąd, który naprawia, był NIEWIDOCZNY w kodzie i bardzo widoczny na
 * urządzeniu: stara wersja `TrackPolyline` pomijała odcinki krótsze niż pół piksela,
 * więc gęsty zapis rysował się jako zbiór kropek. Odtwarzamy tu oba realne wejścia —
 * profil pionowy (tysiące próbek na 290 px) i mapę przy dużej rozpiętości trasy —
 * i pytamy o jedną rzecz: czy z punktów da się zbudować LINIĘ.
 */

import {
  polylineSegments,
  screenPath,
  MIN_SCREEN_STEP_PX,
} from '../ui/components/data/screenPolyline';
import type { Point2D } from '../ui/components/data/TrackPolyline';

/** Ile odcinków narysowałaby STARA implementacja (pomijanie < 0,5 px). */
function oldSegmentCount(points: readonly Point2D[]): number {
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dy = points[i]!.y - points[i - 1]!.y;
    if (Math.sqrt(dx * dx + dy * dy) >= 0.5) count += 1;
  }
  return count;
}

describe('łamana w przestrzeni ekranu', () => {
  it('profil z tysięcy próbek daje LINIĘ, a nie garść szpilek', () => {
    // Godzinny bieg silnika, fix co sekundę, 290 px szerokości wykresu: 0,08 px/odcinek.
    // Wysokość rośnie łagodnie, więc pionowo też jesteśmy pod progiem.
    const points: Point2D[] = [];
    for (let i = 0; i < 3_600; i++) {
      points.push({ x: (i / 3_600) * 290, y: 140 - (i / 3_600) * 120 });
    }

    // Dowód, że stara implementacja rysowała PUSTKĘ — to jest zgłoszony objaw.
    expect(oldSegmentCount(points)).toBe(0);

    const path = screenPath(points);
    expect(path.length).toBeGreaterThan(2);
    // Linia biegnie od pierwszej do ostatniej próbki: nic nie urywa się w połowie.
    expect(path[0]).toEqual(points[0]);
    expect(path[path.length - 1]).toEqual(points[points.length - 1]);
  });

  it('kolejne punkty są odległe o co najmniej krok — czyli każdy odcinek się rysuje', () => {
    const points: Point2D[] = [];
    for (let i = 0; i < 1_000; i++) points.push({ x: i * 0.3, y: 50 + Math.sin(i / 40) * 20 });

    const path = screenPath(points);

    for (let i = 1; i < path.length - 1; i++) {
      const dx = path[i]!.x - path[i - 1]!.x;
      const dy = path[i]!.y - path[i - 1]!.y;
      expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(MIN_SCREEN_STEP_PX);
    }
  });

  it('trasa rozciągnięta na kilkadziesiąt kilometrów nie gubi zakrętu', () => {
    // Kadr mapy: 300 px na 20 km, więc uproszczenie RDP (25 m) daje ~0,4 px na odcinek.
    // Zakręt o 90° musi przetrwać — to on jest treścią rysunku.
    const points: Point2D[] = [];
    for (let i = 0; i < 200; i++) points.push({ x: i * 0.4, y: 100 });
    for (let i = 1; i < 200; i++) points.push({ x: 80, y: 100 + i * 0.4 });

    const path = screenPath(points);
    const corner = path.find((p) => Math.abs(p.x - 80) < 1 && Math.abs(p.y - 100) < 1.5);

    expect(corner).toBeDefined();
    expect(path.length).toBeGreaterThan(50);
  });

  it('punkty rozrzucone szeroko zostają wszystkie', () => {
    const points: Point2D[] = [
      { x: 0, y: 0 },
      { x: 40, y: 10 },
      { x: 90, y: 60 },
      { x: 120, y: 20 },
    ];

    expect(screenPath(points)).toEqual(points);
  });

  it('dwa punkty i mniej przechodzą bez zmian', () => {
    expect(screenPath([])).toEqual([]);
    expect(screenPath([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
    expect(
      screenPath([
        { x: 1, y: 2 },
        { x: 1.1, y: 2.1 },
      ]),
    ).toHaveLength(2);
  });
});

/**
 * Druga tura przeglądu: „nadal na przełamaniach są dziury". Prostokąt o DOKŁADNEJ
 * długości odcinka styka się z sąsiadem w jednym punkcie osi — przy zaokrąglonych
 * końcach i obrocie to za mało, żeby linia była ciągła. Sprawdzone rysunkiem: łuk
 * o krótkich odcinkach rozpadał się w kropki, a wierzchołek załamania był ścięty.
 */
describe('odcinki łamanej — nadmiar na styku', () => {
  const THICK = 2.5;

  it('każdy prostokąt jest dłuższy od odcinka DOKŁADNIE o grubość kreski', () => {
    const segments = polylineSegments(
      [
        { x: 0, y: 0 },
        { x: 30, y: 40 }, // odcinek długości 50
      ],
      THICK,
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]!.length).toBeCloseTo(50 + THICK, 6);
    expect(segments[0]!.thickness).toBe(THICK);
  });

  it('prostokąt stoi ŚRODKIEM na środku odcinka', () => {
    const [segment] = polylineSegments(
      [
        { x: 10, y: 10 },
        { x: 10, y: 60 },
      ],
      THICK,
    );

    // Środek prostokąta = (left + length/2, top + thickness/2) w układzie sprzed obrotu.
    expect(segment!.left + segment!.length / 2).toBeCloseTo(10, 6);
    expect(segment!.top + segment!.thickness / 2).toBeCloseTo(35, 6);
  });

  it('sąsiedzi ZACHODZĄ na siebie wokół wspólnego wierzchołka', () => {
    // Załamanie 90° — najgorszy przypadek dla styku dwóch prostokątów.
    const segments = polylineSegments(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
      THICK,
    );

    for (const segment of segments) {
      const centerX = segment.left + segment.length / 2;
      const centerY = segment.top + segment.thickness / 2;
      // Odległość środka do wspólnego wierzchołka (40, 0) to połowa odcinka (20),
      // a prostokąt sięga 21,25 — czyli PRZECHODZI przez wierzchołek.
      const reach = segment.length / 2;
      expect(reach).toBeGreaterThan(Math.hypot(40 - centerX, 0 - centerY));
    }
  });

  it('gęsty łuk nie rozpada się w kropki — każdy prostokąt dłuższy niż gruby', () => {
    // Spirala wznoszenia po decymacji ekranowej: kroki rzędu 2 px.
    const arc: Point2D[] = [];
    for (let t = 0; t < 120; t++) arc.push({ x: Math.cos(t / 14) * 60, y: Math.sin(t / 14) * 60 });

    for (const segment of polylineSegments(screenPath(arc), THICK)) {
      expect(segment.length).toBeGreaterThan(THICK);
    }
  });

  it('punkty w tym samym pikselu nie produkują prostokąta o zerowej długości', () => {
    const segments = polylineSegments(
      [
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        { x: 25, y: 5 },
      ],
      THICK,
    );

    expect(segments).toHaveLength(1);
  });
});
