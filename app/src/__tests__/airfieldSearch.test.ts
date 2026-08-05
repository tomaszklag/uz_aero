/**
 * UZ Aero — testy podpowiedzi lotnisk (`searchAirfields`).
 *
 * Dwie rzeczy mogą zepsuć to pole i obie są tu sprawdzone: podpowiedź, która NIE pokazuje
 * kodu wpisanego przez pilota (bo nazwa przepchnęła go poza listę), oraz podpowiedź, która
 * zachowuje się jak bramka — a katalog jest wyłącznie polski, więc wpis spoza listy musi
 * przejść bez oporu.
 */

import {
  MAX_AIRFIELD_SUGGESTIONS,
  POLISH_AIRFIELDS,
  searchAirfields,
  type Airfield,
} from '../domain';

function airfield(icao: string, name: string): Airfield {
  return { icao, name, lat: 52, lon: 16, elevationFt: 200, runway: null };
}

const CATALOGUE = [
  airfield('EPZG', 'Zielona Góra-Babimost Airport'),
  airfield('EPZP', 'Zielona Góra-Przylep Airfield'),
  airfield('EPZR', 'Żar Airfield'),
  airfield('EPKK', 'Kraków John Paul II International Airport'),
  airfield('EPWA', 'Warsaw Chopin Airport'),
];

const codes = (found: Airfield[]): string[] => found.map((a) => a.icao);

describe('searchAirfields', () => {
  it('pusty wpis nie daje podpowiedzi — lista nie wisi pod nietkniętym polem', () => {
    expect(searchAirfields('', { catalogue: CATALOGUE })).toEqual([]);
    expect(searchAirfields('   ', { catalogue: CATALOGUE })).toEqual([]);
    expect(searchAirfields(null, { catalogue: CATALOGUE })).toEqual([]);
  });

  it('szuka po kodzie ICAO od początku', () => {
    expect(codes(searchAirfields('EPZ', { catalogue: CATALOGUE }))).toEqual([
      'EPZG',
      'EPZP',
      'EPZR',
    ]);
  });

  it('dokładny kod stoi pierwszy, nawet gdy inne też pasują', () => {
    expect(codes(searchAirfields('EPZG', { catalogue: CATALOGUE }))[0]).toBe('EPZG');
  });

  it('kod bije nazwę — inaczej wpisany kod spadłby poza listę', () => {
    // „EPZ" pasuje do trzech kodów; gdyby liczyła się głównie nazwa, na górze wylądowałyby
    // lotniska z „Z" w nazwie, a pilot nie zobaczyłby tego, o które mu chodziło.
    const found = searchAirfields('EPZ', { catalogue: CATALOGUE });

    expect(found.every((a) => a.icao.startsWith('EPZ'))).toBe(true);
  });

  it('szuka po nazwie, bez rozróżniania wielkości liter i ogonków', () => {
    expect(codes(searchAirfields('zielona', { catalogue: CATALOGUE }))).toEqual(['EPZG', 'EPZP']);
    expect(codes(searchAirfields('ZIELONA GORA', { catalogue: CATALOGUE }))).toEqual([
      'EPZG',
      'EPZP',
    ]);
    // Ł i Ż nie rozkładają się przez `normalize('NFD')` — stąd własna mapa liter.
    expect(codes(searchAirfields('zar', { catalogue: CATALOGUE }))).toEqual(['EPZR']);
    expect(codes(searchAirfields('Żar', { catalogue: CATALOGUE }))).toEqual(['EPZR']);
  });

  it('znajduje po dalszym członie nazwy', () => {
    expect(codes(searchAirfields('babimost', { catalogue: CATALOGUE }))).toEqual(['EPZG']);
    expect(codes(searchAirfields('przylep', { catalogue: CATALOGUE }))).toEqual(['EPZP']);
  });

  it('kod spoza katalogu daje pustą listę, a nie błąd — wpis musi przejść', () => {
    // Ferry do Berlina: EDDB nie jest i nie będzie w polskim katalogu.
    expect(searchAirfields('EDDB', { catalogue: CATALOGUE })).toEqual([]);
    expect(searchAirfields('XXXX', { catalogue: CATALOGUE })).toEqual([]);
  });

  it('nigdy nie pokazuje więcej niż limit', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      airfield(`EP${String.fromCharCode(65 + i)}X`, `Lotnisko ${i}`),
    );

    expect(searchAirfields('EP', { catalogue: many })).toHaveLength(MAX_AIRFIELD_SUGGESTIONS);
    expect(searchAirfields('EP', { catalogue: many, limit: 2 })).toHaveLength(2);
  });

  it('działa na prawdziwym katalogu wbudowanym w aplikację', () => {
    // Kontrola, że domyślne źródło jest podłączone — testy wyżej podmieniają katalog,
    // więc bez tego przypadku przeszłyby także przy pustej liście lotnisk.
    expect(POLISH_AIRFIELDS.length).toBeGreaterThan(50);
    expect(codes(searchAirfields('EPZG'))[0]).toBe('EPZG');
    expect(codes(searchAirfields('krak'))).toContain('EPKK');
  });
});
