/**
 * UZ Aero — testy deklinacji magnetycznej.
 *
 * Sprawdzamy trzy rzeczy: że model daje dla Polski wartości z właściwego przedziału,
 * że kurs magnetyczny jest MNIEJSZY od geograficznego (deklinacja wschodnia) i że
 * przeliczenie nie wyprodukuje kursu ujemnego przy progach blisko północy.
 *
 * Model jest przybliżeniem IGRF dla epoki 2026 — testy celowo trzymają szerokie widełki,
 * bo mają wyłapać pomyłkę w znaku albo w rzędzie wielkości, a nie pilnować trzeciego
 * miejsca po przecinku wartości, która i tak dryfuje o ~0,1°/rok.
 */

import { magneticDeclinationDeg, toMagneticDeg } from '../domain';

describe('magneticDeclinationDeg', () => {
  it('dla całej Polski mieści się w widełkach 4–9° wschodnich', () => {
    // SKRAJNE PUNKTY KRAJU, a nie rogi prostokąta: (49°N, 14°E) leży już w Czechach,
    // więc model nie ma obowiązku dawać tam sensownej wartości i nie ma po co go o to
    // pytać. Katalog jest polski i tylko takie punkty do niego trafiają.
    const extremes = [
      { lat: 52.84, lon: 14.12 }, // najdalej na zachód (okolice Osinowa Dolnego)
      { lat: 52.84, lon: 24.15 }, // najdalej na wschód (zakole Bugu)
      { lat: 54.84, lon: 18.32 }, // najdalej na północ (Przylądek Rozewie)
      { lat: 49.0, lon: 22.86 }, // najdalej na południe (Bieszczady)
    ];

    for (const point of extremes) {
      const declination = magneticDeclinationDeg(point);
      expect(declination).toBeGreaterThan(4);
      expect(declination).toBeLessThan(9);
    }
  });

  it('rośnie ku wschodowi i ku północy', () => {
    const west = magneticDeclinationDeg({ lat: 52, lon: 15 });
    const east = magneticDeclinationDeg({ lat: 52, lon: 23 });
    const south = magneticDeclinationDeg({ lat: 50, lon: 19 });
    const north = magneticDeclinationDeg({ lat: 54, lon: 19 });

    expect(east).toBeGreaterThan(west);
    expect(north).toBeGreaterThan(south);
  });

  it('na Suwalszczyźnie jest wyraźnie większa niż przy granicy zachodniej', () => {
    // Rozpiętość przez kraj to ~3–4°, czyli tyle, że pomylenie punktów zmienia
    // wyświetlany kurs o kilka stopni — dlatego liczymy ją per lotnisko.
    const suwalki = magneticDeclinationDeg({ lat: 54.07, lon: 22.9 });
    const zielonaGora = magneticDeclinationDeg({ lat: 51.98, lon: 15.46 });

    expect(suwalki - zielonaGora).toBeGreaterThan(2);
  });
});

describe('toMagneticDeg', () => {
  it('kurs magnetyczny jest MNIEJSZY od geograficznego — deklinacja jest wschodnia', () => {
    const epzg = { lat: 52.1385, lon: 15.7986 };

    // Pas 06/24 w Babimoście: geograficznie 65°, na tabliczce 06.
    expect(toMagneticDeg(65, epzg)).toBe(60);
  });

  it('nie produkuje kursów ujemnych przy progach blisko północy', () => {
    const center = { lat: 52, lon: 19 };

    expect(toMagneticDeg(3, center)).toBe(357);
    expect(toMagneticDeg(0, center)).toBe(354);
  });

  it('zostaje w zakresie 0–359 dla pełnego obrotu', () => {
    const center = { lat: 52, lon: 19 };

    for (let heading = 0; heading < 360; heading += 5) {
      const magnetic = toMagneticDeg(heading, center);
      expect(magnetic).toBeGreaterThanOrEqual(0);
      expect(magnetic).toBeLessThan(360);
    }
  });
});
