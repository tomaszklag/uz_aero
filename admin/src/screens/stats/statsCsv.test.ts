/**
 * UZ Aero — panel: eksport zestawienia do CSV.
 *
 * CSV powstaje z TYCH SAMYCH modeli wierszy, które widać w tabeli — razem z RAZEM.
 * Separator to średnik (polski Excel), a pola z separatorem w treści są cytowane.
 */

import { describe, expect, it } from 'vitest';

import { statsFixture } from '../../../test/fixtures/stats';
import { aircraftRows } from './statsAircraftRows';
import { statsCsv, statsCsvFilename } from './statsCsv';
import { operationRows } from './statsOperationRows';
import { pilotRows } from './statsPilotRows';

/** Znak BOM w asercjach po nazwie — literał byłby niewidoczny w kodzie testu. */
const BOM = '\uFEFF';

function input(view: 'aircraft' | 'pilot' | 'operation') {
  const data = statsFixture();
  return {
    view,
    range: data.range,
    aircraft: aircraftRows(data.aircraft, data.totals),
    pilots: pilotRows(data.pilots, data.totals),
    operations: operationRows(data.operations, data.totals),
  };
}

describe('statsCsv', () => {
  it('nazwa pliku niesie zakres i ujęcie po polsku', () => {
    expect(statsCsvFilename(input('aircraft'))).toBe(
      'statystyki_2026-07-01_2026-07-30_samolot.csv',
    );
    expect(statsCsvFilename(input('operation'))).toBe(
      'statystyki_2026-07-01_2026-07-30_operacja.csv',
    );
  });

  it('plik zaczyna się od BOM — bez niego polski Excel czyta „Śr. L/h" jako krzaki', () => {
    // Średnik „dla polskiego Excela" bez BOM to połowa roboty: ten sam Excel
    // zinterpretuje UTF-8 jako Windows-1250 i wysypie polskie znaki w nagłówkach
    // i nazwiskach.
    expect(statsCsv(input('aircraft')).startsWith(BOM)).toBe(true);
    expect(statsCsv(input('pilot')).startsWith(BOM)).toBe(true);
    expect(statsCsv(input('operation')).startsWith(BOM)).toBe(true);
  });

  it('ujęcie per samolot: nagłówek, wiersze jednostek i RAZEM na końcu', () => {
    const lines = statsCsv(input('aircraft')).replace(BOM, '').split('\n');
    expect(lines[0]).toBe(
      'Samolot;Typ;Dni;Blok;Czas lotu;Starty / lądowania;Paliwo;Śr. L/h;MH start → koniec;Δ MH;Wykorzystanie',
    );
    expect(lines[1]).toContain('SP-KLM');
    expect(lines[1]).toContain('112:38');
    expect(lines[lines.length - 1]).toContain('RAZEM');
    expect(lines[lines.length - 1]).toContain('186:39');
  });

  it('ujęcie per pilot i per operacja mają własne kolumny', () => {
    expect(statsCsv(input('pilot')).replace(BOM, '').split('\n')[0]).toBe(
      'Pilot;Kod;Dni;Blok jako PIC;Czas lotu;Starty / lądowania;Samoloty',
    );
    const operations = statsCsv(input('operation')).split('\n');
    expect(operations[0]).toContain('Udział w nalocie');
    expect(operations[1]).toContain('SKOKI');
    expect(operations[1]).toContain('60.3 %');
  });

  it('pole ze średnikiem w treści jest cytowane, cudzysłów podwajany', () => {
    const rows = input('pilot');
    rows.pilots[0]!.name = 'Anna; "Wrzos"';
    const line = statsCsv(rows).replace(BOM, '').split('\n')[1]!;
    expect(line.startsWith('"Anna; ""Wrzos"""')).toBe(true);
  });

  it('pole zaczynające się jak formuła dostaje apostrof — Excel nie wykona =HYPERLINK', () => {
    // Nazwiska wpisuje wprawdzie administrator, ale to nadal wejście człowieka —
    // a Excel wykonuje formuły z CSV bez pytania.
    const rows = input('pilot');
    rows.pilots[0]!.name = '=HYPERLINK("http://zlo.example";"Anna Wrzosek")';
    const line = statsCsv(rows).replace(BOM, '').split('\n')[1]!;
    expect(line.startsWith(`"'=HYPERLINK`)).toBe(true);

    for (const prefix of ['+48 601 000 000', '-płatność', '@zarzad']) {
      const again = input('pilot');
      again.pilots[0]!.name = prefix;
      expect(statsCsv(again).replace(BOM, '').split('\n')[1]!.startsWith(`'${prefix[0]!}`)).toBe(
        true,
      );
    }
  });

  it('znak CR w treści jest cytowany tak samo jak LF', () => {
    const rows = input('pilot');
    rows.pilots[0]!.name = 'Anna\rWrzosek';
    const line = statsCsv(rows).replace(BOM, '').split('\n')[1]!;
    expect(line.startsWith('"Anna\rWrzosek"')).toBe(true);
  });
});
