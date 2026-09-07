/**
 * UZ Aero - testy wiersza listy lotnisk (`ui/components/input/airfieldRow.ts`).
 *
 * Wiersz niesie jedną rzecz, którą łatwo pokazać źle: KURS PASA. Katalog trzyma kurs
 * geograficzny (mapa śladu obraca nim pas na siatce zorientowanej na północ geograficzną),
 * a pilot czyta z tabliczki progu kurs magnetyczny - pomyłka o deklinację to pomyłka
 * o cały próg przy zaokrągleniu do dziesiątek.
 *
 * Testy powstały przy podpowiedziach pod wierszem trasy (`routeSuggestions.test.ts`);
 * przy issue #14 tamten moduł zniknął razem z listą pod formularzem (podpowiedzi mieszkają
 * teraz w arkuszu wyboru lotniska), a te przypadki opisują wiersz, więc zostały przy nim.
 */

import { airfieldRow } from '../ui/components/input/airfieldRow';
import type { Airfield } from '../domain';

function airfield(icao: string, name: string): Airfield {
  return { icao, name, lat: 52, lon: 16, elevationFt: 200, runway: null };
}

describe('airfieldRow', () => {
  it('podaje kurs pasa MAGNETYCZNY, bo taki jest na tabliczce progu', () => {
    const row = airfieldRow({
      icao: 'EPZG',
      name: 'Zielona Góra-Babimost Airport',
      lat: 52.1385,
      lon: 15.7986,
      elevationFt: 194,
      runway: { headingDeg: 65, lengthM: 2500, source: 'ourairports' },
    });

    // Katalog trzyma 65° geograficznych, a pilot czyta 060 - czyli próg 06.
    expect(row.meta).toBe('pas 060° · 2500 m · 194 ft');
  });

  it('przelicza deklinację per lotnisko, a nie jedną dla całego kraju', () => {
    // Ten sam kurs geograficzny na zachodzie i wschodzie kraju daje różne magnetyczne -
    // rozpiętość deklinacji przez Polskę to ~3°, czyli więcej niż rozdzielczość podpisu.
    const west = airfieldRow({
      ...airfield('EPSC', 'Szczecin'),
      lat: 53.58,
      lon: 14.9,
      runway: { headingDeg: 100, lengthM: 2500, source: 'ourairports' },
    });
    const east = airfieldRow({
      ...airfield('EPSU', 'Suwałki'),
      lat: 54.07,
      lon: 22.9,
      runway: { headingDeg: 100, lengthM: 2500, source: 'ourairports' },
    });

    expect(west.meta).not.toBe(east.meta);
  });

  it('pomija to, czego katalog nie zna', () => {
    expect(airfieldRow(airfield('EPXX', 'Bez danych')).meta).toBe('200 ft');
    expect(
      airfieldRow({ ...airfield('EPYY', 'Zupełnie bez danych'), elevationFt: null }).meta,
    ).toBeNull();
  });
});
