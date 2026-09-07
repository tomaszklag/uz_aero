/**
 * UZ Aero - testy podpowiedzi lotnisk (`searchAirfields`).
 *
 * Dwie rzeczy mogą zepsuć to pole i obie są tu sprawdzone: podpowiedź, która NIE pokazuje
 * kodu wpisanego przez pilota (bo nazwa przepchnęła go poza listę), oraz podpowiedź, która
 * zachowuje się jak bramka - a katalog jest wyłącznie polski, więc wpis spoza listy musi
 * przejść bez oporu.
 */

import {
  MAX_AIRFIELD_SUGGESTIONS,
  nearestAirfields,
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
  it('pusty wpis nie daje podpowiedzi - lista nie wisi pod nietkniętym polem', () => {
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

  it('kod bije nazwę - inaczej wpisany kod spadłby poza listę', () => {
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
    // Ł i Ż nie rozkładają się przez `normalize('NFD')` - stąd własna mapa liter.
    expect(codes(searchAirfields('zar', { catalogue: CATALOGUE }))).toEqual(['EPZR']);
    expect(codes(searchAirfields('Żar', { catalogue: CATALOGUE }))).toEqual(['EPZR']);
  });

  it('znajduje po dalszym członie nazwy', () => {
    expect(codes(searchAirfields('babimost', { catalogue: CATALOGUE }))).toEqual(['EPZG']);
    expect(codes(searchAirfields('przylep', { catalogue: CATALOGUE }))).toEqual(['EPZP']);
  });

  it('kod spoza katalogu daje pustą listę, a nie błąd - wpis musi przejść', () => {
    // Przelot do Berlina: EDDB nie jest i nie będzie w polskim katalogu.
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
    // Kontrola, że domyślne źródło jest podłączone - testy wyżej podmieniają katalog,
    // więc bez tego przypadku przeszłyby także przy pustej liście lotnisk.
    expect(POLISH_AIRFIELDS.length).toBeGreaterThan(50);
    expect(codes(searchAirfields('EPZG'))[0]).toBe('EPZG');
    expect(codes(searchAirfields('krak'))).toContain('EPKK');
  });
});

/**
 * Lista „najbliżej Ciebie" (issue #14) - odpowiedź na puste pole wyszukiwarki.
 *
 * Pilot stoi zwykle na lotnisku, z którego zaraz wystartuje, więc pierwsza pozycja ma być
 * tą właściwą. Test pilnuje też stanu BEZ pozycji: brak fixa jest normalny (o uprawnienie
 * prosimy dopiero na kroku 4), więc funkcja ma wtedy milczeć, a nie zgadywać.
 */
describe('nearestAirfields', () => {
  // Współrzędne przybliżone, ale zachowujące PORZĄDEK odległości - tylko on jest tu treścią.
  const NEAR = [
    { ...airfield('EPRA', 'Radom-Sadków'), lat: 51.39, lon: 21.21 },
    { ...airfield('EPWA', 'Warsaw Chopin Airport'), lat: 52.17, lon: 20.97 },
    { ...airfield('EPKK', 'Kraków John Paul II International Airport'), lat: 50.08, lon: 19.79 },
  ];

  it('sortuje od najbliższego i podaje odległość', () => {
    const found = nearestAirfields({ lat: 51.4, lon: 21.2 }, { catalogue: NEAR, limit: 3 });

    expect(found.map((n) => n.airfield.icao)).toEqual(['EPRA', 'EPWA', 'EPKK']);
    expect(found[0]!.distanceNm).toBeLessThan(2);
    expect(found[1]!.distanceNm).toBeGreaterThan(found[0]!.distanceNm);
  });

  it('bez pozycji nie zgaduje - pusta lista, nie „pierwsze z brzegu"', () => {
    expect(nearestAirfields(null, { catalogue: NEAR })).toEqual([]);
    expect(nearestAirfields(undefined, { catalogue: NEAR })).toEqual([]);
  });

  it('respektuje limit - lista podpowiedzi ma się mieścić nad klawiaturą', () => {
    expect(nearestAirfields({ lat: 52, lon: 21 }, { catalogue: NEAR, limit: 2 })).toHaveLength(2);
    expect(nearestAirfields({ lat: 52, lon: 21 }, { catalogue: NEAR, limit: 0 })).toEqual([]);
  });
});
