/**
 * UZ Aero — testy walidacji „czy stoję tam, gdzie wpisałem" (issue #6).
 *
 * Najważniejsze przypadki to te, w których funkcja ma MILCZEĆ. Katalog obejmuje 106
 * polskich lotnisk, więc lądowisko prywatne i lotnisko zagraniczne są poza nim — a lot
 * z takiego miejsca to codzienność, nie anomalia. Ostrzeżenie w takiej sytuacji uczy
 * pilota ignorowania ostrzeżeń, czyli psuje też te prawdziwe.
 */

import {
  AIRFIELD_VICINITY_NM,
  checkAirfieldProximity,
  nearestAirfield,
  type Airfield,
} from '../domain';

function airfield(icao: string, name: string, lat: number, lon: number): Airfield {
  return { icao, name, lat, lon, elevationFt: 200, runway: null };
}

/** Trzy prawdziwe lotniska: Babimost i Przylep dzieli ~40 km, Kraków leży 400 km dalej. */
const CATALOGUE = [
  airfield('EPZG', 'Zielona Góra-Babimost Airport', 52.1385, 15.7986),
  airfield('EPZP', 'Zielona Góra-Przylep Airfield', 51.9789, 15.4639),
  airfield('EPKK', 'Kraków John Paul II International Airport', 50.0777, 19.7848),
];

const opts = { catalogue: CATALOGUE };

/** Pozycja przesunięta o `nm` mil morskich na północ. */
const nmNorth = (from: { lat: number; lon: number }, nm: number) => ({
  lat: from.lat + nm / 60,
  lon: from.lon,
});

const AT_EPZG = { lat: 52.1385, lon: 15.7986 };

describe('nearestAirfield', () => {
  it('znajduje najbliższe lotnisko wraz z odległością', () => {
    const found = nearestAirfield(nmNorth(AT_EPZG, 1), opts);

    expect(found?.airfield.icao).toBe('EPZG');
    expect(found?.distanceNm).toBeCloseTo(1, 1);
  });

  it('z ograniczeniem promienia zwraca null, gdy nic nie jest blisko', () => {
    expect(nearestAirfield(nmNorth(AT_EPZG, 50), { ...opts, maxDistanceNm: 2 })).toBeNull();
  });
});

describe('checkAirfieldProximity — cisza', () => {
  it('bez pozycji nie ma czego sprawdzać', () => {
    expect(checkAirfieldProximity({ position: null, icao: 'EPKK', ...opts })).toBeNull();
  });

  it('kod zgodny z pozycją to cisza, nie potwierdzenie', () => {
    // Zgodność jest stanem normalnym; komunikat o niej byłby szumem przy każdym starcie.
    expect(checkAirfieldProximity({ position: AT_EPZG, icao: 'EPZG', ...opts })).toBeNull();
  });

  it('w promieniu lotniska nadal cisza — stanowiska bywają daleko od punktu odniesienia', () => {
    const apron = nmNorth(AT_EPZG, AIRFIELD_VICINITY_NM - 0.2);

    expect(checkAirfieldProximity({ position: apron, icao: 'EPZG', ...opts })).toBeNull();
  });

  it('kod SPOZA katalogu nie jest oceniany — zagranicy nie mamy z czym porównać', () => {
    // Ferry do Berlina: EDDB nie jest i nie będzie w polskim katalogu.
    expect(checkAirfieldProximity({ position: AT_EPZG, icao: 'EDDB', ...opts })).toBeNull();
  });

  it('pusty kod z dala od wszystkiego to cisza — lądowisko prywatne ma prawo istnieć', () => {
    const middleOfNowhere = nmNorth(AT_EPZG, 30);

    expect(checkAirfieldProximity({ position: middleOfNowhere, icao: '', ...opts })).toBeNull();
  });
});

describe('checkAirfieldProximity — rozjazd', () => {
  it('wpisany kod daleko od pozycji daje ostrzeżenie z odległością', () => {
    // Scenariusz z życia: preflight podpowiedział wczorajsze EPKK, a pilot stoi w Babimoście.
    const verdict = checkAirfieldProximity({ position: AT_EPZG, icao: 'EPKK', ...opts });

    expect(verdict?.kind).toBe('mismatch');
    if (verdict?.kind !== 'mismatch') throw new Error('spodziewany rozjazd');
    expect(verdict.declared.icao).toBe('EPKK');
    expect(verdict.distanceNm).toBeGreaterThan(100);
    expect(verdict.nearest?.airfield.icao).toBe('EPZG');
  });

  it('nie podpowiada lotniska, które samo jest daleko', () => {
    // „Najbliższe: EPZG, 60 km stąd" nie jest podpowiedzią, tylko szumem.
    const between = nmNorth(AT_EPZG, 20);
    const verdict = checkAirfieldProximity({ position: between, icao: 'EPKK', ...opts });

    expect(verdict?.kind).toBe('mismatch');
    if (verdict?.kind !== 'mismatch') throw new Error('spodziewany rozjazd');
    expect(verdict.nearest).toBeNull();
  });
});

describe('checkAirfieldProximity — podpowiedź', () => {
  it('pusty kod na rozpoznawalnym lotnisku proponuje jego wpisanie', () => {
    const verdict = checkAirfieldProximity({ position: AT_EPZG, icao: '', ...opts });

    expect(verdict?.kind).toBe('suggestion');
    if (verdict?.kind !== 'suggestion') throw new Error('spodziewana podpowiedź');
    expect(verdict.nearest.airfield.icao).toBe('EPZG');
  });

  it('null i same spacje traktujemy jak brak wpisu', () => {
    expect(checkAirfieldProximity({ position: AT_EPZG, icao: null, ...opts })?.kind).toBe(
      'suggestion',
    );
    expect(checkAirfieldProximity({ position: AT_EPZG, icao: '   ', ...opts })?.kind).toBe(
      'suggestion',
    );
  });
});
