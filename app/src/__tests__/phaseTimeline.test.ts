/**
 * UZ Aero - test osi faz pionowych ze śladu GPS.
 *
 * Ta oś decyduje, ile paliwa model przypisze wznoszeniu, a ile przelotowi - czyli
 * o liczbach, których nikt nie zmierzył i nie ma jak sprawdzić „na oko". Test buduje
 * ślady o znanym profilu (równe wznoszenie, poziom, zniżanie) i sprawdza, czy oś je
 * odtwarza; osobno pilnuje rzeczy, która na prawdziwym nagraniu jest najgroźniejsza:
 * dryfu wysokości NA ZIEMI, który bez przecięcia z czasem lotu udawałby wznoszenie.
 */

import { buildPhaseTimeline, phaseTimesInWindow, type TrackPoint } from '../domain';

const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);
const sec = (n: number): number => T0 + n * 1000;

/** Punkt śladu przyjęty przez bramkę jakości. */
function point(secondsFromStart: number, altitudeFt: number | null): TrackPoint {
  return {
    time: sec(secondsFromStart),
    lat: 52.1,
    lon: 21.0,
    altitudeFt,
    groundSpeedKt: 80,
    trackDeg: 90,
    accuracyM: 5,
    rejected: null,
  };
}

/** Ślad o zadanym profilu: lista [czas_s, wysokość_ft]. */
const track = (rows: Array<[number, number]>): TrackPoint[] =>
  rows.map(([t, alt]) => point(t, alt));

describe('rozpoznanie faz pionowych', () => {
  it('równe wznoszenie 600 ft/min daje jeden odcinek climb', () => {
    // 10 ft/s = 600 ft/min, wyraźnie ponad próg 300.
    const points = track(Array.from({ length: 20 }, (_, i) => [i * 2, 1000 + i * 20]));
    const timeline = buildPhaseTimeline(points);

    expect(timeline.every((s) => s.phase === 'climb')).toBe(true);
    expect(timeline[0]!.from).toBe(sec(0));
  });

  it('lot poziomy to cruise, nie wznoszenie z szumu', () => {
    // Wysokość drga o ±10 ft wokół 4000 - regresja w oknie rozkłada to na zero.
    const points = track(
      Array.from({ length: 20 }, (_, i) => [i * 2, 4000 + (i % 2 === 0 ? 10 : -10)]),
    );
    const timeline = buildPhaseTimeline(points);

    expect(timeline.every((s) => s.phase === 'cruise')).toBe(true);
  });

  it('zniżanie rozpoznaje się osobno od wznoszenia', () => {
    const points = track(Array.from({ length: 20 }, (_, i) => [i * 2, 5000 - i * 20]));
    expect(buildPhaseTimeline(points).every((s) => s.phase === 'descent')).toBe(true);
  });

  it('profil wznoszenie → przelot → zniżanie daje trzy odcinki w tej kolejności', () => {
    const rows: Array<[number, number]> = [];
    for (let i = 0; i <= 30; i++) rows.push([i * 2, 1000 + i * 20]); // wznoszenie
    for (let i = 1; i <= 30; i++) rows.push([60 + i * 2, 1600]); // przelot
    for (let i = 1; i <= 30; i++) rows.push([120 + i * 2, 1600 - i * 20]); // zniżanie

    const phases = buildPhaseTimeline(track(rows)).map((s) => s.phase);

    expect(phases[0]).toBe('climb');
    expect(phases).toContain('cruise');
    expect(phases[phases.length - 1]).toBe('descent');
  });
});

describe('odporność wejścia', () => {
  it('punkty bez wysokości nie wchodzą do osi', () => {
    const points = [point(0, null), point(2, null), point(4, null)];
    expect(buildPhaseTimeline(points)).toEqual([]);
  });

  it('punkt odrzucony przez bramkę jakości nie tworzy fazy, której nie było', () => {
    // Fix ze skokiem wysokości o 3000 ft, oznaczony jako odrzucony - gdyby wszedł,
    // wyprodukowałby wznoszenie rzędu 90 000 ft/min.
    const points = [
      point(0, 4000),
      { ...point(2, 7000), rejected: 'accuracy' as const },
      point(4, 4005),
      point(6, 4010),
    ];

    expect(buildPhaseTimeline(points).every((s) => s.phase === 'cruise')).toBe(true);
  });

  it('jeden punkt to za mało na jakąkolwiek oś', () => {
    expect(buildPhaseTimeline([point(0, 4000)])).toEqual([]);
    expect(buildPhaseTimeline([])).toEqual([]);
  });
});

describe('czasy faz w oknie interwału', () => {
  const airborne = [{ from: sec(0), to: sec(120) }];

  it('sumują się do czasu w powietrzu objętego oknem', () => {
    const rows: Array<[number, number]> = [];
    for (let i = 0; i <= 30; i++) rows.push([i * 2, 1000 + i * 20]);
    for (let i = 1; i <= 30; i++) rows.push([60 + i * 2, 1600]);

    const timeline = buildPhaseTimeline(track(rows));
    const times = phaseTimesInWindow(timeline, airborne, sec(0), sec(120));

    const total = times.climbMs + times.cruiseMs + times.descentMs;
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(120_000);
    expect(times.climbMs).toBeGreaterThan(0);
  });

  it('NIE liczy dryfu wysokości na ziemi', () => {
    // Sedno przecięcia z czasem lotu. Ślad nagrywa się przy pracującym silniku, więc
    // obejmuje kołowanie - a wysokość GPS potrafi na płycie dryfować o kilkadziesiąt
    // stóp i wyprodukować „wznoszenie", którego nie było.
    const rows: Array<[number, number]> = [];
    for (let i = 0; i <= 30; i++) rows.push([i * 2, 800 + i * 20]); // „wznoszenie" na ziemi

    const timeline = buildPhaseTimeline(track(rows));
    // Samolot wystartował dopiero w 200. sekundzie - całe nagranie jest sprzed startu.
    const times = phaseTimesInWindow(timeline, [{ from: sec(200), to: sec(400) }], sec(0), sec(400));

    expect(times.climbMs).toBe(0);
    expect(times.cruiseMs).toBe(0);
    expect(times.descentMs).toBe(0);
  });

  it('okno poza nagraniem daje zera, nie wartości z rozpędu', () => {
    const timeline = buildPhaseTimeline(track([[0, 1000], [2, 1040], [4, 1080]]));
    const times = phaseTimesInWindow(timeline, airborne, sec(500), sec(600));

    expect(times).toEqual({ climbMs: 0, cruiseMs: 0, descentMs: 0 });
  });

  it('pusta oś nie wywraca liczenia', () => {
    expect(phaseTimesInWindow([], airborne, sec(0), sec(100))).toEqual({
      climbMs: 0,
      cruiseMs: 0,
      descentMs: 0,
    });
  });
});
