/**
 * UZ Aero - wysokość zrzutu: średnia z okna, nie ostatni fix (issue #21 pkt 2).
 *
 * Kontrakt: okno liczone wstecz od NAJNOWSZEGO fixa (`DROP_ALT_WINDOW_SEC`), fixy bez
 * wysokości i spoza okna pomijane, brak danych = `null` (nigdy zero). Przypadek
 * „szum pojedynczego fixa" pokazuje różnicę względem starego zachowania: ostatni fix
 * z artefaktem +90 ft przestaje dyktować wynik.
 */

import { DROP_ALT_WINDOW_SEC, averageAltitudeFt, type GpsFix } from '../domain';

const T0 = Date.UTC(2026, 5, 22, 13, 45, 0);

/** Fix o zadanym wieku (sekundy PRZED najnowszym) i wysokości. */
function fix(ageSec: number, altitudeFt: number | null): GpsFix {
  return {
    time: T0 - ageSec * 1000,
    groundSpeedKt: 80,
    altitudeFt,
    lat: 50.08,
    lon: 19.79,
  };
}

/** Chronologicznie, jak `FixHistory.fixes` (najstarszy → najnowszy). */
const chronological = (fixes: GpsFix[]): GpsFix[] => [...fixes].sort((a, b) => a.time - b.time);

describe('averageAltitudeFt', () => {
  it('uśrednia wysokości z okna - artefakt jednego fixa nie dyktuje wyniku', () => {
    // Stabilne 2400 ft i jeden skok +90 ft na końcu: stare zachowanie (ostatni fix)
    // zapisałoby 2490; średnia rozkłada artefakt na całe okno.
    const fixes = chronological([fix(4, 2400), fix(3, 2400), fix(2, 2400), fix(1, 2400), fix(0, 2490)]);
    expect(averageAltitudeFt(fixes)).toBeCloseTo(2418, 0);
  });

  it('fixy starsze niż okno nie wchodzą do średniej', () => {
    const fixes = chronological([
      fix(DROP_ALT_WINDOW_SEC + 5, 1000), // dolot - dawno poza oknem
      fix(2, 2500),
      fix(0, 2500),
    ]);
    expect(averageAltitudeFt(fixes)).toBe(2500);
  });

  it('fixy bez wysokości są pomijane, a nie liczone jako zero', () => {
    const fixes = chronological([fix(2, null), fix(1, 2400), fix(0, null)]);
    expect(averageAltitudeFt(fixes)).toBe(2400);
  });

  it('brak jakiejkolwiek wysokości w oknie = null - „nie wiem" to nie „zero stóp"', () => {
    expect(averageAltitudeFt([])).toBeNull();
    expect(averageAltitudeFt(chronological([fix(1, null), fix(0, null)]))).toBeNull();
  });

  it('fix z przyszłości (cofnięty zegar) jest odrzucany jak w prędkości pionowej', () => {
    // „Najnowszy" po czasie to ostatni element; wcześniejszy wpis z czasem PÓŹNIEJSZYM
    // niż on symuluje skok zegara - nie może zatruć średniej.
    const future = { ...fix(0, 9000), time: T0 + 5_000 };
    const fixes = [future, fix(1, 2400), fix(0, 2400)];
    expect(averageAltitudeFt(fixes)).toBe(2400);
  });

  it('okno można zawęzić parametrem', () => {
    const fixes = chronological([fix(10, 2000), fix(1, 3000), fix(0, 3000)]);
    expect(averageAltitudeFt(fixes, 5)).toBe(3000);
  });
});
