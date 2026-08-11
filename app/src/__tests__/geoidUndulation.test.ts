/**
 * UZ Aero — wkompilowana siatka undulacji EGM96 (`geoid/egm96Grid.ts` + API).
 *
 * Tu sprawdzamy PRAWDZIWE dane, które jadą w bundlu: kotwicę empiryczną z EPNL
 * (zgłoszenie 2026-08-11: elewacja 830 ft, surowy GPS ~950 ft → undulacja ~37 m),
 * fizyczny zakres nad Polską i gładkość geoidy — skok między sąsiednimi węzłami
 * wykryłby przesunięcie albo transpozycję tablicy szybciej niż jakikolwiek punkt.
 */

import { EGM96_GRID } from '../../../packages/domain/src/geoid/egm96Grid';
import { airfieldByIcao, geoidUndulationM } from '../domain';

describe('geoidUndulationM — wkompilowany wycinek EGM96', () => {
  it('EPNL: undulacja zgadza się ze zmierzonym rozjazdem 950 ft vs 830 ft (~37 m)', () => {
    const epnl = airfieldByIcao('EPNL')!;
    const undulation = geoidUndulationM(epnl)!;
    expect(undulation).toBeGreaterThan(34);
    expect(undulation).toBeLessThan(42);
  });

  it('cała Polska z pograniczem mieści się w przedziale 22–50 m', () => {
    // Okno 49–55°N / 14–24°E zahacza o Litwę i Ukrainę; skrajne węzły odczytane
    // z siatki to 24,96 m (północny wschód) i 46,84 m (Tatry). Widełki z małym
    // zapasem — pomyłka jednostek (m/cm) albo znaku wywala je o rząd wielkości.
    for (let lat = 49; lat <= 55; lat += 0.25) {
      for (let lon = 14; lon <= 24; lon += 0.25) {
        const undulation = geoidUndulationM({ lat, lon });
        expect(undulation).not.toBeNull();
        expect(undulation!).toBeGreaterThan(22);
        expect(undulation!).toBeLessThan(50);
      }
    }
  });

  it('geoida jest gładka: sąsiednie węzły różnią się o mniej niż 5 m', () => {
    const { rows, cols, valuesCm } = EGM96_GRID;
    let maxStepCm = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const here = valuesCm[r * cols + c]!;
        if (c + 1 < cols) maxStepCm = Math.max(maxStepCm, Math.abs(valuesCm[r * cols + c + 1]! - here));
        if (r + 1 < rows) maxStepCm = Math.max(maxStepCm, Math.abs(valuesCm[(r + 1) * cols + c]! - here));
      }
    }
    // Najostrzejszy realny gradient wycinka to Alpy (~3,5 m na 15′) — próg 5 m
    // zostawia im zapas, a przesunięcie/transpozycję tablicy nadal łapie.
    expect(maxStepCm).toBeLessThan(500);
  });

  it('pokrycie jest domknięte na krawędziach i kończy się tuż za nimi', () => {
    expect(geoidUndulationM({ lat: 62, lon: -5 })).not.toBeNull();
    expect(geoidUndulationM({ lat: 41, lon: 35 })).not.toBeNull();
    expect(geoidUndulationM({ lat: 62.01, lon: 20 })).toBeNull();
    expect(geoidUndulationM({ lat: 50, lon: -5.01 })).toBeNull();
  });

  it('cały wycinek mieści się w sensownym zakresie europejskim', () => {
    for (const cm of EGM96_GRID.valuesCm) {
      expect(cm).toBeGreaterThan(-2000);
      expect(cm).toBeLessThan(7000);
    }
  });
});
