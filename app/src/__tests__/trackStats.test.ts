/**
 * UZ Aero - test statystyk śladu (issue #47 pkt 3).
 *
 * Statystyki opisują lot liczbami, których nikt nie mierzył przyrządem i których nie da
 * się sprawdzić „na oko" - dokładnie tak jak oś faz. Test buduje więc ślady o ZNANYM
 * przebiegu (równe wznoszenie, poziom z zadanym falowaniem, kołowanie o zadanej
 * prędkości) i pyta, czy statystyka je odtwarza.
 *
 * Osobno pilnuje trzech rzeczy, które na prawdziwym nagraniu psują wynik po cichu:
 * dryfu wysokości NA ZIEMI, pojedynczej szpilki prędkości i przerwy w zapisie.
 */

import {
  buildSessionTrackPayload,
  buildTrackStats,
  simplifyProfile,
  LEVEL_MIN_CRUISE_MS,
  type RawTrackEntry,
  type Span,
  type TrackPoint,
} from '../domain';

const T0 = Date.UTC(2026, 7, 14, 8, 0, 0);
const sec = (n: number): number => T0 + n * 1000;
const min = (n: number): number => T0 + n * 60_000;

function point(
  secondsFromStart: number,
  altitudeFt: number | null,
  groundSpeedKt: number | null = 80,
): TrackPoint {
  return {
    time: sec(secondsFromStart),
    lat: 52.1 + secondsFromStart * 0.0001,
    lon: 21.0,
    altitudeFt,
    groundSpeedKt,
    trackDeg: 90,
    accuracyM: 5,
    rejected: null,
  };
}

/** Ślad z listy [sekunda, wysokość, GS]. */
function track(rows: Array<[number, number | null, number?]>): TrackPoint[] {
  return rows.map(([t, alt, gs]) => point(t, alt, gs ?? 80));
}

/** Równomierny przebieg co sekundę: od `fromAlt` do `toAlt` w `spanSec`. */
function ramp(
  fromSec: number,
  spanSec: number,
  fromAlt: number,
  toAlt: number,
  gs = 80,
): Array<[number, number, number]> {
  const rows: Array<[number, number, number]> = [];
  for (let i = 0; i <= spanSec; i++) {
    rows.push([fromSec + i, fromAlt + ((toAlt - fromAlt) * i) / spanSec, gs]);
  }
  return rows;
}

const airborne = (fromSec: number, toSec: number): Span[] => [
  { from: sec(fromSec), to: sec(toSec) },
];

describe('statystyki śladu - prędkość i pion', () => {
  it('max wznoszenia i opadania odtwarza zadany profil', () => {
    // 5 minut po 600 ft/min w górę, potem 5 minut po 700 ft/min w dół.
    const points = track([...ramp(0, 300, 1_000, 4_000), ...ramp(301, 300, 4_000, 500)]);

    const stats = buildTrackStats(points, {
      airborne: airborne(0, 601),
      engineFrom: sec(0),
      engineTo: sec(601),
    });

    expect(stats.speed).not.toBeNull();
    expect(stats.speed!.maxClimbFtPerMin).toBeCloseTo(600, 0);
    // Zniżanie z 4 000 do 500 ft w 300 s to −700 ft/min; znak UJEMNY jest treścią.
    expect(stats.speed!.maxDescentFtPerMin).toBeLessThan(0);
    expect(stats.speed!.maxDescentFtPerMin).toBeCloseTo(-700, 0);
  });

  it('pojedyncza szpilka prędkości NIE zostaje rekordem lotu', () => {
    const points = track([
      [0, 1_000, 90],
      [1, 1_050, 92],
      [2, 1_100, 240], // szpilka: jeden fix, sąsiedzi normalni
      [3, 1_150, 91],
      [4, 1_200, 93],
    ]);

    const stats = buildTrackStats(points, {
      airborne: airborne(0, 4),
      engineFrom: sec(0),
      engineTo: sec(4),
    });

    expect(stats.speed!.maxGroundSpeedKt).toBeLessThan(100);
  });

  it('średnia prędkość liczy się TYLKO z czasu w powietrzu', () => {
    // 60 s kołowania po 10 kt, potem 60 s lotu po 100 kt.
    const points = track([...ramp(0, 60, 500, 500, 10), ...ramp(61, 60, 500, 1_500, 100)]);

    const stats = buildTrackStats(points, {
      airborne: airborne(61, 121),
      engineFrom: sec(0),
      engineTo: sec(121),
    });

    expect(stats.speed!.averageInFlightKt).toBeCloseTo(100, 0);
  });
});

describe('statystyki śladu - czasy faz', () => {
  it('suma faz równa się czasowi biegu silnika', () => {
    const points = track([
      ...ramp(0, 120, 500, 500, 12), // kołowanie
      ...ramp(121, 300, 500, 4_000, 90), // wznoszenie
      ...ramp(422, 300, 4_000, 4_000, 95), // przelot
      ...ramp(723, 200, 4_000, 500, 85), // zniżanie
      ...ramp(924, 120, 500, 500, 0), // postój z pracującym silnikiem
    ]);

    const stats = buildTrackStats(points, {
      airborne: airborne(121, 923),
      engineFrom: sec(0),
      engineTo: sec(1044),
    });

    const phases = stats.phases!;
    const total =
      phases.taxiMs + phases.standingMs + phases.climbMs + phases.cruiseMs + phases.descentMs;

    expect(total).toBe(sec(1044) - sec(0));
    expect(phases.taxiMs).toBeGreaterThan(100_000);
    expect(phases.standingMs).toBeGreaterThan(100_000);
    expect(phases.climbMs).toBeGreaterThan(0);
    expect(phases.descentMs).toBeGreaterThan(0);
  });

  it('dryf wysokości NA ZIEMI nie produkuje wznoszenia', () => {
    // Silnik pracuje, samolot stoi, a wysokość GPS faluje o ±40 ft.
    const rows: Array<[number, number, number]> = [];
    for (let i = 0; i <= 600; i++) rows.push([i, 500 + Math.sin(i / 5) * 40, 0]);

    const stats = buildTrackStats(track(rows), {
      airborne: [],
      engineFrom: sec(0),
      engineTo: sec(600),
    });

    expect(stats.phases!.climbMs).toBe(0);
    expect(stats.phases!.descentMs).toBe(0);
    expect(stats.phases!.standingMs).toBe(sec(600) - sec(0));
  });

  it('czas, którego nagranie nie obejmuje, idzie w POSTÓJ, nie w kołowanie', () => {
    // Nagranie zaczyna się 5 minut po uruchomieniu silnika.
    const points = track(ramp(300, 120, 500, 500, 12));

    const stats = buildTrackStats(points, {
      airborne: [],
      engineFrom: sec(0),
      engineTo: sec(420),
    });

    expect(stats.phases!.taxiMs).toBeCloseTo(120_000, -3);
    expect(stats.phases!.standingMs).toBeCloseTo(300_000, -3);
  });
});

describe('statystyki śladu - trzymanie wysokości', () => {
  it('lot równy: pasmo bliskie zeru, cały czas w tolerancji', () => {
    const points = track(ramp(0, 600, 3_000, 3_000, 95));

    const stats = buildTrackStats(points, {
      airborne: airborne(0, 600),
      engineFrom: sec(0),
      engineTo: sec(600),
    });

    expect(stats.level).not.toBeNull();
    expect(stats.level!.bandFt).toBeLessThan(5);
    expect(stats.level!.withinToleranceRatio).toBeCloseTo(1, 2);
  });

  it('rozjeżdżanie wysokości o ±150 ft widać w paśmie i w udziale czasu', () => {
    // Falowanie w skali MINUT (okres ~10 min) - tak wygląda niedokładne trzymanie
    // poziomu na przelocie. Prędkość pionowa nie przekracza 100 ft/min, więc oś faz
    // słusznie widzi tu przelot, a nie naprzemienne wznoszenie.
    const rows: Array<[number, number, number]> = [];
    for (let i = 0; i <= 900; i++) rows.push([i, 3_000 + Math.sin(i / 95) * 150, 95]);

    const stats = buildTrackStats(track(rows), {
      airborne: airborne(0, 900),
      engineFrom: sec(0),
      engineTo: sec(900),
    });

    expect(stats.level!.bandFt).toBeGreaterThan(80);
    expect(stats.level!.withinToleranceRatio).toBeLessThan(1);
    expect(stats.level!.longestSteadyMs).toBeLessThan(stats.level!.levelMs);
  });

  it('krótkie wahnięcie NIE tnie lotu poziomego na kawałki', () => {
    // 4 minuty poziomu, 20 sekund górki o ~360 ft/min, znowu 4 minuty poziomu.
    // Bez sklejania (`LEVEL_MERGE_GAP_MS`) „najdłuższy równy odcinek" mierzyłby
    // odstępy między turbulencjami zamiast trzymania wysokości.
    const rows: Array<[number, number, number]> = [
      ...ramp(0, 240, 3_000, 3_000, 95),
      ...ramp(241, 20, 3_000, 3_120, 95),
      ...ramp(262, 240, 3_120, 3_120, 95),
    ];

    const stats = buildTrackStats(track(rows), {
      airborne: airborne(0, 502),
      engineFrom: sec(0),
      engineTo: sec(502),
    });

    expect(stats.level).not.toBeNull();
    // Cały lot poziomy w jednym kawałku, mimo górki w środku.
    expect(stats.level!.levelMs).toBeGreaterThan(400_000);
  });

  it('przelot krótszy niż próg - blok MILCZY zamiast orzekać z trzech odczytów', () => {
    const shortCruiseSec = LEVEL_MIN_CRUISE_MS / 1000 - 30;
    const points = track(ramp(0, shortCruiseSec, 3_000, 3_000, 95));

    const stats = buildTrackStats(points, {
      airborne: airborne(0, shortCruiseSec),
      engineFrom: sec(0),
      engineTo: sec(shortCruiseSec),
    });

    expect(stats.level).toBeNull();
  });

  it('wznoszenie NIE wchodzi do pasma wahań', () => {
    // Samo wznoszenie o 3 000 ft: gdyby weszło, pasmo liczyłoby się w tysiącach stóp.
    const points = track(ramp(0, 600, 1_000, 4_000, 90));

    const stats = buildTrackStats(points, {
      airborne: airborne(0, 600),
      engineFrom: sec(0),
      engineTo: sec(600),
    });

    expect(stats.level == null || stats.level.bandFt < 200).toBe(true);
  });
});

describe('upraszczanie profilu', () => {
  it('prosta wznosząca zwija się do dwóch punktów', () => {
    const samples = ramp(0, 600, 1_000, 4_000).map(([t, alt]) => ({
      time: sec(t),
      altitudeFt: alt,
    }));

    expect(simplifyProfile(samples)).toHaveLength(2);
  });

  it('przegięcie profilu zostaje', () => {
    const samples = [
      ...ramp(0, 300, 1_000, 4_000),
      ...ramp(301, 300, 4_000, 1_000),
    ].map(([t, alt]) => ({ time: sec(t), altitudeFt: alt }));

    const simplified = simplifyProfile(samples);

    expect(simplified.length).toBeGreaterThan(2);
    expect(simplified.length).toBeLessThan(20);
    // Szczyt musi przetrwać - to najczęściej czytana liczba profilu.
    expect(Math.max(...simplified.map((s) => s.altitudeFt))).toBeCloseTo(4_000, 0);
  });
});

describe('koperta śladu przez sieć', () => {
  const entries: RawTrackEntry[] = ramp(0, 600, 1_000, 4_000, 90).map(([t, alt, gs]) => ({
    kind: 'fix',
    time: sec(t),
    lat: 52.123456789 + t * 0.00001,
    lon: 21.987654321,
    alt,
    gs,
    accuracyM: 4,
  }));

  const payload = buildSessionTrackPayload('S-1', entries, {
    airborne: airborne(0, 600),
    engineFrom: sec(0),
    engineTo: sec(600),
  });

  it('ścina nagranie do rozmiaru, który da się przesłać', () => {
    expect(payload.totalCount).toBe(601);
    // Prosta linia i prosty profil zwijają się prawie do niczego - o to chodzi.
    expect(payload.line.length).toBeLessThan(20);
    expect(payload.profile.samples.length).toBeLessThan(20);
  });

  it('przycina liczby do rozdzielczości, w jakiej cokolwiek znaczą', () => {
    for (const vertex of payload.line) {
      expect(vertex.lat).toBeCloseTo(Math.round(vertex.lat * 1e5) / 1e5, 10);
      expect(vertex.altitudeFt).toBe(Math.round(vertex.altitudeFt!));
    }
  });

  it('statystyki liczą się z KOMPLETU punktów, nie z uproszczonej linii', () => {
    // 3 000 ft w 600 s to 300 ft/min - wartość, której uproszczona linia nie zmienia,
    // ale która musi wyjść z pełnego nagrania.
    expect(payload.stats.speed!.maxClimbFtPerMin).toBeCloseTo(300, 0);
    expect(payload.usableCount).toBe(601);
  });

  it('operacja bez nagrania daje ten sam kształt, nie inny wariant', () => {
    const empty = buildSessionTrackPayload('S-2', [], {
      airborne: [],
      engineFrom: sec(0),
      engineTo: sec(600),
    });

    expect(empty.line).toEqual([]);
    expect(empty.stats.speed).toBeNull();
    expect(empty.usableCount).toBe(0);
  });
});
