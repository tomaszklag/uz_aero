/**
 * Ninerdeck - testy GEOMETRII WYKRESÓW karty maszyny (obserwowanie 3.2.0, §6.4).
 *
 * Pod obserwacją: dwie skale pionu (licznik od dna okna, paliwo od zera do pojemności),
 * odcinek pełny wewnątrz operacji i przerywany na postoju, kursor wskazujący
 * NAJBLIŻSZY punkt ze źródłem, podpisy osi z okna WIDOCZNEGO.
 */

import {
  axisLabels,
  buildSeriesPlot,
  cursorReading,
  seriesHead,
  toSeries,
  valueRange,
  type SeriesPoint,
} from '../ui/screens/logic/aircraftSeries';

const H = 3_600_000;
const DAY = 24 * H;
const NOW = Date.UTC(2026, 8, 25, 10, 0);
const FROM = NOW - 90 * DAY;

const pt = (
  daysAgo: number,
  value: number,
  source: SeriesPoint['source'],
  sessionUuid: string | null = 's1',
  pilotId: string | null = 'jwr',
): SeriesPoint => ({ at: NOW - daysAgo * DAY, value, source, sessionUuid, pilotId });

const SIZE = { from: FROM, to: NOW, width: 320, height: 150 };

describe('skala pionu', () => {
  it('licznik idzie od dna do sufitu OKNA na pełnych godzinach, nie od zera', () => {
    expect(valueRange('mh', [pt(10, 1198.4, 'claim'), pt(2, 1236.5, 'release')], null)).toEqual({ low: 1198, high: 1237 });
  });

  it('paliwo idzie od zera do POJEMNOŚCI - zero jest tu wartością', () => {
    expect(valueRange('fuel', [pt(10, 168, 'claim'), pt(2, 96, 'release')], 180)).toEqual({ low: 0, high: 180 });
    // Odczyt ponad pojemność (tankowanie poza aplikacją) podnosi sufit, zamiast wystawać.
    expect(valueRange('fuel', [pt(10, 190, 'claim')], 180).high).toBe(190);
  });

  it('linia płaska dostaje sztuczny zakres - skala zerowej wysokości nic nie narysuje', () => {
    const r = valueRange('mh', [pt(10, 1200, 'claim'), pt(2, 1200, 'release')], null);
    expect(r.high).toBeGreaterThan(r.low);
    expect(valueRange('fuel', [], null).high).toBeGreaterThan(0);
  });
});

describe('odcinki', () => {
  it('wewnątrz operacji pełne, między zdaniem a następnym przejęciem przerywane', () => {
    const plot = buildSeriesPlot({
      kind: 'fuel',
      capacityL: 180,
      points: [
        pt(10, 128, 'claim', 'a'),
        pt(9.9, 172, 'refuel', 'a'),
        pt(9.8, 96, 'release', 'a'),
        pt(5, 96, 'claim', 'b'),
        pt(4.9, 40, 'release', 'b'),
      ],
      ...SIZE,
    });
    expect(plot.runs.map((r) => r.kind)).toEqual(['engine', 'engine', 'idle', 'engine']);
    // Punkty są w porządku czasu, a X rośnie z czasem.
    for (let i = 1; i < plot.points.length; i += 1) {
      expect(plot.points[i]!.x).toBeGreaterThanOrEqual(plot.points[i - 1]!.x);
    }
  });

  it('wpis administratora otwiera odcinek „postoju" - pada przy biurku, nie w kabinie', () => {
    const plot = buildSeriesPlot({
      kind: 'mh',
      points: [pt(10, 1200, 'release', 'a'), pt(8, 1201, 'admin', null, 'ako'), pt(5, 1201, 'claim', 'b')],
      ...SIZE,
    });
    expect(plot.runs.map((r) => r.kind)).toEqual(['idle', 'idle']);
  });

  it('cztery poziomy siatki: górny paliwa z jednostką, licznik z odstępem tysięcy', () => {
    const fuel = buildSeriesPlot({ kind: 'fuel', capacityL: 180, points: [pt(3, 100, 'claim')], ...SIZE });
    expect(fuel.grid.map((g) => g.label)).toEqual(['180 L', '120', '60', '0']);
    const mh = buildSeriesPlot({ kind: 'mh', points: [pt(10, 1198, 'claim'), pt(1, 1237, 'release')], ...SIZE });
    expect(mh.grid[0]!.label).toBe('1 237');
    expect(mh.grid[3]!.label).toBe('1 198');
    expect(mh.grid[0]!.y).toBeLessThan(mh.grid[3]!.y);
  });

  it('punkt bez czytelnej chwili WYPADA z serii', () => {
    expect(toSeries([{ at: 'kiedyś', value: 1, source: 'claim', sessionUuid: null, pilotId: null }])).toEqual([]);
    expect(toSeries([{ at: '2026-09-25T08:00:00Z', value: 1, source: 'claim', sessionUuid: null, pilotId: null }])).toHaveLength(1);
  });
});

describe('kursor i podpisy', () => {
  const plot = buildSeriesPlot({
    kind: 'mh',
    points: [pt(11, 1224.17, 'release', 'a', 'jwr'), pt(3, 1230, 'claim', 'b', 'ako')],
    ...SIZE,
  });
  const nameOf = (id: string) => ({ jwr: 'Jakub Wrona', ako: 'Adam Kowalski' })[id] ?? null;

  it('kursor wskazuje NAJBLIŻSZY punkt i mówi chwilę, wartość i źródło', () => {
    const reading = cursorReading(plot, NOW - 9 * DAY, 'mh', 'hhmm', nameOf)!;
    expect(reading.point.source).toBe('release');
    expect(reading.title).toBe('14 WRZ 10:00 · 1224:10');
    expect(reading.sub).toBe('zdanie samolotu · J. Wrona');
    expect(cursorReading({ ...plot, points: [] }, NOW, 'mh', 'hhmm', nameOf)).toBeNull();
  });

  it('podpisy osi mówią o oknie WIDOCZNYM, a koniec sięgający „teraz" pisze DZIŚ', () => {
    const full = axisLabels({ from: FROM, to: NOW }, 300, NOW);
    expect(full.map((l) => l.text)).toEqual(['27 CZE', '11 SIE', 'DZIŚ']);
    expect(full.map((l) => l.anchor)).toEqual(['start', 'middle', 'end']);
    const zoomed = axisLabels({ from: NOW - 20 * DAY, to: NOW - 6 * DAY }, 300, NOW);
    expect(zoomed[2]!.text).toBe('19 WRZ');
  });

  it('nagłówek: przyrost licznika w oknie i paliwo zużyte WEWNĄTRZ operacji z liczbą tankowań', () => {
    expect(seriesHead('mh', [pt(10, 1198.5, 'claim'), pt(1, 1236.67, 'release')], 'hhmm', 90)).toEqual({
      value: '+38:10',
      note: 'w 90 dni',
    });
    expect(seriesHead('mh', [pt(10, 1198.5, 'claim')], 'hhmm', 90).value).toBeNull();
    const fuel = seriesHead(
      'fuel',
      [pt(10, 128, 'claim', 'a'), pt(9.9, 172, 'refuel', 'a'), pt(9.8, 96, 'release', 'a'), pt(5, 60, 'claim', 'b'), pt(4, 20, 'release', 'b')],
      'hhmm',
      90,
    );
    // 172 → 96 i 60 → 20; spadek 96 → 60 między operacjami NIE jest zużyciem.
    expect(fuel).toEqual({ value: '116 L', note: 'zużyte w 90 dni · 1 tankowanie' });
  });
});
