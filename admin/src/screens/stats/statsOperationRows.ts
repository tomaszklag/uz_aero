/**
 * UZ Aero — panel: UJĘCIE „PER OPERACJA" → wiersze tabeli (moduł CZYSTY).
 *
 * Udział w nalocie (`blockSharePct`) liczy SERWER; tu powstaje wyłącznie geometria
 * paska i etykieta. Podpisy wierszy składają się z DANYCH projekcji (rejestracje,
 * liczba klientów) — list lotnisk i nazw egzaminów z mockupu projekcja nie niesie
 * i podpis ich nie zmyśla (sprostowanie w `A10-statystyki.html`).
 */

import { duration, plural } from '@uzaero/format';
import type { OperationType } from '@uzaero/domain';

import type { StatsOperationItemDto, StatsTotalsDto } from '../../api/dto';
import { DASH, dot1, litresThousands, pct1 } from './statsFormat';

export interface OperationRowView {
  key: string;
  total: boolean;
  pill: { label: string; tone: 'blue' | 'dim' };
  sub: string | null;
  days: string;
  block: string;
  flight: string;
  takeoffsLandings: string;
  fuel: string;
  avgLph: string;
  /** Pasek udziału; `null` w wierszu RAZEM (tam stoi sam napis `shareText`). */
  share: { width: string; blue: boolean; label: string } | null;
  shareText: string | null;
  blockClass?: string;
  flightClass?: string;
  fuelClass?: string;
}

/** Etykiety plakietek — wersaliki jak w mockupie; `null` = dni bez preflightu. */
const OPERATION_LABELS: Record<OperationType, string> = {
  skoki: 'SKOKI',
  // Wartość w rejestrze to nadal `ferry`; napis jest polski jak wszędzie indziej (issue #13).
  ferry: 'PRZELOT',
  egzamin: 'EGZAMIN',
  techniczny: 'TECHNICZNY',
  inne: 'INNE',
};

export function operationRows(
  operations: StatsOperationItemDto[],
  totals: StatsTotalsDto,
): OperationRowView[] {
  const rows = operations.map(
    (row): OperationRowView => ({
      key: row.operation ?? 'none',
      total: false,
      pill: {
        label: row.operation == null ? 'BEZ PREFLIGHTU' : OPERATION_LABELS[row.operation],
        // Niebieska plakietka wyróżnia SKOKI — stronę przychodową klubu (mockup barwi
        // tylko ten wiersz; reszta operacji jest przygaszona).
        tone: row.operation === 'skoki' ? 'blue' : 'dim',
      },
      sub: subOf(row),
      days: String(row.sessions),
      block: duration(row.blockMs),
      flight: duration(row.flightMs),
      takeoffsLandings:
        row.takeoffs == null || row.landings == null ? DASH : `${row.takeoffs} / ${row.landings}`,
      fuel: litresThousands(row.fuelConsumedL),
      avgLph: dot1(row.avgLitresPerBlockHour),
      share:
        row.blockSharePct == null
          ? null
          : {
              width: `${row.blockSharePct.toFixed(1)}%`,
              blue: row.operation === 'skoki',
              label: pct1(row.blockSharePct),
            },
      shareText: row.blockSharePct == null ? DASH : null,
    }),
  );

  rows.push({
    key: 'total',
    total: true,
    pill: { label: 'RAZEM', tone: 'dim' },
    sub: null,
    days: String(totals.sessions),
    block: duration(totals.blockMs),
    flight: duration(totals.flightMs),
    takeoffsLandings:
      totals.takeoffs == null || totals.landings == null
        ? DASH
        : `${totals.takeoffs} / ${totals.landings}`,
    fuel: litresThousands(totals.fuelConsumedL),
    avgLph: DASH,
    share: null,
    shareText: totals.blockMs > 0 ? '100 %' : DASH,
    blockClass: 'cell-green',
    flightClass: 'cell-blue',
    fuelClass: 'cell-amber',
  });

  return rows;
}

function subOf(row: StatsOperationItemDto): string | null {
  const parts: string[] = [];
  if (row.regs.length > 0) parts.push(row.regs.join(' · '));
  if (row.clients > 0) {
    parts.push(`${row.clients} ${plural(row.clients, 'klient', 'klientów', 'klientów')}`);
  }
  if (row.operation == null) parts.push('dni bez `preflight_confirm`');
  return parts.length === 0 ? null : parts.join(' · ');
}
