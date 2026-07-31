/**
 * UZ Aero — panel: tabela (`.table-wrap` + `table` z `SZABLON.html`).
 *
 * Kręgosłup panelu, więc kolumny deklaruje się DANYMI, a nie JSX-em: `{key, header,
 * align, render}`. Dzięki temu „która kolumna jest liczbowa" jest własnością definicji,
 * a nie klasą przepisywaną ręcznie w każdej komórce — a liczby w panelu zawsze są mono
 * i wyrównane do prawej.
 *
 * **Wiersz jest klikalny ORAZ ma prawdziwy link.** `tr.clickable` sam w sobie jest
 * niedostępny z klawiatury i uniemożliwia „kopiuj adres linku", czyli psuje ten sam
 * scenariusz deep linków, dla którego panel istnieje. Kliknięcie w wiersz to skrót
 * myszy; drogą właściwą jest link w kolumnie akcji.
 */

import type { ReactNode } from 'react';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  /** `num` = mono, do prawej, `tabular-nums` (klasa `.num` z szablonu). */
  align?: 'num';
  /** Dodatkowe klasy komórki — wyłącznie modyfikatory z szablonu (`mono`, `dim`). */
  cellClass?: string;
  render: (row: Row) => ReactNode;
}

interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string | number;
  /** Skrót myszy — wiersz wykonuje tę samą akcję, co link w kolumnie akcji. */
  onRowClick?: (row: Row) => void;
  /** Wiersz wyróżniony (np. otwarty w szufladzie) — klasa modyfikatora. */
  rowClass?: (row: Row) => string | undefined;
  caption: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClass,
  caption,
}: DataTableProps<Row>) {
  return (
    <div className="table-wrap">
      <table>
        {/* Podpis dla czytnika ekranu — w mockupie nagłówek stoi nad tabelą jako
            tytuł strony, ale czytnik potrzebuje go W tabeli, żeby ją nazwać. */}
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === 'num' ? 'num' : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const extra = rowClass?.(row);
            const classes = [onRowClick == null ? null : 'clickable', extra]
              .filter((c) => c != null)
              .join(' ');
            return (
              <tr
                key={rowKey(row)}
                className={classes === '' ? undefined : classes}
                onClick={onRowClick == null ? undefined : () => onRowClick(row)}
              >
                {columns.map((column) => {
                  const cell = [column.align === 'num' ? 'num' : null, column.cellClass]
                    .filter((c) => c != null)
                    .join(' ');
                  return (
                    <td key={column.key} className={cell === '' ? undefined : cell}>
                      {column.render(row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
