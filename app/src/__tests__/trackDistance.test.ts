/**
 * UZ Aero - droga przebyta do danej chwili (issue #47, trzecia tura przeglądu).
 *
 * Podziałka profilu podaje obok czasu DYSTANS - i to jest miejsce, w którym najłatwiej
 * skłamać: na osi czasu droga nie jest proporcjonalna (pięć minut wznoszenia to inna
 * droga niż pięć minut przelotu, a pięć minut postoju to zero). Test pilnuje, że odczyt
 * jest faktem o konkretnej parze chwil, a nie średnią udającą skalę.
 */

import { buildDistanceLookup } from '../ui/screens/logic/trackDistance';
import type { TrackVertex } from '../domain';

const T0 = Date.UTC(2026, 7, 14, 8, 0, 0);
const min = (n: number): number => T0 + n * 60_000;

/** 1 minuta szerokości to 1 NM - łatwo sprawdzić w pamięci. */
const NM_IN_DEG_LAT = 1 / 60;

function vertex(atMin: number, nmNorth: number): TrackVertex {
  return {
    lat: 52 + nmNorth * NM_IN_DEG_LAT,
    lon: 21,
    time: min(atMin),
    altitudeFt: 1_000,
    groundSpeedKt: 60,
  };
}

describe('droga przebyta', () => {
  it('narasta wzdłuż śladu i zeruje się na początku', () => {
    const at = buildDistanceLookup([vertex(0, 0), vertex(10, 10), vertex(20, 30)]);

    expect(at(min(0))).toBe(0);
    expect(at(min(10))).toBeCloseTo(10, 1);
    expect(at(min(20))).toBeCloseTo(30, 1);
  });

  it('między wierzchołkami interpoluje po czasie', () => {
    const at = buildDistanceLookup([vertex(0, 0), vertex(10, 10)]);

    expect(at(min(5))).toBeCloseTo(5, 1);
  });

  it('NIE jest proporcjonalna do czasu - o to w tym odczycie chodzi', () => {
    // Pierwsze 10 min: 10 NM (przelot). Kolejne 10: 1 NM (krążenie nad polem).
    const at = buildDistanceLookup([vertex(0, 0), vertex(10, 10), vertex(20, 11)]);

    const pierwsza = at(min(10))! - at(min(0))!;
    const druga = at(min(20))! - at(min(10))!;

    expect(pierwsza).toBeGreaterThan(druga * 5);
  });

  it('poza zakresem nagrania trzyma się jego krańców', () => {
    const at = buildDistanceLookup([vertex(0, 0), vertex(10, 10)]);

    expect(at(min(-5))).toBe(0);
    expect(at(min(99))).toBeCloseTo(10, 1);
  });

  it('bez śladu nie ma czego mierzyć', () => {
    expect(buildDistanceLookup([])(min(1))).toBeNull();
    expect(buildDistanceLookup([vertex(0, 0)])(min(1))).toBeNull();
  });
});
