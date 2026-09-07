/**
 * UZ Aero - testy katalogu lotnisk i wyboru tych widocznych na mapie.
 *
 * Sedno: mapa śladu nie ma kafelków, więc lotniska są JEDYNYM odniesieniem w terenie.
 * Dwie rzeczy mogą to zepsuć i obie są tu sprawdzone - pokazanie zbyt wielu lądowisk
 * (mapa zamienia się w listę nazw, przez którą nie widać śladu) oraz pominięcie tego
 * jednego, które pilot wpisał w preflighcie.
 */

import {
  MAX_AIRFIELDS_IN_VIEW,
  POLISH_AIRFIELDS,
  airfieldByIcao,
  airfieldsInView,
  type Airfield,
} from '../domain';

/** Kadr wokół Zielonej Góry - obszar typowego lotu lokalnego. */
const AROUND_EPZG = { north: 52.35, south: 51.95, east: 16.05, west: 15.55 };

function airfield(icao: string, lat: number, lon: number): Airfield {
  return { icao, name: `Lotnisko ${icao}`, lat, lon, elevationFt: 200, runway: null };
}

describe('katalog lotnisk', () => {
  it('zawiera polskie lotniska z poprawnymi kodami ICAO', () => {
    expect(POLISH_AIRFIELDS.length).toBeGreaterThan(50);
    expect(POLISH_AIRFIELDS.every((a) => /^EP[A-Z]{2}$/.test(a.icao))).toBe(true);
  });

  it('współrzędne mieszczą się w granicach Polski', () => {
    // Gdyby generator pomylił kolumny CSV (lat/lon zamienione), ślad rysowałby się
    // setki kilometrów od lotniska - a na siatce bez kafelków nikt by nie zgadł dlaczego.
    for (const a of POLISH_AIRFIELDS) {
      expect(a.lat).toBeGreaterThan(48.9);
      expect(a.lat).toBeLessThan(55.0);
      expect(a.lon).toBeGreaterThan(14.0);
      expect(a.lon).toBeLessThan(24.2);
    }
  });

  it('pasy mają sensowną długość i kurs', () => {
    for (const a of POLISH_AIRFIELDS) {
      if (a.runway == null) continue;
      expect(a.runway.lengthM).toBeGreaterThan(100);
      expect(a.runway.lengthM).toBeLessThan(4500);
      expect(a.runway.headingDeg).toBeGreaterThanOrEqual(0);
      expect(a.runway.headingDeg).toBeLessThanOrEqual(360);
    }
  });

  it('prawie każde lotnisko ma pas - bez tego mapa daje samą kropkę', () => {
    // Do issue #3 pas miało 68 ze 106 lotnisk, a brakowało akurat aeroklubowych,
    // czyli tych, z których lata się najczęściej. Uzupełnia je OSM.
    const withRunway = POLISH_AIRFIELDS.filter((a) => a.runway != null);

    expect(withRunway.length).toBeGreaterThanOrEqual(POLISH_AIRFIELDS.length - 3);
  });

  it('każdy pas mówi, z którego źródła pochodzi (atrybucja ODbL)', () => {
    for (const a of POLISH_AIRFIELDS) {
      if (a.runway == null) continue;
      expect(['ourairports', 'osm']).toContain(a.runway.source);
    }
  });

  it('kursy znanych pasów zgadzają się z ich oznaczeniem', () => {
    // Test na FAKTY, nie na kształt danych: to jedyny rodzaj sprawdzenia, który łapie
    // błąd z issue #3. Pusta komórka CSV dawała `Number('') === 0` i EPZP - pas 06/24 -
    // trafiało do katalogu z kursem 0°, czyli narysowane na północ.
    const known: Record<string, number> = {
      EPZP: 60, // Zielona Góra-Przylep, 06/24
      EPZG: 60, // Zielona Góra-Babimost, 06/24
      EPKA: 110, // Kielce-Masłów, 11/29
      EPSU: 80, // Suwałki, 08/26
      EPKW: 130, // Bielsko-Biała Kaniów, 13/31
      EPKK: 70, // Kraków-Balice, 07/25
    };

    for (const [icao, expected] of Object.entries(known)) {
      const runway = airfieldByIcao(icao)?.runway;
      expect(runway).not.toBeNull();
      // Oznaczenie progu jest magnetyczne i zaokrąglone do 10°, katalog trzyma kurs
      // geograficzny - 15° zapasu mieści deklinację i zaokrąglenie, a wyłapuje pomyłkę
      // o rząd wielkości.
      expect(Math.abs(runway!.headingDeg - expected)).toBeLessThanOrEqual(15);
    }
  });

  it('kody są unikalne', () => {
    const codes = POLISH_AIRFIELDS.map((a) => a.icao);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('zna lotnisko po ICAO, niezależnie od wielkości liter', () => {
    expect(airfieldByIcao('EPZG')?.icao).toBe('EPZG');
    expect(airfieldByIcao('epzg')?.icao).toBe('EPZG');
    expect(airfieldByIcao(' EPZG ')?.icao).toBe('EPZG');
    expect(airfieldByIcao('XXXX')).toBeNull();
    expect(airfieldByIcao(null)).toBeNull();
  });
});

describe('airfieldsInView', () => {
  it('bierze lotniska leżące w kadrze', () => {
    const found = airfieldsInView(AROUND_EPZG);
    expect(found.some((a) => a.icao === 'EPZG')).toBe(true);
    // Kraków leży 400 km dalej - nie ma prawa się pojawić.
    expect(found.some((a) => a.icao === 'EPKK')).toBe(false);
  });

  it('pomija lotniska spoza kadru', () => {
    const catalogue = [airfield('EPAA', 52.1, 15.8), airfield('EPBB', 50.0, 19.0)];
    const found = airfieldsInView(AROUND_EPZG, { catalogue });

    expect(found.map((a) => a.icao)).toEqual(['EPAA']);
  });

  it('nigdy nie pokazuje więcej niż limit - mapa ma zostać czytelna', () => {
    // Dwanaście lądowisk stłoczonych w kadrze; wolno pokazać najwyżej sześć.
    const catalogue = Array.from({ length: 12 }, (_, i) =>
      airfield(`EP${String.fromCharCode(65 + i)}X`, 52.1 + i * 0.005, 15.8 + i * 0.005),
    );
    const found = airfieldsInView(AROUND_EPZG, { catalogue });

    expect(found).toHaveLength(MAX_AIRFIELDS_IN_VIEW);
  });

  it('przy nadmiarze zostawia te najbliższe środkowi trasy', () => {
    const center = { lat: 52.15, lon: 15.8 };
    const catalogue = [
      airfield('EPFA', 52.34, 16.04), // róg kadru
      airfield('EPNE', center.lat, center.lon), // środek
      airfield('EPMI', 52.2, 15.85),
    ];
    const found = airfieldsInView(AROUND_EPZG, { catalogue, limit: 2 });

    expect(found[0]!.icao).toBe('EPNE');
    expect(found.map((a) => a.icao)).not.toContain('EPFA');
  });

  it('lotnisko z preflightu wchodzi ZAWSZE i jako pierwsze - także spoza kadru', () => {
    // Pilot wpisał je ręcznie, więc jest odpowiedzią na „gdzie to było",
    // a nie przypadkowym sąsiadem trasy.
    const daleko = airfield('EPRA', 51.39, 21.21);
    const catalogue = [airfield('EPNE', 52.15, 15.8), daleko];
    const found = airfieldsInView(AROUND_EPZG, { catalogue, preferredIcao: 'EPRA' });

    expect(found[0]!.icao).toBe('EPRA');
    expect(found.map((a) => a.icao)).toContain('EPNE');
  });

  it('nie dubluje lotniska z preflightu, gdy leży w kadrze', () => {
    const catalogue = [airfield('EPNE', 52.15, 15.8)];
    const found = airfieldsInView(AROUND_EPZG, { catalogue, preferredIcao: 'EPNE' });

    expect(found).toHaveLength(1);
  });

  it('nieznany kod z preflightu niczego nie psuje', () => {
    const catalogue = [airfield('EPNE', 52.15, 15.8)];
    const found = airfieldsInView(AROUND_EPZG, { catalogue, preferredIcao: 'ZZZZ' });

    expect(found.map((a) => a.icao)).toEqual(['EPNE']);
  });

  it('pusty kadr daje pustą listę, a nie losowe lotniska', () => {
    const daleko = { north: 10, south: 9, east: 10, west: 9 };
    expect(airfieldsInView(daleko)).toEqual([]);
  });
});
