/**
 * UZ Aero — testy modułów pomocniczych detekcji: bufor historii, cechy trendowe,
 * retro-datowanie.
 *
 * `flightDetector.test.ts` sprawdza je pośrednio, na całych scenariuszach lotu. Tutaj
 * badamy je w izolacji, bo każdy z nich ma własne przypadki brzegowe, których przez
 * automat nie da się wygodnie trafić: przejście kursu przez północ, okno za ciasne
 * w czasie, przerwana seria wysokości. W scenariuszu lotu takie rzeczy giną w tłumie.
 */

import {
  createHistory,
  fixesInWindow,
  groundSpeed,
  liftoffOnset,
  newestFix,
  pathDisplacementNm,
  pushFix,
  speedTrendKtPerSec,
  taxiOnset,
  touchdownOnset,
  turnRateDps,
  type FixHistory,
  type GpsFix,
} from '../domain';

const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);
const t = (sec: number) => T0 + sec * 1000;

const FIELD = { lat: 50.078, lon: 19.785 };
const mNorth = (m: number) => ({ lat: FIELD.lat + m / 1852 / 60, lon: FIELD.lon });

const fill = (fixes: readonly GpsFix[], spanSec = 120): FixHistory =>
  fixes.reduce<FixHistory>((h, f) => pushFix(h, f), createHistory(spanSec));

describe('bufor historii', () => {
  it('przycina okno do zadanej głębokości i zachowuje kolejność', () => {
    const h = fill(
      Array.from({ length: 40 }, (_, i) => ({ time: t(i), groundSpeedKt: i, altitudeFt: null })),
      10,
    );

    expect(newestFix(h)?.time).toBe(t(39));
    // Okno 10 s liczone od najnowszego → fixy t(29)…t(39) włącznie.
    expect(h.fixes[0]!.time).toBe(t(29));
    expect(h.fixes).toHaveLength(11);
  });

  it('odrzuca fix starszy niż najnowszy (cofnięty zegar nie miesza kolejności)', () => {
    // Chronologia jest niepisanym założeniem regresji i szukania onsetu — po przemieszaniu
    // zwracałyby liczbę, która wygląda sensownie i jest nieprawdziwa.
    const h = fill([
      { time: t(10), groundSpeedKt: 10, altitudeFt: null },
      { time: t(4), groundSpeedKt: 99, altitudeFt: null },
    ]);

    expect(h.fixes).toHaveLength(1);
    expect(newestFix(h)?.time).toBe(t(10));
  });

  it('fixesInWindow zwraca pustą listę dla pustego bufora', () => {
    expect(fixesInWindow(createHistory(), 10)).toEqual([]);
  });
});

describe('prędkość z okna', () => {
  it('doppler: mediana odrzuca pojedynczą szpilkę, nie wygładzając narastania', () => {
    const fixes: GpsFix[] = [10, 12, 140, 13, 14].map((kt, i) => ({
      time: t(i),
      groundSpeedKt: kt,
      altitudeFt: null,
    }));

    expect(groundSpeed(fixes)).toEqual({ kt: 13, source: 'doppler' });
  });

  it('brak dopplera: prędkość odtworzona z przemieszczenia', () => {
    // 20,58 m/s = 40 kt. Dziesięć sekund → 205,8 m.
    const fixes: GpsFix[] = Array.from({ length: 11 }, (_, i) => ({
      time: t(i),
      groundSpeedKt: null,
      altitudeFt: null,
      ...mNorth(20.58 * i),
    }));

    const speed = groundSpeed(fixes)!;
    expect(speed.source).toBe('position');
    expect(speed.kt).toBeCloseTo(40, 0);
  });

  it('bez dopplera i bez pozycji nie zmyślamy liczby — null', () => {
    expect(groundSpeed([{ time: t(0), groundSpeedKt: null, altitudeFt: null }])).toBeNull();
  });
});

describe('przyspieszenie podłużne', () => {
  it('rozbieg: dodatnie nachylenie regresji', () => {
    const roll: GpsFix[] = [20, 30, 40, 50, 60, 70].map((kt, i) => ({
      time: t(i),
      groundSpeedKt: kt,
      altitudeFt: null,
    }));

    expect(speedTrendKtPerSec(roll)).toBeCloseTo(10, 1);
  });

  it('dobieg: ujemne nachylenie — to ta liczba odróżnia go od rozbiegu', () => {
    const rollout: GpsFix[] = [70, 60, 50, 40, 30, 20].map((kt, i) => ({
      time: t(i),
      groundSpeedKt: kt,
      altitudeFt: null,
    }));

    expect(speedTrendKtPerSec(rollout)).toBeCloseTo(-10, 1);
  });

  it('okno ciaśniejsze niż minimum → null, a nie liczba z sufitu', () => {
    const tight: GpsFix[] = [20, 60].map((kt, i) => ({
      time: t(i),
      groundSpeedKt: kt,
      altitudeFt: null,
    }));

    expect(speedTrendKtPerSec(tight)).toBeNull();
  });
});

describe('prędkość kątowa z kursu', () => {
  it('stały zakręt 5 °/s', () => {
    const turning: GpsFix[] = Array.from({ length: 11 }, (_, i) => ({
      time: t(i),
      groundSpeedKt: 80,
      altitudeFt: null,
      trackDeg: (90 + i * 5) % 360,
    }));

    expect(turnRateDps(turning)).toBeCloseTo(5, 1);
  });

  it('PRZEJŚCIE PRZEZ PÓŁNOC nie robi skoku o 360° (355° → 5° to 10°, nie 350°)', () => {
    const throughNorth: GpsFix[] = [355, 357, 359, 1, 3, 5].map((deg, i) => ({
      time: t(i),
      groundSpeedKt: 80,
      altitudeFt: null,
      trackDeg: deg,
    }));

    // Łącznie 10° w 5 s = 2 °/s. Bez różnicy kołowej wyszłoby ~70 °/s i weto
    // zakrętu unieważniałoby lądowania na kursach północnych.
    expect(turnRateDps(throughNorth)).toBeCloseTo(2, 1);
  });

  it('szum wokół stałego kursu znosi się — lot prosty ma ~0 °/s', () => {
    const straight: GpsFix[] = [270, 272, 269, 271, 270, 271].map((deg, i) => ({
      time: t(i),
      groundSpeedKt: 80,
      altitudeFt: null,
      trackDeg: deg,
    }));

    expect(turnRateDps(straight)!).toBeLessThan(1);
  });

  it('brak kursu w fixach → null (nie wetujemy tego, czego nie zmierzyliśmy)', () => {
    const noTrack: GpsFix[] = Array.from({ length: 6 }, (_, i) => ({
      time: t(i),
      groundSpeedKt: 20,
      altitudeFt: null,
    }));

    expect(turnRateDps(noTrack)).toBeNull();
  });
});

describe('przemieszczenie netto', () => {
  it('liczy odległość skrajnych pozycji, nie długość trasy', () => {
    // Samolot wraca tam, skąd wyruszył: droga 200 m, przemieszczenie netto 0.
    const there = Array.from({ length: 6 }, (_, i) => mNorth(i * 20));
    const back = Array.from({ length: 6 }, (_, i) => mNorth(100 - i * 20));
    const fixes: GpsFix[] = [...there, ...back].map((pos, i) => ({
      time: t(i),
      groundSpeedKt: null,
      altitudeFt: null,
      ...pos,
    }));

    expect(pathDisplacementNm(fixes)!).toBeCloseTo(0, 3);
  });
});

describe('retro-datowanie', () => {
  const FIELD_ELEV = 800;

  it('taxiOnset wskazuje OSTATNI fix przy kotwicy, czyli zwolnienie hamulców', () => {
    const h = fill(
      Array.from({ length: 12 }, (_, i) => ({
        time: t(i),
        groundSpeedKt: null,
        altitudeFt: FIELD_ELEV,
        // Postój do t=5, potem ruch po 6 m/s.
        ...mNorth(i <= 5 ? 0 : (i - 5) * 6),
      })),
    );

    // Promień 10 m: ostatni fix wewnątrz to t=6 (6 m), t=7 ma już 12 m.
    expect(taxiOnset(h, FIELD, 10)).toBe(t(6));
  });

  it('taxiOnset bez kotwicy zwraca null zamiast zgadywać', () => {
    expect(taxiOnset(fill([{ time: t(0), groundSpeedKt: 5, altitudeFt: null }]), null, 10)).toBeNull();
  });

  it('liftoffOnset: ostatni fix przy ziemi przed wznoszeniem', () => {
    const h = fill(
      [0, 0, 0, 10, 40, 120, 300].map((aglFt, i) => ({
        time: t(i),
        groundSpeedKt: 70,
        altitudeFt: FIELD_ELEV + aglFt,
      })),
    );

    // Próg kontaktu 25 ft: t=3 (10 ft) jest ostatnim „przy ziemi".
    expect(liftoffOnset(h, FIELD_ELEV, 25)).toBe(t(3));
  });

  it('liftoffOnset przeskakuje fixy BEZ wysokości zamiast na nich przerywać', () => {
    // Brak wysokości nie jest dowodem na nic; przerwanie na nim dałoby moment przypadkowy.
    const h = fill(
      [10, null, null, 200, 400].map((aglFt, i) => ({
        time: t(i),
        groundSpeedKt: 70,
        altitudeFt: aglFt == null ? null : FIELD_ELEV + aglFt,
      })),
    );

    expect(liftoffOnset(h, FIELD_ELEV, 25)).toBe(t(0));
  });

  it('touchdownOnset: NAJWCZEŚNIEJSZY fix nieprzerwanej serii przy ziemi', () => {
    const h = fill(
      [400, 200, 60, 30, 8, 5, 5, 5, 5].map((aglFt, i) => ({
        time: t(i),
        groundSpeedKt: 40,
        altitudeFt: FIELD_ELEV + aglFt,
      })),
    );

    // Seria „≤ 25 ft" zaczyna się w t=4 (8 ft); t=3 ma 30 ft i ją przerywa.
    expect(touchdownOnset(h, FIELD_ELEV, 25)).toBe(t(4));
  });

  it('bez elewacji lotniska retro-datowanie milczy (null), nie zgaduje', () => {
    const h = fill([{ time: t(0), groundSpeedKt: 40, altitudeFt: 820 }]);

    expect(touchdownOnset(h, null, 25)).toBeNull();
    expect(liftoffOnset(h, null, 25)).toBeNull();
  });
});
