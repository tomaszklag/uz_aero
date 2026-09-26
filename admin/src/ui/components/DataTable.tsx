/**
 * Ninerdeck - panel: tabela (`.table-wrap` + `table` z `SZABLON.html`).
 *
 * Kręgosłup panelu, więc kolumny deklaruje się DANYMI, a nie JSX-em: `{key, header,
 * align, render}`. Dzięki temu „która kolumna jest liczbowa" jest własnością definicji,
 * a nie klasą przepisywaną ręcznie w każdej komórce - a liczby w panelu zawsze są mono
 * i wyrównane do prawej.
 *
 * **Wiersz jest klikalny ORAZ ma prawdziwy link.** `tr.clickable` sam w sobie jest
 * niedostępny z klawiatury i uniemożliwia „kopiuj adres linku", czyli psuje ten sam
 * scenariusz deep linków, dla którego panel istnieje. Kliknięcie w wiersz to skrót
 * myszy; drogą właściwą jest link w kolumnie akcji.
 *
 * ══ GRUPY I ZWINIĘCIE (3.2.0, `docs/panel-3.2.md` §4.3, §17.1) ══
 * `groups` układa wiersze pod NAGŁÓWKAMI (`<tbody class="day">` + `tr.day-row`) -
 * doba jest nagłówkiem, nie kolumną. `fold` dokłada pod listą JEDEN wiersz zwinięcia
 * (`tr.fold-row` z przyciskiem) i po rozwinięciu wiersze przygaszone - członkowie bez
 * lotów. Oba są DANYMI, jak kolumny: ekran mówi, co zwinąć, a kształt ma tabela.
 */

import { Fragment, type ReactNode } from 'react';

/**
 * Kolumna sortowalna (`th.sortable` + `.arrow` z szablonu).
 *
 * Nagłówek staje się wtedy `<button>` wewnątrz `<th>`, a nie klikalnym `<th>` jak
 * w mockupie: `th` z `onClick` jest nieosiągalny z klawiatury, a panel jest po niej
 * nawigowany. Wygląd zostaje ten sam - przycisk dziedziczy typografię nagłówka.
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
  /** Dodatkowe klasy komórki - wyłącznie modyfikatory z szablonu (`mono`, `dim`). */
  cellClass?: string;
  /** Obecne wyłącznie na kolumnie, po której serwer FAKTYCZNIE umie sortować. */
  sort?: ColumnSort;
  render: (row: Row) => ReactNode;
}

/** Grupa wierszy pod jednym nagłówkiem - doba dziennika. */
export interface RowGroup<Row> {
  key: string;
  header: ReactNode;
  rows: Row[];
}

/** Wiersz zwinięcia pod listą; po rozwinięciu `rows` wchodzą przygaszone (`tr.muted`). */
export interface RowFold<Row> {
  /** Napis w stanie zwiniętym („+3 członków bez lotów w tym zakresie"). */
  label: string;
  /** Napis w stanie rozwiniętym („Zwiń · 3 członków…"). */
  openLabel: string;
  expanded: boolean;
  onToggle: () => void;
  rows: Row[];
}

interface DataTableProps<Row> {
  columns: Column<Row>[];
  /** Wiersze płaskie; przy `groups` pomijane. */
  rows?: Row[];
  groups?: RowGroup<Row>[];
  fold?: RowFold<Row>;
  rowKey: (row: Row) => string | number;
  /** Skrót myszy - wiersz wykonuje tę samą akcję, co link w kolumnie akcji. */
  onRowClick?: (row: Row) => void;
  /** Wiersz wyróżniony (np. otwarty w szufladzie) - klasa modyfikatora. */
  rowClass?: (row: Row) => string | undefined;
  /**
   * ROZWINIĘCIE wiersza - treść wypisana w wierszu-satelicie POD wierszem właściwym,
   * przez całą szerokość tabeli. `null`/`undefined` = wiersz się nie rozwija.
   *
   * Doszło razem z rejestrem zdarzeń (`A04`), gdzie mockup pokazuje payload DOKŁADNIE
   * pod wierszem, którego dotyczy. Szuflada z boku (wzorzec `A03a`) tu nie pasuje:
   * przy dochodzeniu porównuje się SĄSIEDNIE zdarzenia, a szuflada zasłania listę.
   * `A05` rozwija wiersz pod całą tabelą - tam treścią jest karta arkusza, czyli
   * dokument, a nie szczegół jednego wiersza.
   */
  expanded?: (row: Row) => ReactNode;
  /**
   * WIERSZ SUM (`tfoot`, 3.2.0 - statystyki): jedna komórka na kolumnę, w kolejności
   * kolumn, z ich wyrównaniem. Treść komórek przychodzi POLICZONA (serwer sumuje,
   * tabela układa) - i dlatego to lista napisów, a nie funkcja nad wierszami: tabela
   * nie ma prawa dodać kolumny sama, bo nie wie, których liczb nie wolno dodawać.
   */
  foot?: ReactNode[];
  caption: string;
}

export function DataTable<Row>({
  columns,
  rows,
  groups,
  fold,
  rowKey,
  onRowClick,
  rowClass,
  expanded,
  foot,
  caption,
}: DataTableProps<Row>) {
  const renderRow = (row: Row, forced?: string): ReactNode => {
    const extra = rowClass?.(row);
    const classes = [onRowClick == null ? null : 'clickable', forced, extra]
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
  };

  const foldRows =
    fold == null ? null : (
      <>
        <tr className="fold-row">
          <td colSpan={columns.length}>
            <button
              type="button"
              className="fold-btn"
              aria-expanded={fold.expanded}
              onClick={fold.onToggle}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
              {fold.expanded ? fold.openLabel : fold.label}
            </button>
          </td>
        </tr>
        {fold.expanded ? fold.rows.map((row) => renderRow(row, 'muted')) : null}
      </>
    );

  return (
    <div className="table-wrap">
      <table>
        {/* Podpis dla czytnika ekranu - w mockupie nagłówek stoi nad tabelą jako
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
                  // Czytnik ekranu ma usłyszeć, że tabela JEST posortowana i jak -
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
        {groups == null ? (
          <tbody>
            {(rows ?? []).map((row) => renderRow(row))}
            {foldRows}
          </tbody>
        ) : (
          groups.map((group) => (
            // `<tbody>` na DOBĘ: nagłówek jest pierwszym wierszem grupy, więc selektor
            // `tbody.day + tbody.day` z szablonu rysuje mocniejszy włos między dobami.
            <tbody key={group.key} className="day">
              <tr className="day-row">
                <th colSpan={columns.length} scope="rowgroup">
                  {group.header}
                </th>
              </tr>
              {group.rows.map((row) => renderRow(row))}
            </tbody>
          ))
        )}
        {foot == null ? null : (
          <tfoot>
            <tr>
              {columns.map((column, index) => (
                <td key={column.key} className={column.align === 'num' ? 'num' : undefined}>
                  {foot[index]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
