/**
 * UZ Aero — parser CSV dla generatora katalogu lotnisk.
 *
 * Własny, bo pliki OurAirports mają przecinki i cudzysłowy WEWNĄTRZ pól (nazwy w rodzaju
 * `"Zielona Góra-Babimost Airport, EPZG"`), a generator jest jedynym miejscem w repo,
 * które czyta CSV — dokładanie zależności pakietowej dla trzydziestu linii byłoby
 * gorszym interesem niż ten parser.
 */

/** Wiersze pliku CSV; puste pola zostają pustymi łańcuchami, nie znikają. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        // Podwójny cudzysłów wewnątrz pola = jeden znak cudzysłowu w treści.
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Wiersz CSV jako mapa kolumna → wartość. Brakująca kolumna to `undefined`. */
export type CsvRecord = Readonly<Record<string, string | undefined>>;

/**
 * Wiersze na rekordy wg nagłówka. Wiersze o innej liczbie kolumn niż nagłówek
 * pomijamy — w plikach OurAirports zdarzają się urwane linie, a rekord przesunięty
 * o jedną kolumnę oznaczałby szerokość pasa wpisaną jako długość.
 */
export function toObjects(rows: readonly string[][]): CsvRecord[] {
  const head = rows[0];
  if (head == null) return [];
  return rows
    .slice(1)
    .filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
