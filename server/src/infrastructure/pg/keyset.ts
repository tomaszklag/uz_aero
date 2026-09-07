/**
 * UZ Aero (serwer) - paginacja KEYSET (kursorowa), nigdy `OFFSET`.
 *
 * **Powód jest operacyjny, nie estetyczny.** Tabele, po których chodzi panel, rosną
 * W TRAKCIE przeglądania - telefony dosyłają outboxy, a serwer odświeża projekcje.
 * `OFFSET 500` na rosnącej tabeli GUBI wiersze (nowy wiersz na początku przesuwa
 * resztę o jeden) i DUBLUJE inne przy sortowaniu malejącym. Administrator szukający
 * konkretnego dnia mógłby nie zobaczyć akurat tego, którego szuka - najgorszy możliwy
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
 * Druga składowa MUSI być unikalna w obrębie zapytania (uuid, id) - bez niej wiersze
 * o równej wartości pierwszej kolumny mogłyby wypaść z porządku i zniknąć między
 * stronami. To jest cały powód, dla którego kursor jest parą, a nie liczbą.
 */
export interface CursorKey {
  /** `null` = kolumna wiodąca jest NULL-owalna i ten wiersz miał w niej NULL. */
  k1: string | number | null;
  k2: string;
}

/** Kierunek porządku - ten sam dla obu kolumn klucza. */
export type KeysetDirection = 'asc' | 'desc';

/**
 * Typ kolumny wiodącej - deklarowany przez WOŁAJĄCEGO, bo tylko on go zna:
 *
 *  • `number`    - kolumna liczbowa (`BIGINT` z epoką w ms, `INTEGER`);
 *  • `timestamp` - `TIMESTAMPTZ`; na drucie ISO 8601 UTC, czyli NAPIS o ściśle
 *    określonym kształcie, a nie dowolny tekst;
 *  • `string`    - kolumna tekstowa, w której każdy napis jest legalną wartością.
 */
export type CursorK1Type = 'number' | 'timestamp' | 'string';

/**
 * Typ tie-breakera. `integer` obsługuje `BIGSERIAL`/`INTEGER`, które na drucie jadą
 * NAPISEM (sterownik oddaje `int8` napisem, a JSON nie ma typu całkowitoliczbowego
 * poza `number`) - więc sam `typeof === 'string'` nic o nich nie mówi.
 */
export type CursorK2Type = 'string' | 'integer';

/**
 * KSZTAŁT kursora tak, jak deklaruje go zapytanie, które go wydaje.
 *
 * Jeden obiekt na zapytanie, bo wszystkie cztery pola opisują TEN SAM porządek:
 * dekodowanie musi odrzucić kursor niepasujący do kolumn, a predykat musi zbudować
 * warunek dla tych samych kolumn i tego samego kierunku. Rozdzielenie tych deklaracji
 * na dwa wywołania było prostą drogą do rozjazdu - a rozjazd tutaj nie jest błędem,
 * który widać: strona po prostu gubi albo dubluje wiersze.
 */
export interface CursorShape {
  k1: CursorK1Type;
  /**
   * `false` = kolumna wiodąca jest `NOT NULL`. Kursor z `k1: null` jest wtedy
   * ODRZUCANY, bo pochodzi z innego zapytania - a przepuszczony wywołałby wyjątek
   * w `keysetPredicate`, czyli 500 z wartości przysłanej przez klienta.
   */
  k1Nullable: boolean;
  k2: CursorK2Type;
  /**
   * Kierunek, w którym kursor został WYDANY. Jedzie w kursorze i jest sprawdzany przy
   * odczycie: `?sort=asc` z kursorem wydanym dla `desc` opisywałby pozycję w innym
   * porządku, więc strona byłaby wewnętrznie niespójna - a niespójna strona wygląda
   * jak dane, nie jak błąd. Stąd 400.
   */
  direction: KeysetDirection;
}

/** Postać kursora na drucie. `d` = kierunek porządku, dla którego go wydano. */
interface CursorWire {
  k1: string | number | null;
  k2: string;
  d: KeysetDirection;
}

export function encodeCursor(key: CursorKey, shape: CursorShape): string {
  const wire: CursorWire = { k1: key.k1, k2: key.k2, d: shape.direction };
  return Buffer.from(JSON.stringify(wire), 'utf8').toString('base64url');
}

/**
 * ISO 8601 UTC dokładnie w postaci, którą produkuje `Date.prototype.toISOString` -
 * bo to jedyny producent kursorów czasowych w tym repo. Dopuszczenie „czegokolwiek,
 * co Postgres zrozumie" oddałoby parsowanie daty bazie, czyli oddałoby jej też błąd
 * (`22007`) w postaci 500.
 */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Do 18 cyfr, i to nie jest ostrożność na wyrost: 19-cyfrowa liczba może przekroczyć
 * zakres `BIGINT`, a Postgres odpowiada wtedy `22003` - czyli znowu 500 z wartości,
 * którą przysłał klient. Osiemnaście cyfr mieści się w `int8` zawsze.
 */
const INTEGER = /^-?\d{1,18}$/;

function isK1(value: unknown, type: CursorK1Type): value is string | number {
  switch (type) {
    case 'number':
      // `1e30` mieści się w `number`, ale nie w `BIGINT` - stąd `isSafeInteger`,
      // a nie samo `typeof`.
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'timestamp':
      // Kształt ORAZ sensowność: `2026-13-45T99:99:99Z` przechodzi regex, ale nie
      // jest datą i w bazie skończyłby się błędem.
      return typeof value === 'string' && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));
    case 'string':
      return typeof value === 'string';
  }
}

function isK2(value: unknown, type: CursorK2Type): value is string {
  if (typeof value !== 'string') return false;
  return type === 'string' || INTEGER.test(value);
}

/**
 * `null` = kursor nieczytelny. Zepsuty kursor NIE JEST błędem serwera: to wartość
 * z zewnątrz, więc trasa odpowiada 400, a nie 500 - dlatego ta funkcja nigdy nie rzuca.
 *
 * ══ CO DOKŁADNIE JEST SPRAWDZANE (i dlaczego wszystko naraz) ══
 * Samo „czy da się sparsować" NIE WYSTARCZA i była to realna, dwukrotnie powtórzona
 * luka: kursor z `k1: "abc"`, `k1: 0.5`, `k1: null` na kolumnie `NOT NULL` albo
 * `k2: "abc"` na `BIGSERIAL` jest poprawnym JSON-em, przechodził dalej i wywracał się
 * dopiero w Postgresie - a wtedy administrator dostawał 500 z treścią błędu SQL-a
 * zamiast 400. Dlatego walidacja jest KOMPLETNA po tej stronie i obejmuje:
 *
 *  1. **typ `k1`** względem typu kolumny wiodącej (liczba całkowita w bezpiecznym
 *     zakresie / ISO 8601 UTC / dowolny napis);
 *  2. **`k1: null`** - dopuszczalne WYŁĄCZNIE dla kolumny NULL-owalnej; na kolumnie
 *     `NOT NULL` `keysetPredicate` rzuca, więc przepuszczenie tego tutaj byłoby
 *     zamianą 400 na 500;
 *  3. **typ `k2`** - tie-breaker `BIGSERIAL` jedzie napisem, więc `typeof` o nim nic
 *     nie mówi; napis niebędący liczbą kończył się w bazie błędem `22P02`;
 *  4. **kierunek** - kursor wydany dla `desc` użyty przy `?sort=asc` opisuje pozycję
 *     w innym porządku.
 *
 * Żadna wartość z kursora nie ma prawa dotrzeć do Postgresa niesprawdzona - i to jest
 * jedyne zdanie, które trzeba tu utrzymać.
 */
export function decodeCursor(raw: string, shape: CursorShape): CursorKey | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (parsed == null || typeof parsed !== 'object') return null;

    const { k1, k2, d } = parsed as { k1?: unknown; k2?: unknown; d?: unknown };

    if (d !== shape.direction) return null;
    if (!isK2(k2, shape.k2)) return null;

    if (k1 === null) return shape.k1Nullable ? { k1: null, k2 } : null;
    return isK1(k1, shape.k1) ? { k1, k2 } : null;
  } catch {
    return null;
  }
}

/**
 * `ORDER BY` zgodny z predykatem - obie rzeczy muszą opisywać TEN SAM porządek,
 * więc powstają w jednym pliku.
 *
 * ══ `NULLS LAST` WYŁĄCZNIE DLA KLUCZA NULLOWALNEGO - I TO NIE JEST DROBIAZG ══
 * PostgreSQL domyślnie daje `NULLS LAST` dla `ASC` i `NULLS FIRST` dla `DESC`, więc
 * dla kolumny, która NAPRAWDĘ bywa `NULL` (`sessions.claim_time` - dzień bez preflightu),
 * dopisek jest konieczny: bez niego jedna nazwa opisywałaby dwa różne porządki, a wiersze
 * bez wartości raz stałyby na początku listy, raz na końcu.
 *
 * Dla kolumny `NOT NULL` ten sam dopisek nie znaczy NIC dla wyniku, a **odbiera indeks
 * w jednym z dwóch kierunków** - bo planer dopasowuje porządek SKŁADNIOWO i o `NOT NULL`
 * nie wnioskuje. Indeks `(x DESC, y DESC)` obsługuje wtedy:
 *
 *  • skanem w przód - `ORDER BY x DESC, y DESC` (czyli `DESC NULLS FIRST`);
 *  • skanem wstecz  - `ORDER BY x ASC,  y ASC`  (czyli `ASC NULLS LAST`),
 *
 * a to są dokładnie zapisy DOMYŚLNE. Dopisanie `NULLS LAST` do `DESC` wyłamuje pierwszy
 * z nich, dopisanie go do `ASC` - drugi. Ta pułapka wróciła w tym projekcie trzy razy
 * (migracje 12, 16 i 17): naprawa jednego kierunku przesuwała wadę na drugi, bo indeks
 * pod `DESC NULLS LAST` przestaje pasować do `ASC NULLS LAST` skanowany wstecz.
 *
 * Stąd reguła: **`NULLS` emitujemy tylko wtedy, gdy klucz faktycznie bywa `NULL`.**
 * Kształt kursora i tak niesie tę wiedzę (`k1Nullable`), więc źródło jest jedno.
 */
export function keysetOrderBy(
  columns: readonly [string, string],
  shape: Pick<CursorShape, 'direction' | 'k1Nullable'>,
): string {
  const dir = shape.direction === 'asc' ? 'ASC' : 'DESC';
  const nulls = shape.k1Nullable ? ' NULLS LAST' : '';
  return `ORDER BY ${columns[0]} ${dir}${nulls}, ${columns[1]} ${dir}`;
}

/**
 * Dokłada do filtra warunek „wiersze PO kursorze" w porządku `keysetOrderBy`.
 * Brak kursora = pierwsza strona, czyli żaden warunek.
 *
 * Kształt predykatu wynika wprost z `NULLS LAST`:
 *
 *  • klucz z wartością (`k1 != null`) - dalej są wiersze mniejsze (przy `DESC`),
 *    wiersze o równej wartości z mniejszym tie-breakerem ORAZ **wszystkie NULL-e**,
 *    bo te w tym porządku stoją na końcu:
 *    `(c1 IS NULL OR c1 < $k1 OR (c1 = $k1 AND c2 < $k2))`;
 *  • klucz NULL-owy - jesteśmy już w ogonie NULL-i, więc zostaje sam tie-breaker:
 *    `(c1 IS NULL AND c2 < $k2)`.
 *
 * `k1Nullable: false` (kolumna `NOT NULL`, np. `admin_audit.created_at`) zwęża pierwszy
 * przypadek do dwóch gałęzi - gałąź `IS NULL` byłaby wtedy martwa, a martwy warunek
 * w `WHERE` potrafi odciąć planerowi indeks. Ta sama deklaracja zdejmuje wtedy `NULLS
 * LAST` z `ORDER BY` (patrz `keysetOrderBy`), więc obie strony dalej opisują JEDEN
 * porządek: bez NULL-i „ogon NULL-i" po prostu nie istnieje.
 *
 * Ten sam obiekt `shape` jedzie do `decodeCursor`, więc deklaracja kształtu klucza jest
 * w zapytaniu JEDNA - wyjątek niżej może więc powstać wyłącznie z pomyłki programisty
 * (kursor złożony ręcznie), nigdy z wartości przysłanej przez klienta.
 */
export function keysetPredicate(
  columns: readonly [string, string],
  key: CursorKey | null,
  filter: SqlFilter,
  shape: Pick<CursorShape, 'direction' | 'k1Nullable'>,
): void {
  if (key == null) return;

  const [c1, c2] = columns;
  const cmp = shape.direction === 'asc' ? '>' : '<';

  if (key.k1 == null) {
    if (!shape.k1Nullable) {
      throw new Error(`keyset: kursor z NULL-em na kolumnie ${c1} zadeklarowanej jako NOT NULL`);
    }
    filter.add(`(${c1} IS NULL AND ${c2} ${cmp} ?)`, key.k2);
    return;
  }

  const tail = shape.k1Nullable ? `${c1} IS NULL OR ` : '';
  filter.add(
    `(${tail}${c1} ${cmp} ? OR (${c1} = ? AND ${c2} ${cmp} ?))`,
    key.k1,
    key.k1,
    key.k2,
  );
}
