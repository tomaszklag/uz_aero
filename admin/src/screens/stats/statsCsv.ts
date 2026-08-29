/**
 * UZ Aero - panel: EKSPORT ZESTAWIENIA DO CSV (moduł CZYSTY).
 *
 * Plik powstaje z TYCH SAMYCH modeli wierszy, które widać w tabeli - CSV jest zrzutem
 * ekranu do arkusza, nie czwartym wyliczeniem. Serializujemy wartości sformatowane
 * („112:38", „21 436 L"): odbiorcą jest człowiek w Excelu, a surowe milisekundy ma
 * rejestr i API.
 *
 * Średnik jako separator - polskie ustawienia Excela traktują przecinek jako
 * separator dziesiętny i plik z przecinkami otwierają jedną kolumną. Z tego samego
 * powodu plik zaczyna się od BOM: bez niego ten sam Excel czyta UTF-8 jako
 * Windows-1250 i wysypuje polskie znaki w „Śr. L/h" i w nazwiskach.
 */

import type { AircraftRowView } from './statsAircraftRows';
import type { OperationRowView } from './statsOperationRows';
import type { PilotRowView } from './statsPilotRows';
import type { StatsView } from './statsFilters';

const SEPARATOR = ';';
const BOM = '\uFEFF';

/**
 * Pole CSV, dwie warstwy ochrony:
 *  1. treść zaczynająca się jak formuła (`=`, `+`, `-`, `@`) dostaje apostrof -
 *     nazwiska wpisuje wprawdzie administrator, ale to nadal wejście człowieka,
 *     a Excel wykonuje formuły z CSV bez pytania;
 *  2. cudzysłów tylko wtedy, gdy treść tego wymaga (separator, cudzysłów, CR/LF) -
 *     czytelniej w diffach.
 */
const field = (value: string): string => {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

const line = (values: string[]): string => values.map(field).join(SEPARATOR);

export interface StatsCsvInput {
  view: StatsView;
  range: { fromDay: string; toDay: string };
  aircraft: AircraftRowView[];
  pilots: PilotRowView[];
  operations: OperationRowView[];
}

/** Nazwa pliku: `statystyki_2026-07-01_2026-07-30_samolot.csv`. */
export function statsCsvFilename(input: StatsCsvInput): string {
  const view = { aircraft: 'samolot', pilot: 'pilot', operation: 'operacja' }[input.view];
  return `statystyki_${input.range.fromDay}_${input.range.toDay}_${view}.csv`;
}

/** Treść CSV BIEŻĄCEGO ujęcia - razem z wierszem RAZEM, dokładnie jak tabela. */
export function statsCsv(input: StatsCsvInput): string {
  return BOM + body(input);
}

function body(input: StatsCsvInput): string {
  switch (input.view) {
    case 'aircraft':
      return [
        line(['Samolot', 'Typ', 'Dni', 'Blok', 'Czas lotu', 'Starty / lądowania', 'Paliwo', 'Śr. L/h', 'MH start → koniec', 'Δ MH', 'Wykorzystanie']),
        ...input.aircraft.map((row) =>
          line([
            row.name,
            row.sub ?? '',
            row.days,
            row.block,
            row.flight,
            row.takeoffsLandings,
            row.fuel,
            row.avgLph,
            row.mhRange,
            row.mhDelta,
            row.utilization,
          ]),
        ),
      ].join('\n');
    case 'pilot':
      return [
        line(['Pilot', 'Kod', 'Dni', 'Blok jako PIC', 'Czas lotu', 'Starty / lądowania', 'Samoloty']),
        ...input.pilots.map((row) =>
          line([
            row.name,
            row.code,
            row.days,
            row.blockPic,
            row.flight,
            row.takeoffsLandings,
            row.regs,
          ]),
        ),
      ].join('\n');
    case 'operation':
      return [
        line(['Operacja', 'Szczegóły', 'Dni', 'Blok', 'Czas lotu', 'Starty / lądowania', 'Paliwo', 'Śr. L/h', 'Udział w nalocie']),
        ...input.operations.map((row) =>
          line([
            row.pill.label,
            row.sub ?? '',
            row.days,
            row.block,
            row.flight,
            row.takeoffsLandings,
            row.fuel,
            row.avgLph,
            row.share?.label ?? row.shareText ?? '',
          ]),
        ),
      ].join('\n');
  }
}
