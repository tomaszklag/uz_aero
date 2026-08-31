/**
 * UZ Aero - panel 2.0: plamki w geometrii TABELI.
 *
 * Skeleton ma udawać to, co za chwilę przyjdzie - więc rysuje prawdziwą tabelę
 * z prawdziwymi nagłówkami, a plamki stawia wyłącznie tam, gdzie będą DANE. Nagłówki
 * znamy lokalnie, nie czekają na nic i migotanie ich byłoby kłamstwem o tym, czego
 * jeszcze nie wiemy.
 *
 * Szerokości plamek podaje wywołujący, bo to wymiar UKŁADU konkretnej tabeli - kod
 * pilota jest krótki, nazwisko długie, a plamka jednakowej długości w każdej kolumnie
 * wygląda jak siatka, a nie jak wiersze.
 */

interface TableSkeletonProps {
  headers: string[];
  /** Szerokość plamki w każdej kolumnie (px) - tyle pozycji, ile nagłówków. */
  widths: number[];
  rows: number;
}

export function TableSkeleton({ headers, widths, rows }: TableSkeletonProps) {
  return (
    <div className="table-wrap" aria-busy="true">
      <table>
        <caption className="visually-hidden">Wczytywanie listy</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {headers.map((header, column) => (
                <td key={header}>
                  <span className="skeleton cell" style={{ width: widths[column] ?? 80 }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
