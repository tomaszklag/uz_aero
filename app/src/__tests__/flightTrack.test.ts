/**
 * UZ Aero - testy projekcji śladu lotu (mapa, profil, log punktów).
 *
 * Sens tych testów jest ten sam co przy detektorze: consumer-grade GPS kłamie, a ślad
 * rysujemy Z TEGO SAMEGO zapisu, który kłamał. Różnica jest taka, że detektor kłamstwo
 * ignoruje, a ekran śladu ma je POKAZAĆ z powodem - więc testujemy nie tylko „czy
 * odrzucono", ale „czy powód jest ten, którego oczekuje kolumna Uwagi".
 *
 * Osobna rodzina asercji pilnuje SPÓJNOŚCI z detektorem: gdyby ktoś zmienił próg
 * dokładności w `thresholds.ts` tylko dla jednej ścieżki, ślad przestałby pokazywać to,
 * co naprawdę widział algorytm - a po to właśnie istnieje.
 */

import {
  buildFlightProfile,
  buildFlightTrack,
  emptyFlightTrack,
  entryUsableByDetector,
  impliedSpeedKt,
  rejectionReason,
  simplifyTrack,
  type RawTrackEntry,
} from '../domain';
import { GPS_THRESHOLDS as T } from '../domain';

const T0 = Date.UTC(2026, 5, 22, 11, 28, 0);

/** Sekunda scenariusza → epoch ms. */
const t = (sec: number) => T0 + sec * 1000;

/** Okolice EPZG; +1/60 stopnia szerokości to ~1 NM na północ. */
const BASE = { lat: 52.1387, lon: 15.7986 };
const NM = 1 / 60;

/** Wpis śladu z rozsądnymi wartościami domyślnymi - test nadpisuje tylko to, co bada. */
function fix(sec: number, over: Partial<RawTrackEntry> = {}): RawTrackEntry {
  return {
    kind: 'fix',
    time: t(sec),
    lat: BASE.lat,
    lon: BASE.lon,
    alt: 1000,
    gs: 80,
    trackDeg: 240,
    accuracyM: 5,
    ...over,
  };
}

/** Lot: 10 punktów co 30 s, lecących prosto na północ, wznoszenie 500 ft na punkt. */
function straightClimb(): RawTrackEntry[] {
  return Array.from({ length: 10 }, (_, i) =>
    fix(i * 30, { lat: BASE.lat + i * 0.2 * NM, alt: 400 + i * 500 }),
  );
}

const WINDOW = { takeoffAt: t(0), landingAt: t(600) };

describe('buildFlightTrack - okno lotu', () => {
  it('bierze wyłącznie fixy z przedziału takeoff…landing', () => {
    const entries = [
      fix(-60), // przed startem - kołowanie
      fix(30),
      fix(60),
      fix(900), // po lądowaniu - kołowanie z powrotem
    ];

    const track = buildFlightTrack(entries, { takeoffAt: t(0), landingAt: t(120) });

    expect(track.totalCount).toBe(2);
    expect(track.points.map((p) => p.time)).toEqual([t(30), t(60)]);
  });

  it('lot w powietrzu (landingAt = null) bierze zapis do ostatniego wpisu', () => {
    const track = buildFlightTrack(straightClimb(), { takeoffAt: t(0), landingAt: null });
    expect(track.totalCount).toBe(10);
  });

  it('pomija wiersze czujników - do trasy idą tylko fixy', () => {
    const entries = [fix(30), { kind: 'sensor', time: t(45) } as RawTrackEntry, fix(60)];
    const track = buildFlightTrack(entries, WINDOW);
    expect(track.totalCount).toBe(2);
  });

  it('sortuje wpisy po czasie - zapis wsadowy potrafi je pomieszać', () => {
    const track = buildFlightTrack([fix(90), fix(30), fix(60)], WINDOW);
    expect(track.points.map((p) => p.time)).toEqual([t(30), t(60), t(90)]);
  });

  it('brak fixów w oknie daje pusty ślad (lot ręczny - wariant 14B)', () => {
    const track = buildFlightTrack([fix(900)], WINDOW);
    expect(track).toEqual(emptyFlightTrack());
  });
});

describe('buildFlightTrack - bramka jakości', () => {
  it('odrzuca fix z dokładnością gorszą niż próg, z powodem accuracy', () => {
    const entries = [fix(30), fix(60, { accuracyM: T.MAX_FIX_ACCURACY_M + 18 }), fix(90)];
    const track = buildFlightTrack(entries, WINDOW);

    expect(track.points[1]!.rejected).toBe('accuracy');
    expect(track.usableCount).toBe(2);
    expect(track.totalCount).toBe(3);
  });

  it('odrzucony punkt zostaje w logu - panel pokazuje go z powodem', () => {
    const track = buildFlightTrack([fix(30, { accuracyM: 120 })], WINDOW);
    expect(track.points).toHaveLength(1);
    expect(track.line).toHaveLength(0);
  });

  it('odrzuca teleportację jako jump', () => {
    const entries = [
      fix(30),
      // 40 NM w 30 s to ~4800 kt - multipath albo spoofing.
      fix(60, { lat: BASE.lat + 40 * NM }),
      fix(90),
    ];
    const track = buildFlightTrack(entries, WINDOW);
    expect(track.points[1]!.rejected).toBe('jump');
  });

  it('odrzucony punkt NIE jest odniesieniem skoku - inaczej ginie cały ogon trasy', () => {
    const entries = [
      fix(30),
      fix(60, { lat: BASE.lat + 40 * NM }), // teleportacja
      fix(90), // wraca na właściwą pozycję - musi być przyjęty
      fix(120),
    ];
    const track = buildFlightTrack(entries, WINDOW);

    expect(track.points[1]!.rejected).toBe('jump');
    expect(track.points[2]!.rejected).toBeNull();
    expect(track.points[3]!.rejected).toBeNull();
  });

  it('wiersz bez pozycji dostaje no-position i nie wchodzi do geometrii', () => {
    const track = buildFlightTrack([fix(30, { lat: null, lon: null }), fix(60)], WINDOW);
    expect(track.points[0]!.rejected).toBe('no-position');
    expect(track.usableCount).toBe(1);
  });

  it('brak dokładności i prędkości nie dyskwalifikuje - odrzucamy tylko zły POMIAR', () => {
    const track = buildFlightTrack([fix(30, { accuracyM: null, gs: null })], WINDOW);
    expect(track.points[0]!.rejected).toBeNull();
  });

  it('pierwszy punkt trasy nie ma względem czego skakać', () => {
    const track = buildFlightTrack([fix(30, { lat: BASE.lat + 40 * NM })], WINDOW);
    expect(track.points[0]!.rejected).toBeNull();
  });
});

describe('rejectionReason - spójność z bramką detektora', () => {
  // Gdyby ktoś zmienił próg w jednym miejscu, a w drugim nie, ślad przestałby
  // pokazywać to, co widział algorytm. Test skoku pomijamy: detektor liczy go
  // z własnego bufora, a nie z pojedynczego odczytu.
  const cases: RawTrackEntry[] = [
    fix(0),
    fix(0, { accuracyM: T.MAX_FIX_ACCURACY_M }),
    fix(0, { accuracyM: T.MAX_FIX_ACCURACY_M + 1 }),
    fix(0, { gs: T.MAX_PLAUSIBLE_SPEED_KT }),
    fix(0, { gs: T.MAX_PLAUSIBLE_SPEED_KT + 1 }),
    fix(0, { accuracyM: null, gs: null }),
  ];

  it.each(cases)('ta sama decyzja co fixUsable dla %j', (entry) => {
    const rejected = rejectionReason(entry, null);
    expect(rejected == null).toBe(entryUsableByDetector(entry));
  });
});

describe('impliedSpeedKt', () => {
  it('liczy prędkość implikowaną przeskokiem', () => {
    // 1 NM w 30 s = 120 kt.
    const speed = impliedSpeedKt(
      { ...BASE, time: t(0) },
      { lat: BASE.lat + NM, lon: BASE.lon, time: t(30) },
    );
    expect(speed).toBeCloseTo(120, 0);
  });

  it('zwraca null przy zerowym odstępie - dzielenie przez zero odrzuciłoby dobry punkt', () => {
    expect(impliedSpeedKt({ ...BASE, time: t(0) }, { ...BASE, time: t(0) })).toBeNull();
  });
});

describe('buildFlightTrack - metryki', () => {
  it('liczy dystans z PEŁNEJ listy przyjętych punktów, nie z uproszczonej', () => {
    // Drobny zygzak: amplituda ~10 m jest PONIŻEJ tolerancji upraszczania (25 m),
    // więc RDP zetnie go do odcinka - ale przebyta droga jest dłuższa od cięciwy
    // i dystans musi to widzieć. Gdyby liczył się z uproszczonej linii, wyszłaby
    // dokładnie długość prostej.
    const stepLat = 100 / 111_132; // 100 m na północ
    const wobbleLon = 10 / (111_320 * Math.cos((BASE.lat * Math.PI) / 180)); // ±10 m
    const count = 20;
    const entries = Array.from({ length: count }, (_, i) =>
      fix(i * 30, {
        lat: BASE.lat + i * stepLat,
        lon: BASE.lon + (i % 2 === 0 ? 0 : wobbleLon),
      }),
    );

    const track = buildFlightTrack(entries, { takeoffAt: t(0), landingAt: t(count * 30) });
    const straightNm = ((count - 1) * 100) / 1852;

    expect(track.usableCount).toBe(count);
    expect(track.line).toHaveLength(2); // zygzak zniknął z geometrii…
    expect(track.distanceNm).toBeGreaterThan(straightNm * 1.005); // …ale nie z dystansu
  });

  it('podaje najwyższy przyjęty odczyt wysokości', () => {
    const track = buildFlightTrack(straightClimb(), WINDOW);
    expect(track.maxAltitudeFt).toBe(400 + 9 * 500);
  });

  it('pomija wysokość z odrzuconego fixa - szpilka, której nie było', () => {
    const entries = [fix(30, { alt: 1000 }), fix(60, { alt: 9000, accuracyM: 300 }), fix(90, { alt: 1200 })];
    const track = buildFlightTrack(entries, WINDOW);
    expect(track.maxAltitudeFt).toBe(1200);
  });

  it('czasy brzegowe biorą się z przyjętych punktów, nie z okna lotu', () => {
    const track = buildFlightTrack([fix(30), fix(90)], WINDOW);
    expect(track.startedAt).toBe(t(30));
    expect(track.endedAt).toBe(t(90));
  });
});

describe('simplifyTrack', () => {
  it('zachowuje pierwszy i ostatni punkt - to start i lądowanie', () => {
    const points = straightClimb().map((e) => ({ lat: e.lat!, lon: e.lon! }));
    const simplified = simplifyTrack(points, 25);

    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it('wycina punkty leżące na prostej', () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      lat: BASE.lat + i * NM,
      lon: BASE.lon,
    }));
    expect(simplifyTrack(points, 25)).toHaveLength(2);
  });

  it('zachowuje ciasny zakręt, choćby trwał kilka odczytów', () => {
    const points = [
      { lat: BASE.lat, lon: BASE.lon },
      { lat: BASE.lat + NM, lon: BASE.lon },
      { lat: BASE.lat + 2 * NM, lon: BASE.lon },
      { lat: BASE.lat + 2 * NM, lon: BASE.lon + NM }, // ostry skręt w prawo
      { lat: BASE.lat + 2 * NM, lon: BASE.lon + 2 * NM },
    ];
    const simplified = simplifyTrack(points, 25);
    expect(simplified).toContainEqual({ lat: BASE.lat + 2 * NM, lon: BASE.lon });
  });

  it('trasa z dwóch punktów zostaje nietknięta', () => {
    const points = [BASE, { lat: BASE.lat + NM, lon: BASE.lon }];
    expect(simplifyTrack(points, 25)).toEqual(points);
  });
});

describe('buildFlightProfile', () => {
  it('znajduje szczyt i liczy średnie prędkości pionowe', () => {
    // Wznoszenie 0→10 000 ft w 10 min, potem zejście do 400 ft w 5 min.
    const entries = [
      fix(0, { alt: 400 }),
      fix(300, { alt: 5200 }),
      fix(600, { alt: 10400 }),
      fix(900, { alt: 400 }),
    ];
    const track = buildFlightTrack(entries, { takeoffAt: t(0), landingAt: t(900) });
    const profile = buildFlightProfile(track.points);

    expect(profile.peakAltitudeFt).toBe(10400);
    expect(profile.peakAt).toBe(t(600));
    expect(profile.timeToPeakMs).toBe(600_000);
    expect(profile.averageClimbFtPerMin).toBeCloseTo(1000, 0);
    expect(profile.averageDescentFtPerMin).toBeCloseTo(-2000, 0);
  });

  it('pomija punkty odrzucone przez bramkę', () => {
    const entries = [fix(0, { alt: 400 }), fix(30, { alt: 9000, accuracyM: 300 }), fix(60, { alt: 800 })];
    const track = buildFlightTrack(entries, WINDOW);
    const profile = buildFlightProfile(track.points);

    expect(profile.samples).toHaveLength(2);
    expect(profile.peakAltitudeFt).toBe(800);
  });

  it('lot bez odczytów wysokości daje pusty profil, a nie zera', () => {
    const track = buildFlightTrack([fix(30, { alt: null })], WINDOW);
    const profile = buildFlightProfile(track.points);

    expect(profile.samples).toHaveLength(0);
    expect(profile.peakAltitudeFt).toBeNull();
    expect(profile.averageClimbFtPerMin).toBeNull();
  });

  it('szczyt w pierwszym punkcie nie produkuje nieskończonego wznoszenia', () => {
    const entries = [fix(0, { alt: 5000 }), fix(300, { alt: 400 })];
    const track = buildFlightTrack(entries, { takeoffAt: t(0), landingAt: t(300) });
    const profile = buildFlightProfile(track.points);

    expect(profile.averageClimbFtPerMin).toBeNull();
    expect(profile.averageDescentFtPerMin).toBeCloseTo(-920, 0);
  });
});
