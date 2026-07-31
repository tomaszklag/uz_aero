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
} from '../src/infrastructure/pg/keyset.ts';
import { SqlFilter } from '../src/infrastructure/pg/sqlFilter.ts';

const KEY: readonly [string, string] = ['s.claim_time', 's.session_uuid'];

/** Skrót: predykat złożony na świeżym filtrze → (WHERE, parametry). */
function predicate(
  key: CursorKey | null,
  options: Parameters<typeof keysetPredicate>[3] = {},
): { where: string; params: unknown[] } {
  const filter = new SqlFilter();
  keysetPredicate(KEY, key, filter, options);
  return { where: filter.where(), params: filter.params() };
}

describe('kursor', () => {
  it('koduje i odczytuje klucz w obie strony', () => {
    const key: CursorKey = { k1: 1_780_000_000_000, k2: 'sess-1' };
    expect(decodeCursor(encodeCursor(key), 'number')).toEqual(key);
  });

  it('klucz z NULL-em przeżywa podróż — to realny stan, nie przypadek brzegowy', () => {
    // Sesja bez `preflight_confirm` nie ma duty startu, więc kursor na granicy strony
    // potrafi mieć `k1: null`. Zgubienie tego przy dekodowaniu zatrzymałoby listę
    // dokładnie na ogonie NULL-i.
    expect(decodeCursor(encodeCursor({ k1: null, k2: 'sess-9' }), 'number')).toEqual({
      k1: null,
      k2: 'sess-9',
    });
  });

  it('nieczytelny kursor daje `null`, NIGDY wyjątek', () => {
    // Kursor przychodzi z zewnątrz — to 400 na trasie, nie 500 z serwera.
    expect(decodeCursor('to-nie-jest-base64-json', 'number')).toBeNull();
    const b64 = (json: string): string => Buffer.from(json, 'utf8').toString('base64url');
    expect(decodeCursor(b64('{}'), 'number')).toBeNull();
    expect(decodeCursor(b64('[1,2]'), 'number')).toBeNull();
    expect(decodeCursor(b64('{"k1":1}'), 'number')).toBeNull();
    expect(decodeCursor(b64('{"k1":{},"k2":"a"}'), 'number')).toBeNull();
    expect(decodeCursor('', 'number')).toBeNull();
  });

  it('kursor SPARSOWANY, ale niezgodny z typem kolumny, też daje `null`', () => {
    // To była realna luka: takie kursory są poprawnym JSON-em, więc przechodziły dalej
    // i wywracały się dopiero w Postgresie na porównaniu z BIGINT — administrator
    // dostawał 500 z treścią błędu SQL-a zamiast 400.
    const b64 = (json: string): string => Buffer.from(json, 'utf8').toString('base64url');

    expect(decodeCursor(b64('{"k1":"abc","k2":"sess-1"}'), 'number')).toBeNull();
    expect(decodeCursor(b64('{"k1":0.5,"k2":"sess-1"}'), 'number')).toBeNull();
    // 1e30 mieści się w `number`, ale nie w BIGINT — stąd `Number.isSafeInteger`.
    expect(decodeCursor(b64('{"k1":1e30,"k2":"sess-1"}'), 'number')).toBeNull();

    // Symetrycznie dla kolumny tekstowej: liczba nie jest kluczem tekstowym.
    expect(decodeCursor(b64('{"k1":7,"k2":"sess-1"}'), 'string')).toBeNull();
    expect(decodeCursor(b64('{"k1":"SP-ABC","k2":"sess-1"}'), 'string')).toEqual({
      k1: 'SP-ABC',
      k2: 'sess-1',
    });
  });
});

describe('porządek i predykat', () => {
  it('`NULLS LAST` jest JAWNE w obu kierunkach', () => {
    // PostgreSQL domyślnie daje NULLS LAST dla ASC i NULLS FIRST dla DESC — poleganie
    // na domyślnym zachowaniu znaczyłoby dwa różne porządki pod jedną nazwą.
    expect(keysetOrderBy(KEY, 'desc')).toBe(
      'ORDER BY s.claim_time DESC NULLS LAST, s.session_uuid DESC',
    );
    expect(keysetOrderBy(KEY, 'asc')).toBe(
      'ORDER BY s.claim_time ASC NULLS LAST, s.session_uuid ASC',
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
    expect(predicate({ k1: '2026-07-31', k2: '17' }, { nullable: false }).where).toBe(
      'WHERE (s.claim_time < $1 OR (s.claim_time = $2 AND s.session_uuid < $3))',
    );
  });

  it('kursor z NULL-em na kolumnie zadeklarowanej jako NOT NULL rzuca', () => {
    // Sprzeczność wołającego z samym sobą: albo kolumna jest NULL-owalna, albo kursor
    // pochodzi z innego zapytania. Cisza dałaby tu pustą stronę bez powodu.
    expect(() => predicate({ k1: null, k2: 'x' }, { nullable: false })).toThrow(/NOT NULL/);
  });
});
