/**
 * UZ Aero — testy generatora katalogu lotnisk (`packages/domain/scripts/airfields/`).
 *
 * Generator jest narzędziem, ale jego wynik jest DANYMI, które pilot ogląda na mapie
 * śladu i bierze za prawdę. Issue #3 pokazało, ile kosztuje brak tych testów: pusta
 * komórka w CSV przechodziła przez `Number('')` na `0` i dwadzieścia lotnisk dostało
 * pas narysowany na północ — w tym EPZP, które w rzeczywistości ma 06/24.
 *
 * Stąd trzy grupy przypadków: odczyt z CSV (pusta komórka to BRAK, nie zero), geometria
 * OSM (pas rozbity na waye musi się skleić, pasy równoległe nie mogą się wydłużyć)
 * i kolejność źródeł przy składaniu rekordu.
 */

import { pickRunway } from '../../../packages/domain/scripts/airfields/catalogue';
import { parseCsv, toObjects, type CsvRecord } from '../../../packages/domain/scripts/airfields/csv';
import { assignWaysToAirfields } from '../../../packages/domain/scripts/airfields/osmAssignment';
import {
  alignHeadingToRef,
  headingFromRef,
  runwaysFromWays,
  type OverpassWay,
} from '../../../packages/domain/scripts/airfields/osmRunways';
import {
  numberOrNull,
  ourAirportsRunway,
  polishAirfields,
} from '../../../packages/domain/scripts/airfields/ourAirports';
import { renderAirfieldsModule } from '../../../packages/domain/scripts/airfields/render';

/** Wiersz pasa z OurAirports; podajemy tylko kolumny, które generator czyta. */
function runwayRow(over: Partial<Record<string, string>> = {}): CsvRecord {
  return {
    airport_ident: 'EPZP',
    length_ft: '2887',
    surface: 'GRS',
    closed: '0',
    le_ident: '06',
    le_heading_degT: '61',
    ...over,
  };
}

/** Way OSM: linia prosta między dwoma punktami. */
function way(
  id: number,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  tags: Record<string, string> = {},
): OverpassWay {
  return { id, tags, geometry: [from, to] };
}

describe('odczyt z CSV', () => {
  it('pusta komórka to BRAK danych, a nie zero', () => {
    // Sedno issue #3: `Number('')` daje 0, a `Number.isFinite(0)` przechodzi.
    expect(numberOrNull('')).toBeNull();
    expect(numberOrNull('   ')).toBeNull();
    expect(numberOrNull(undefined)).toBeNull();
    expect(numberOrNull('nie-liczba')).toBeNull();
    expect(numberOrNull('0')).toBe(0);
    expect(numberOrNull('61')).toBe(61);
  });

  it('pas bez kursu w źródle nie staje się pasem o kursie 0°', () => {
    const runway = ourAirportsRunway([runwayRow({ le_heading_degT: '' })]);

    expect(runway).toBeNull();
  });

  it('pas bez długości też odpada — rekord ma być kompletny albo żaden', () => {
    expect(ourAirportsRunway([runwayRow({ length_ft: '' })])).toBeNull();
    expect(ourAirportsRunway([runwayRow({ length_ft: '0' })])).toBeNull();
  });

  it('bierze najdłuższy czynny pas i przelicza stopy na metry', () => {
    const runway = ourAirportsRunway([
      runwayRow({ length_ft: '3280', le_heading_degT: '90' }),
      runwayRow({ length_ft: '6562', le_heading_degT: '120' }),
      runwayRow({ length_ft: '9840', le_heading_degT: '150', closed: '1' }),
    ]);

    expect(runway).toEqual({ headingDeg: 120, lengthM: 2000 });
  });

  it('bez wierszy pasa zwraca null', () => {
    expect(ourAirportsRunway(undefined)).toBeNull();
    expect(ourAirportsRunway([])).toBeNull();
  });

  it('parser CSV radzi sobie z przecinkiem i cudzysłowem w nazwie', () => {
    const rows = toObjects(
      parseCsv('ident,name\nEPZG,"Zielona Góra-Babimost, ""Lubuskie"""\nEPZP,Przylep\n'),
    );

    expect(rows).toEqual([
      { ident: 'EPZG', name: 'Zielona Góra-Babimost, "Lubuskie"' },
      { ident: 'EPZP', name: 'Przylep' },
    ]);
  });

  it('bierze polskie lotniska z kodem ICAO, bez heliportów i bez zamkniętych', () => {
    const seeds = polishAirfields([
      { ident: 'EPZP', iso_country: 'PL', type: 'small_airport', name: 'Przylep', latitude_deg: '51.9789', longitude_deg: '15.4639', elevation_ft: '249' },
      { ident: 'EPZG', iso_country: 'PL', type: 'medium_airport', name: 'Babimost', latitude_deg: '52.1385', longitude_deg: '15.7986', elevation_ft: '' },
      { ident: 'EPHE', iso_country: 'PL', type: 'heliport', name: 'Heliport', latitude_deg: '52.0', longitude_deg: '21.0', elevation_ft: '300' },
      { ident: 'PL-0001', iso_country: 'PL', type: 'small_airport', name: 'Bez ICAO', latitude_deg: '52.0', longitude_deg: '21.0', elevation_ft: '300' },
      { ident: 'EDDB', iso_country: 'DE', type: 'large_airport', name: 'Berlin', latitude_deg: '52.36', longitude_deg: '13.5', elevation_ft: '157' },
    ]);

    expect(seeds.map((s) => s.icao)).toEqual(['EPZG', 'EPZP']);
    // Brak elewacji zostaje brakiem — nie zerem nad poziomem morza.
    expect(seeds[0]!.elevationFt).toBeNull();
    expect(seeds[1]!.elevationFt).toBe(249);
  });
});

describe('oznaczenie pasa', () => {
  it('czyta kurs z pierwszego progu', () => {
    expect(headingFromRef('06/24')).toBe(60);
    expect(headingFromRef('13-31')).toBe(130);
    expect(headingFromRef('09R/27L')).toBe(90);
    expect(headingFromRef('18/36')).toBe(180);
    expect(headingFromRef('36/18')).toBe(360 % 360);
    expect(headingFromRef('GRASS')).toBeNull();
    expect(headingFromRef(null)).toBeNull();
  });

  it('obraca oś do progu, gdy way narysowano od drugiej strony', () => {
    // Geometria mówi 241° (od progu 24), oznaczenie mówi 06 — w katalogu ma być 61°.
    expect(alignHeadingToRef(241, '06/24')).toBe(61);
    expect(alignHeadingToRef(61, '06/24')).toBe(61);
  });

  it('bez oznaczenia zostawia oś w zakresie 0–180, żeby wynik był powtarzalny', () => {
    expect(alignHeadingToRef(280, null)).toBe(100);
    expect(alignHeadingToRef(100, null)).toBe(100);
  });
});

describe('pasy z geometrii OSM', () => {
  // Wschód–zachód na szerokości 52°: 0.01° długości ≈ 685 m.
  const west = { lat: 52.0, lon: 15.0 };
  const middle = { lat: 52.0, lon: 15.005 };
  const east = { lat: 52.0, lon: 15.01 };

  it('skleja pas rozbity na kilka wayów', () => {
    // Bez tego EPJS wychodziło 357 m przy realnych ~700 m: liczyliśmy najdłuższy
    // POJEDYNCZY odcinek zamiast całej płyty.
    const runways = runwaysFromWays([
      way(1, west, middle, { ref: '09/27' }),
      way(2, middle, east, { ref: '09/27' }),
    ]);

    expect(runways).toHaveLength(1);
    expect(runways[0]!.lengthM).toBeGreaterThan(670);
    expect(runways[0]!.lengthM).toBeLessThan(700);
    expect(runways[0]!.headingDeg).toBe(90);
  });

  it('lekkie odsunięcie odcinków nie wydłuża pasa o przekątną', () => {
    // Odcinki tej samej płyty bywają narysowane z rozjazdem kilkunastu metrów.
    // Długość liczona z odległości między skrajnymi punktami dodałaby ten rozjazd
    // do wyniku; rzut na oś go ignoruje.
    const shifted = { lat: 52.00015, lon: 15.005 };
    const runways = runwaysFromWays([
      way(1, west, shifted, { ref: '09/27' }),
      way(2, shifted, east, { ref: '09/27' }),
    ]);

    expect(runways).toHaveLength(1);
    expect(runways[0]!.lengthM).toBeGreaterThan(670);
    expect(runways[0]!.lengthM).toBeLessThan(700);
  });

  it('pasy równoległe zostają osobne, choćby były przesunięte wzdłuż osi', () => {
    // Przypadek z Krosna: 11R/29L (asfalt) i 11L/29R (trawa) leżą obok siebie
    // i są przesunięte względem siebie wzdłuż osi. Sklejone dawały jedną płytę
    // o długości 1939 m, której na lotnisku nie ma.
    const runways = runwaysFromWays([
      way(1, { lat: 52.0, lon: 15.0 }, { lat: 52.0, lon: 15.0153 }, { ref: '11R/29L' }),
      way(2, { lat: 52.0018, lon: 15.00584 }, { lat: 52.0018, lon: 15.02114 }, { ref: '11L/29R' }),
    ]);

    expect(runways).toHaveLength(2);
    for (const runway of runways) {
      expect(runway.lengthM).toBeLessThan(1100);
    }
  });

  it('pasy krzyżujące się zostają osobno, najdłuższy pierwszy', () => {
    const south = { lat: 51.997, lon: 15.005 };
    const north = { lat: 52.003, lon: 15.005 };
    const runways = runwaysFromWays([
      way(1, west, east, { ref: '09/27' }),
      way(2, south, north, { ref: '18/36' }),
    ]);

    expect(runways).toHaveLength(2);
    expect(runways[0]!.ref).toBe('09/27');
    expect(runways[1]!.ref).toBe('18/36');
    expect(runways[1]!.headingDeg).toBe(180);
  });

  it('pomija waye bez geometrii', () => {
    expect(runwaysFromWays([{ id: 1, tags: { ref: '09/27' } }])).toEqual([]);
    expect(runwaysFromWays([{ id: 2, geometry: [west] }])).toEqual([]);
  });
});

describe('przypisanie pasów do lotnisk', () => {
  const airfields = [
    { icao: 'EPZP', lat: 51.9789, lon: 15.4639 },
    { icao: 'EPZG', lat: 52.1385, lon: 15.7986 },
  ];

  it('pas trafia do NAJBLIŻSZEGO lotniska, a nie do każdego w promieniu', () => {
    const atPrzylep = way(1, { lat: 51.978, lon: 15.46 }, { lat: 51.98, lon: 15.47 });
    const assigned = assignWaysToAirfields([atPrzylep], airfields);

    expect(assigned.get('EPZP')).toHaveLength(1);
    expect(assigned.has('EPZG')).toBe(false);
  });

  it('pas daleko od wszystkiego wypada — to nie nasze lotnisko', () => {
    const somewhereElse = way(2, { lat: 50.0, lon: 20.0 }, { lat: 50.001, lon: 20.01 });

    expect(assignWaysToAirfields([somewhereElse], airfields).size).toBe(0);
  });
});

describe('kolejność źródeł', () => {
  const osmWay = [way(1, { lat: 52.0, lon: 15.0 }, { lat: 52.0, lon: 15.01 }, { ref: '09/27' })];

  it('OurAirports ma pierwszeństwo — ślad ODbL zostaje możliwie mały', () => {
    const runway = pickRunway([runwayRow({ length_ft: '2887', le_heading_degT: '61' })], osmWay);

    expect(runway).toEqual({ headingDeg: 61, lengthM: 880, source: 'ourairports' });
  });

  it('gdy OurAirports nie podaje kursu, pas przychodzi z OSM', () => {
    const runway = pickRunway([runwayRow({ le_heading_degT: '' })], osmWay);

    expect(runway?.source).toBe('osm');
    expect(runway?.headingDeg).toBe(90);
  });

  it('długość poza granicami rozsądku odpada do następnego źródła', () => {
    // 40 000 stóp to 12 km pasa — pomyłka w źródle, nie dane słabej jakości.
    const runway = pickRunway([runwayRow({ length_ft: '40000' })], osmWay);

    expect(runway?.source).toBe('osm');
  });

  it('bez żadnego źródła zostaje null, a nie pas domyślny', () => {
    expect(pickRunway(undefined, undefined)).toBeNull();
    expect(pickRunway([], [])).toBeNull();
  });
});

describe('wypisanie modułu', () => {
  it('zawiera rekord, licznik i atrybucję OSM', () => {
    const source = renderAirfieldsModule([
      {
        icao: 'EPZP',
        name: 'Zielona Góra-Przylep Airfield',
        lat: 51.9789,
        lon: 15.4639,
        elevationFt: 249,
        runway: { headingDeg: 61, lengthM: 1065, source: 'osm' },
      },
    ]);

    expect(source).toContain(
      "{ icao: 'EPZP', name: \"Zielona Góra-Przylep Airfield\", lat: 51.9789, lon: 15.4639, " +
        "elevationFt: 249, runway: { headingDeg: 61, lengthM: 1065, source: 'osm' } },",
    );
    expect(source).toContain('Rekordów: 1, z pasem: 1 (z tego z OSM: 1)');
    expect(source).toContain('OpenStreetMap');
    expect(source).toContain('PLIK GENEROWANY');
  });
});
