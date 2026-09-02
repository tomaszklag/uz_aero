/**
 * UZ Aero - testy PODZIAŁU ŚLADU NA FAZY (issue #75 pkt 4).
 *
 * Reguły pod obserwacją: faza należy do ODCINKA (oba końce w oknie lotu), przebiegi
 * DZIELĄ wierzchołek graniczny (łamane stykają się bez dziury), a bieg bez lotów jest
 * w całości kołowaniem.
 */

import { trackPhaseRuns } from '../domain';

const T0 = Date.UTC(2026, 8, 1, 8, 0);
const MIN = 60_000;
const at = (min: number): number => T0 + min * MIN;

describe('trackPhaseRuns', () => {
  it('dzieli zapis na kołowanie → lot → kołowanie, z dzielonym wierzchołkiem granicznym', () => {
    // Wierzchołki co minutę 0..10; lot 3..7.
    const times = Array.from({ length: 11 }, (_, i) => at(i));
    const runs = trackPhaseRuns(times, [{ takeoffAt: at(3), landingAt: at(7) }]);

    expect(runs).toEqual([
      { phase: 'taxi', from: 0, to: 3 },
      { phase: 'flight', from: 3, to: 7 },
      { phase: 'taxi', from: 7, to: 10 },
    ]);
  });

  it('odcinek przejściowy (jeden koniec przed startem) zostaje kołowaniem', () => {
    // Start w połowie odcinka 1→2: odcinek jest jeszcze drogą na pas.
    const times = [at(0), at(1), at(2), at(3)];
    const runs = trackPhaseRuns(times, [{ takeoffAt: at(1.5), landingAt: null }]);

    expect(runs).toEqual([
      { phase: 'taxi', from: 0, to: 2 },
      { phase: 'flight', from: 2, to: 3 },
    ]);
  });

  it('dwa loty jednego biegu rozdziela ziemia między nimi', () => {
    const times = Array.from({ length: 13 }, (_, i) => at(i));
    const runs = trackPhaseRuns(times, [
      { takeoffAt: at(1), landingAt: at(4) },
      { takeoffAt: at(8), landingAt: at(11) },
    ]);

    expect(runs.map((r) => r.phase)).toEqual(['taxi', 'flight', 'taxi', 'flight', 'taxi']);
    // Styk bez dziury: koniec przebiegu jest początkiem następnego.
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]!.from).toBe(runs[i - 1]!.to);
    }
  });

  it('bieg bez ani jednego lotu (próba silnika) jest w całości kołowaniem', () => {
    const times = [at(0), at(1), at(2)];
    expect(trackPhaseRuns(times, [])).toEqual([{ phase: 'taxi', from: 0, to: 2 }]);
  });

  it('lot w powietrzu (bez lądowania) niesie fazę lotu do końca zapisu', () => {
    const times = [at(0), at(1), at(2), at(3)];
    const runs = trackPhaseRuns(times, [{ takeoffAt: at(1), landingAt: null }]);
    expect(runs).toEqual([
      { phase: 'taxi', from: 0, to: 1 },
      { phase: 'flight', from: 1, to: 3 },
    ]);
  });

  it('mniej niż dwa punkty nie ma ani jednego odcinka', () => {
    expect(trackPhaseRuns([], [])).toEqual([]);
    expect(trackPhaseRuns([at(0)], [])).toEqual([]);
  });
});
