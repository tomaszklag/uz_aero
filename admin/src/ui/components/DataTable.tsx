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

import { Fragment, type ReactNode } from 'react';

/**
 * Kolumna sortowalna (`th.sortable` + `.arrow` z szablonu).
 *
 * Nagłówek staje się wtedy `<button>` wewnątrz `<th>`, a nie klikalnym `<th>` jak
 * w mockupie: `th` z `onClick` jest nieosiągalny z klawiatury, a panel jest po niej
 * nawigowany. Wygląd zostaje ten sam — przycisk dziedziczy typografię nagłówka.
 *
 * Kierunek jest STANEM EKRANU (mieszka w URL-u), więc przychodzi propsem; tabela
 * niczego nie sortuje sama, bo porządek listy należy do serwera.
 */
export interface ColumnSort {
  direction: 'asc' | 'desc';
  onToggle: () => void;
}

export interface Column<Row> {
  key: string;
  header: ReactNode;
  /** `num` = mono, do prawej, `tabular-nums` (klasa `.num` z szablonu). */
  align?: 'num';
  /** Dodatkowe klasy komórki — wyłącznie modyfikatory z szablonu (`mono`, `dim`). */
  cellClass?: string;
  /** Obecne wyłącznie na kolumnie, po której serwer FAKTYCZNIE umie sortować. */
  sort?: ColumnSort;
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
  /**
   * ROZWINIĘCIE wiersza — treść wypisana w wierszu-satelicie POD wierszem właściwym,
   * przez całą szerokość tabeli. `null`/`undefined` = wiersz się nie rozwija.
   *
   * Doszło razem z rejestrem zdarzeń (`A04`), gdzie mockup pokazuje payload DOKŁADNIE
   * pod wierszem, którego dotyczy. Szuflada z boku (wzorzec `A03a`) tu nie pasuje:
   * przy dochodzeniu porównuje się SĄSIEDNIE zdarzenia, a szuflada zasłania listę.
   * `A05` rozwija wiersz pod całą tabelą — tam treścią jest karta arkusza, czyli
   * dokument, a nie szczegół jednego wiersza.
   */
  expanded?: (row: Row) => ReactNode;
  caption: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClass,
  expanded,
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
            {columns.map((column) => {
              const classes = [column.align === 'num' ? 'num' : null, column.sort == null ? null : 'sortable']
                .filter((c) => c != null)
                .join(' ');
              return (
                <th
                  key={column.key}
                  className={classes === '' ? undefined : classes}
                  // Czytnik ekranu ma usłyszeć, że tabela JEST posortowana i jak —
                  // sama strzałka jest informacją wyłącznie dla oka.
                  aria-sort={
                    column.sort == null
                      ? undefined
                      : column.sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                  }
                >
                  {column.sort == null ? (
                    column.header
                  ) : (
                    <button type="button" onClick={column.sort.onToggle}>
                      {column.header}
                      <span className="arrow" aria-hidden="true">
                        {column.sort.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const extra = rowClass?.(row);
            const classes = [onRowClick == null ? null : 'clickable', extra]
              .filter((c) => c != null)
              .join(' ');
            const detail = expanded?.(row);
            return (
              // Fragment, a nie `<tbody>` na wiersz: rozwinięcie jest DRUGIM `<tr>`
              // w tym samym `<tbody>`, więc selektory `tbody tr:last-child` i pasy
              // hovera z szablonu działają dalej tak, jak w mockupie.
              <Fragment key={rowKey(row)}>
                <tr
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
                {detail == null ? null : (
                  <tr className="row-expand">
                    <td colSpan={columns.length}>{detail}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
