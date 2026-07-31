/**
 * UZ Aero (serwer) — paginacja KEYSET (kursorowa), nigdy `OFFSET`.
 *
 * **Powód jest operacyjny, nie estetyczny.** Tabele, po których chodzi panel, rosną
 * W TRAKCIE przeglądania — telefony dosyłają outboxy, a serwer odświeża projekcje.
 * `OFFSET 500` na rosnącej tabeli GUBI wiersze (nowy wiersz na początku przesuwa
 * resztę o jeden) i DUBLUJE inne przy sortowaniu malejącym. Administrator szukający
 * konkretnego dnia mógłby nie zobaczyć akurat tego, którego szuka — najgorszy możliwy
 * tryb awarii narzędzia diagnostycznego. Kursor keyset opisuje POZYCJĘ w porządku,
 * a nie liczbę pominiętych wierszy, więc dopisanie wiersza go nie przesuwa.
 *
 * Kursor jest NIEPRZEZROCZYSTY dla panelu (base64url JSON). To nie jest zaciemnianie:
 * chodzi o to, żeby klient nie zaczął go konstruować sam, bo wtedy kształt klucza
 * przestałby być sprawą serwera.
 */

import type { SqlFilter } from './sqlFilter.ts';

/**
 * Klucz sortowania: para (wartość kolumny wiodącej, unikalny tie-breaker).
 *
 * Druga składowa MUSI być unikalna w obrębie zapytania (uuid, id) — bez niej wiersze
 * o równej wartości pierwszej kolumny mogłyby wypaść z porządku i zniknąć między
 * stronami. To jest cały powód, dla którego kursor jest parą, a nie liczbą.
 */
export interface CursorKey {
  /** `null` = kolumna wiodąca jest NULL-owalna i ten wiersz miał w niej NULL. */
  k1: string | number | null;
  k2: string;
}

/** Kierunek porządku — ten sam dla obu kolumn klucza. */
export type KeysetDirection = 'asc' | 'desc';

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

/**
 * Typ kolumny wiodącej — deklarowany przez WOŁAJĄCEGO, bo tylko on go zna.
 * Parametr jest wymagany celowo: bez niego kursor przepuszczał wartość dowolnego
 * kształtu, a odrzucała ją dopiero baza.
 */
export type CursorK1Type = 'number' | 'string';

/**
 * `null` = kursor nieczytelny. Zepsuty kursor NIE JEST błędem serwera: to wartość
 * z zewnątrz, więc trasa odpowiada 400, a nie 500 — dlatego ta funkcja nigdy nie rzuca.
 *
 * Samo sprawdzenie „czy da się sparsować" NIE WYSTARCZA i to była realna luka: kursor
 * z `k1: "abc"` albo `k1: 0.5` jest poprawnym JSON-em, przechodził dalej i wywracał się
 * dopiero w Postgresie na porównaniu z `BIGINT` — a wtedy administrator dostawał 500
 * z treścią błędu SQL-a zamiast 400. Dlatego walidujemy kursor WZGLĘDEM TYPU kolumny,
 * a dla liczb wymagamy bezpiecznej liczby całkowitej: `1e30` mieści się w `number`,
 * ale nie w `BIGINT`.
 */
export function decodeCursor(raw: string, k1Type: CursorK1Type): CursorKey | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (parsed == null || typeof parsed !== 'object') return null;

    const { k1, k2 } = parsed as { k1?: unknown; k2?: unknown };
    if (typeof k2 !== 'string') return null;

    if (k1 === null) return { k1: null, k2 };
    if (k1Type === 'number') {
      return typeof k1 === 'number' && Number.isSafeInteger(k1) ? { k1, k2 } : null;
    }
    return typeof k1 === 'string' ? { k1, k2 } : null;
  } catch {
    return null;
  }
}

/**
 * `ORDER BY` zgodny z predykatem — obie rzeczy muszą opisywać TEN SAM porządek,
 * więc powstają w jednym pliku. `NULLS LAST` piszemy JAWNIE w obu kierunkach:
 * PostgreSQL domyślnie daje `NULLS LAST` dla `ASC` i `NULLS FIRST` dla `DESC`, więc
 * poleganie na domyślnym zachowaniu znaczyłoby dwa różne porządki pod jedną nazwą.
 */
export function keysetOrderBy(
  columns: readonly [string, string],
  direction: KeysetDirection = 'desc',
): string {
  const dir = direction === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${columns[0]} ${dir} NULLS LAST, ${columns[1]} ${dir}`;
}

/**
 * Dokłada do filtra warunek „wiersze PO kursorze" w porządku `keysetOrderBy`.
 * Brak kursora = pierwsza strona, czyli żaden warunek.
 *
 * Kształt predykatu wynika wprost z `NULLS LAST`:
 *
 *  • klucz z wartością (`k1 != null`) — dalej są wiersze mniejsze (przy `DESC`),
 *    wiersze o równej wartości z mniejszym tie-breakerem ORAZ **wszystkie NULL-e**,
 *    bo te w tym porządku stoją na końcu:
 *    `(c1 IS NULL OR c1 < $k1 OR (c1 = $k1 AND c2 < $k2))`;
 *  • klucz NULL-owy — jesteśmy już w ogonie NULL-i, więc zostaje sam tie-breaker:
 *    `(c1 IS NULL AND c2 < $k2)`.
 *
 * `nullable: false` (kolumna `NOT NULL`, np. `flags.created_at`) zwęża pierwszy
 * przypadek do dwóch gałęzi — gałąź `IS NULL` byłaby wtedy martwa, a martwy warunek
 * w `WHERE` potrafi odciąć planerowi indeks.
 */
export function keysetPredicate(
  columns: readonly [string, string],
  key: CursorKey | null,
  filter: SqlFilter,
  options: { direction?: KeysetDirection; nullable?: boolean } = {},
): void {
  if (key == null) return;

  const [c1, c2] = columns;
  const cmp = (options.direction ?? 'desc') === 'asc' ? '>' : '<';
  const nullable = options.nullable ?? true;

  if (key.k1 == null) {
    if (!nullable) {
      throw new Error(`keyset: kursor z NULL-em na kolumnie ${c1} zadeklarowanej jako NOT NULL`);
    }
    filter.add(`(${c1} IS NULL AND ${c2} ${cmp} ?)`, key.k2);
    return;
  }

  const tail = nullable ? `${c1} IS NULL OR ` : '';
  filter.add(
    `(${tail}${c1} ${cmp} ? OR (${c1} = ? AND ${c2} ${cmp} ?))`,
    key.k1,
    key.k1,
    key.k2,
  );
}
