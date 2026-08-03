/**
 * UZ Aero (serwer) — kursor keyset: kodowanie i predykat „wiersze PO kursorze".
 *
 * Predykat musi opisywać DOKŁADNIE ten sam porządek, co `ORDER BY` — rozjazd tych dwóch
 * nie jest błędem, który da się zobaczyć: strona po prostu gubi albo dubluje wiersze,
 * a lista dalej wygląda sensownie. Dlatego oba powstają w jednym module i mają wspólny
 * test.
 */

import { describe, expect, it } from 'vitest';

import {
  decodeCursor,
  encodeCursor,
  keysetOrderBy,
  keysetPredicate,
  type CursorKey,
  type CursorShape,
} from '../src/infrastructure/pg/keyset.ts';
import { SqlFilter } from '../src/infrastructure/pg/sqlFilter.ts';

const KEY: readonly [string, string] = ['s.claim_time', 's.session_uuid'];

/** Kształt listy dni: `claim_time` (BIGINT, NULL-owalne) + `session_uuid` (TEXT). */
const DAYS: CursorShape = { k1: 'number', k1Nullable: true, k2: 'string', direction: 'desc' };

/** Kształt dziennika audytu: `created_at` (TIMESTAMPTZ NOT NULL) + `id` (BIGSERIAL). */
const AUDIT: CursorShape = {
  k1: 'timestamp',
  k1Nullable: false,
  k2: 'integer',
  direction: 'desc',
};

const shape = (over: Partial<CursorShape> = {}): CursorShape => ({ ...DAYS, ...over });

const b64 = (json: string): string => Buffer.from(json, 'utf8').toString('base64url');

/** Skrót: predykat złożony na świeżym filtrze → (WHERE, parametry). */
function predicate(
  key: CursorKey | null,
  options: Partial<CursorShape> = {},
): { where: string; params: unknown[] } {
  const filter = new SqlFilter();
  keysetPredicate(KEY, key, filter, shape(options));
  return { where: filter.where(), params: filter.params() };
}

describe('kursor', () => {
  it('koduje i odczytuje klucz w obie strony', () => {
    const key: CursorKey = { k1: 1_780_000_000_000, k2: 'sess-1' };
    expect(decodeCursor(encodeCursor(key, DAYS), DAYS)).toEqual(key);
  });

  it('klucz z NULL-em przeżywa podróż — to realny stan, nie przypadek brzegowy', () => {
    // Sesja bez `preflight_confirm` nie ma duty startu, więc kursor na granicy strony
    // potrafi mieć `k1: null`. Zgubienie tego przy dekodowaniu zatrzymałoby listę
    // dokładnie na ogonie NULL-i.
    expect(decodeCursor(encodeCursor({ k1: null, k2: 'sess-9' }, DAYS), DAYS)).toEqual({
      k1: null,
      k2: 'sess-9',
    });
  });

  it('nieczytelny kursor daje `null`, NIGDY wyjątek', () => {
    // Kursor przychodzi z zewnątrz — to 400 na trasie, nie 500 z serwera.
    expect(decodeCursor('to-nie-jest-base64-json', DAYS)).toBeNull();
    expect(decodeCursor(b64('{}'), DAYS)).toBeNull();
    expect(decodeCursor(b64('[1,2]'), DAYS)).toBeNull();
    expect(decodeCursor(b64('{"k1":1}'), DAYS)).toBeNull();
    expect(decodeCursor(b64('{"k1":{},"k2":"a"}'), DAYS)).toBeNull();
    expect(decodeCursor('', DAYS)).toBeNull();
  });

  it('kursor SPARSOWANY, ale niezgodny z typem kolumny, też daje `null`', () => {
    // To była realna luka: takie kursory są poprawnym JSON-em, więc przechodziły dalej
    // i wywracały się dopiero w Postgresie na porównaniu z BIGINT — administrator
    // dostawał 500 z treścią błędu SQL-a zamiast 400.
    expect(decodeCursor(b64('{"k1":"abc","k2":"sess-1","d":"desc"}'), DAYS)).toBeNull();
    expect(decodeCursor(b64('{"k1":0.5,"k2":"sess-1","d":"desc"}'), DAYS)).toBeNull();
    // 1e30 mieści się w `number`, ale nie w BIGINT — stąd `Number.isSafeInteger`.
    expect(decodeCursor(b64('{"k1":1e30,"k2":"sess-1","d":"desc"}'), DAYS)).toBeNull();

    // Symetrycznie dla kolumny tekstowej: liczba nie jest kluczem tekstowym.
    expect(decodeCursor(b64('{"k1":7,"k2":"sess-1","d":"desc"}'), shape({ k1: 'string' }))).toBeNull();
    expect(
      decodeCursor(b64('{"k1":"SP-ABC","k2":"sess-1","d":"desc"}'), shape({ k1: 'string' })),
    ).toEqual({ k1: 'SP-ABC', k2: 'sess-1' });
  });

  it('kolumna TIMESTAMPTZ przyjmuje WYŁĄCZNIE ISO 8601 UTC, nie dowolny napis', () => {
    // Dziennik audytu sortuje po `created_at`, więc kursor niesie stempel NAPISEM.
    // Sprawdzanie samego `typeof` przepuszczało tu cokolwiek — a Postgres odpowiadał
    // na to błędem składni daty, czyli 500 z wartości przysłanej przez klienta.
    expect(decodeCursor(b64('{"k1":"2026-06-22T14:19:02.000Z","k2":"41","d":"desc"}'), AUDIT)).toEqual(
      { k1: '2026-06-22T14:19:02.000Z', k2: '41' },
    );

    expect(decodeCursor(b64('{"k1":"wczoraj","k2":"41","d":"desc"}'), AUDIT)).toBeNull();
    expect(decodeCursor(b64('{"k1":"2026-06-22","k2":"41","d":"desc"}'), AUDIT)).toBeNull();
    expect(decodeCursor(b64('{"k1":1780000000000,"k2":"41","d":"desc"}'), AUDIT)).toBeNull();
    // Kształt się zgadza, ale takiej daty nie ma — w bazie skończyłoby się błędem.
    expect(decodeCursor(b64('{"k1":"2026-13-45T99:99:99Z","k2":"41","d":"desc"}'), AUDIT)).toBeNull();
  });

  it('`k1: null` na kolumnie NOT NULL jest ODRZUCANY, a nie przepuszczany do predykatu', () => {
    // Najgorszy wariant z trzech: `keysetPredicate` na takim kluczu RZUCA, więc kursor
    // przepuszczony tutaj zamieniał 400 na 500 — i to nie hipotetycznie, tylko dla
    // każdego, kto podmienił `k1` w adresie.
    expect(decodeCursor(b64('{"k1":null,"k2":"41","d":"desc"}'), AUDIT)).toBeNull();
    // Ta sama wartość na kolumnie NULL-owalnej jest poprawna — deklaracja wołającego
    // jest tu jedyną różnicą.
    expect(decodeCursor(b64('{"k1":null,"k2":"sess-9","d":"desc"}'), DAYS)).toEqual({
      k1: null,
      k2: 'sess-9',
    });
  });

  it('tie-breaker `BIGSERIAL` musi być liczbą — napis „abc" kończył się błędem 22P02', () => {
    expect(decodeCursor(b64('{"k1":"2026-06-22T14:19:02.000Z","k2":"abc","d":"desc"}'), AUDIT)).toBeNull();
    expect(decodeCursor(b64('{"k1":"2026-06-22T14:19:02.000Z","k2":41,"d":"desc"}'), AUDIT)).toBeNull();
    // Dziewiętnaście cyfr może wyjść poza `BIGINT` (błąd 22003), więc też odpada.
    expect(
      decodeCursor(b64('{"k1":"2026-06-22T14:19:02.000Z","k2":"9999999999999999999","d":"desc"}'), AUDIT),
    ).toBeNull();

    // Dla klucza TEKSTOWEGO ten sam napis jest w pełni poprawny — o typie tie-breakera
    // decyduje deklaracja wołającego, a nie zgadywanie po zawartości.
    expect(decodeCursor(b64('{"k1":1780000000000,"k2":"abc","d":"desc"}'), DAYS)).toEqual({
      k1: 1_780_000_000_000,
      k2: 'abc',
    });
  });

  it('KIERUNEK jest częścią kursora — kursor z `desc` nie działa przy `asc`', () => {
    // Kursor opisuje POZYCJĘ W PORZĄDKU, więc użyty w porządku odwrotnym opisuje coś
    // innego niż mówi: strona wychodzi wewnętrznie niespójna, a niespójna strona
    // wygląda jak dane, nie jak błąd. Stąd odrzucenie, czyli 400 na trasie.
    const desc = encodeCursor({ k1: 1_780_000_000_000, k2: 'sess-1' }, DAYS);

    expect(decodeCursor(desc, DAYS)).not.toBeNull();
    expect(decodeCursor(desc, shape({ direction: 'asc' }))).toBeNull();

    // Kursor bez kierunku (postać sprzed tej zmiany) też jest nieczytelny — udawanie,
    // że „pewnie desc", byłoby zgadywaniem w miejscu, w którym zgadywać nie wolno.
    expect(decodeCursor(b64('{"k1":1780000000000,"k2":"sess-1"}'), DAYS)).toBeNull();
  });
});

describe('porządek i predykat', () => {
  it('klucz NULL-owalny dostaje `NULLS LAST` JAWNIE w obu kierunkach', () => {
    // PostgreSQL domyślnie daje NULLS LAST dla ASC i NULLS FIRST dla DESC — poleganie
    // na domyślnym zachowaniu znaczyłoby dwa różne porządki pod jedną nazwą. Dla
    // `claim_time` (dzień bez preflightu nie ma duty startu) to nie jest teoria:
    // wiersze bez wartości raz stałyby na początku listy, raz na końcu.
    expect(keysetOrderBy(KEY, shape({ direction: 'desc' }))).toBe(
      'ORDER BY s.claim_time DESC NULLS LAST, s.session_uuid DESC',
    );
    expect(keysetOrderBy(KEY, shape({ direction: 'asc' }))).toBe(
      'ORDER BY s.claim_time ASC NULLS LAST, s.session_uuid ASC',
    );
  });

  it('klucz `NOT NULL` NIE dostaje `NULLS` — dopisek odbierałby indeks w jedną stronę', () => {
    // Dla kolumny bez NULL-i dopisek nie zmienia WYNIKU, ale planer dopasowuje porządek
    // SKŁADNIOWO: indeks `(x DESC, y DESC)` obsługuje `DESC, DESC` skanem w przód
    // i `ASC, ASC` skanem wstecz — czyli dokładnie zapisy DOMYŚLNE. `DESC NULLS LAST`
    // wyłamuje pierwszy, `ASC NULLS LAST` drugi. Ta pułapka wróciła trzy razy
    // (migracje 12, 16, 17), za każdym razem przesuwając wadę na drugi kierunek.
    const AUDIT_KEY: readonly [string, string] = ['a.created_at', 'a.id'];

    expect(keysetOrderBy(AUDIT_KEY, { ...AUDIT, direction: 'desc' })).toBe(
      'ORDER BY a.created_at DESC, a.id DESC',
    );
    expect(keysetOrderBy(AUDIT_KEY, { ...AUDIT, direction: 'asc' })).toBe(
      'ORDER BY a.created_at ASC, a.id ASC',
    );
  });

  it('brak kursora = pierwsza strona = żaden warunek', () => {
    expect(predicate(null)).toEqual({ where: '', params: [] });
  });

  it('klucz z wartością (DESC): mniejsze, remis po tie-breakerze ORAZ ogon NULL-i', () => {
    const { where, params } = predicate({ k1: 500, k2: 'sess-5' });

    expect(where).toBe(
      'WHERE (s.claim_time IS NULL OR s.claim_time < $1 OR (s.claim_time = $2 AND s.session_uuid < $3))',
    );
    expect(params).toEqual([500, 500, 'sess-5']);
  });

  it('klucz NULL-owy (DESC): jesteśmy w ogonie, zostaje sam tie-breaker', () => {
    // Bez tej gałęzi kursor na granicy „ostatni dzień z datą → pierwszy bez daty"
    // porównywałby `NULL < NULL`, czyli nie zwróciłby NICZEGO: lista kończyłaby się
    // w połowie i wyglądałaby na kompletną.
    const { where, params } = predicate({ k1: null, k2: 'sess-5' });

    expect(where).toBe('WHERE (s.claim_time IS NULL AND s.session_uuid < $1)');
    expect(params).toEqual(['sess-5']);
  });

  it('kierunek ASC odwraca porównania, zachowując kształt predykatu', () => {
    expect(predicate({ k1: 500, k2: 'sess-5' }, { direction: 'asc' }).where).toBe(
      'WHERE (s.claim_time IS NULL OR s.claim_time > $1 OR (s.claim_time = $2 AND s.session_uuid > $3))',
    );
    expect(predicate({ k1: null, k2: 'sess-5' }, { direction: 'asc' }).where).toBe(
      'WHERE (s.claim_time IS NULL AND s.session_uuid > $1)',
    );
  });

  it('kolumna NOT NULL dostaje predykat dwugałęziowy — martwy warunek odcina indeks', () => {
    expect(predicate({ k1: '2026-07-31', k2: '17' }, { k1Nullable: false }).where).toBe(
      'WHERE (s.claim_time < $1 OR (s.claim_time = $2 AND s.session_uuid < $3))',
    );
  });

  it('kursor z NULL-em na kolumnie zadeklarowanej jako NOT NULL rzuca', () => {
    // Sprzeczność wołającego z samym sobą — po stronie KODU, bo z drutu taki kursor
    // nie przejdzie (`decodeCursor` odrzuca go na tej samej deklaracji `k1Nullable`).
    // Cisza dałaby tu pustą stronę bez powodu.
    expect(() => predicate({ k1: null, k2: 'x' }, { k1Nullable: false })).toThrow(/NOT NULL/);
  });
});
