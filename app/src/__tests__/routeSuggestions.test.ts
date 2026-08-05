/**
 * UZ Aero — testy podpowiedzi pod wierszem trasy (ekran 02E/02F).
 *
 * Reguła bez fokusu jest tu treścią, nie szczegółem: podpowiedzi należą do pierwszego
 * pola z czymś niedokończonym, bo oparcie ich na fokusie znika w chwili dotknięcia
 * podpowiedzi. Testy pilnują też rzeczy najważniejszej dla pilota — że kod spoza
 * katalogu (ferry za granicę) przechodzi bez listy, bez potwierdzenia i bez ostrzeżenia.
 */

import {
  airfieldRow,
  routeConfirmations,
  routeSuggestions,
} from '../ui/screens/logic/routeSuggestions';
import type { Airfield } from '../domain';

function airfield(icao: string, name: string): Airfield {
  return { icao, name, lat: 52, lon: 16, elevationFt: 200, runway: null };
}

const CATALOGUE = [
  airfield('EPZG', 'Zielona Góra-Babimost Airport'),
  airfield('EPZP', 'Zielona Góra-Przylep Airfield'),
  airfield('EPWA', 'Warsaw Chopin Airport'),
];

const opts = { catalogue: CATALOGUE };

describe('routeSuggestions', () => {
  it('bez wpisu nie ma czego podpowiadać', () => {
    expect(routeSuggestions({ departureIcao: '', arrivalIcao: '' }, opts)).toBeNull();
  });

  it('podpowiada do pola startu, gdy kod jest niedokończony', () => {
    const found = routeSuggestions({ departureIcao: 'EPZ', arrivalIcao: '' }, opts);

    expect(found?.field).toBe('departure');
    expect(found?.label).toBe('Start ICAO — podpowiedzi');
    expect(found?.airfields.map((a) => a.icao)).toEqual(['EPZG', 'EPZP']);
  });

  it('rozpoznany kod zamyka listę — pytanie jest już zamknięte', () => {
    expect(routeSuggestions({ departureIcao: 'EPZG', arrivalIcao: '' }, opts)).toBeNull();
  });

  it('gdy start jest gotowy, podpowiedzi przechodzą na pole lądowania', () => {
    const found = routeSuggestions({ departureIcao: 'EPZG', arrivalIcao: 'WARS' }, opts);

    expect(found?.field).toBe('arrival');
    expect(found?.label).toBe('Lądowanie ICAO — podpowiedzi');
    expect(found?.airfields.map((a) => a.icao)).toEqual(['EPWA']);
  });

  it('start ma pierwszeństwo, gdy oba pola są niedokończone', () => {
    // Kolejność, w jakiej pilot wypełnia trasę — nie chcemy, żeby lista skakała.
    const found = routeSuggestions({ departureIcao: 'EPZ', arrivalIcao: 'WARS' }, opts);

    expect(found?.field).toBe('departure');
  });

  it('kod spoza katalogu nie daje listy — to podpowiedź, nie bramka', () => {
    // Ferry do Berlina. Milczenie katalogu nie jest błędem pilota.
    expect(routeSuggestions({ departureIcao: 'EDDB', arrivalIcao: '' }, opts)).toBeNull();
  });

  it('szuka też po nazwie i po ogonkach', () => {
    const found = routeSuggestions({ departureIcao: 'zielona', arrivalIcao: '' }, opts);

    expect(found?.airfields.map((a) => a.icao)).toEqual(['EPZG', 'EPZP']);
  });
});

describe('airfieldRow', () => {
  it('składa drugą linię z pasa i elewacji', () => {
    const row = airfieldRow({
      icao: 'EPZG',
      name: 'Zielona Góra-Babimost Airport',
      lat: 52.1385,
      lon: 15.7986,
      elevationFt: 194,
      runway: { headingDeg: 65, lengthM: 2500 },
    });

    // Kurs w stopniach, z zerem wiodącym — nie „07/25", bo katalog zna kurs
    // geograficzny, a oznaczenie progu jest magnetyczne.
    expect(row.meta).toBe('pas 065° · 2500 m · 194 ft');
  });

  it('pomija to, czego katalog nie zna', () => {
    expect(airfieldRow(airfield('EPXX', 'Bez danych')).meta).toBe('200 ft');
    expect(
      airfieldRow({ ...airfield('EPYY', 'Zupełnie bez danych'), elevationFt: null }).meta,
    ).toBeNull();
  });
});

describe('routeConfirmations', () => {
  it('potwierdza kody, które katalog rozpoznaje', () => {
    const rows = routeConfirmations({ departureIcao: 'EPZG', arrivalIcao: 'EPWA' }, opts);

    expect(rows).toEqual([
      { field: 'departure', text: 'Start: EPZG · Zielona Góra-Babimost Airport' },
      { field: 'arrival', text: 'Lądowanie: EPWA · Warsaw Chopin Airport' },
    ]);
  });

  it('milczy o kodzie spoza katalogu i o kodzie niedokończonym', () => {
    expect(routeConfirmations({ departureIcao: 'EDDB', arrivalIcao: 'EPZ' }, opts)).toEqual([]);
  });

  it('nie rozróżnia wielkości liter ani spacji wokół kodu', () => {
    const rows = routeConfirmations({ departureIcao: ' epzg ', arrivalIcao: '' }, opts);

    expect(rows.map((r) => r.field)).toEqual(['departure']);
  });
});
