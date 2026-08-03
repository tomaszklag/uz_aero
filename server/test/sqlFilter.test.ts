/**
 * UZ Aero (serwer) — składanie `WHERE` z filtrów opcjonalnych.
 *
 * Ten moduł zastępuje query builder, więc jego testy muszą pokrywać to, czego builder
 * by nie pozwolił zepsuć: NUMERACJĘ parametrów. Przesunięcie `$n` o jeden nie jest
 * błędem typów ani składni — jest cichym porównaniem złej kolumny ze złą wartością,
 * które przechodzi każdy test „czy zwraca wiersze".
 */

import { describe, expect, it } from 'vitest';

import { SqlFilter } from '../src/infrastructure/pg/sqlFilter.ts';

describe('SqlFilter', () => {
  it('zero filtrów → pusty WHERE i pusta lista parametrów', () => {
    const filter = new SqlFilter();

    // `''`, a nie `WHERE TRUE`: pusty napis wkleja się w każde zapytanie bez wyjątku
    // po stronie wołającego.
    expect(filter.where()).toBe('');
    expect(filter.params()).toEqual([]);
    expect(filter.next()).toBe(1);
  });

  it('numeruje parametry w kolejności wywołań, przez wszystkie fragmenty', () => {
    const filter = new SqlFilter()
      .add('a = ?', 'A')
      .add('b BETWEEN ? AND ?', 10, 20)
      .add('c = ?', 'C');

    expect(filter.where()).toBe('WHERE a = $1 AND b BETWEEN $2 AND $3 AND c = $4');
    expect(filter.params()).toEqual(['A', 10, 20, 'C']);
  });

  it('filtr NIEUSTAWIONY jest pomijany — razem ze swoim miejscem w numeracji', () => {
    const filter = new SqlFilter()
      .addOptional('a = ?', undefined)
      .addOptional('b = ?', 'B')
      .addOptional('c = ?', undefined)
      .addOptional('d = ?', 'D');

    // Gdyby pominięty filtr „zużywał" numer, `d` porównywałoby się z wartością `B`.
    expect(filter.where()).toBe('WHERE b = $1 AND d = $2');
    expect(filter.params()).toEqual(['B', 'D']);
  });

  it('`null` jest WARTOŚCIĄ, `undefined` brakiem — to nie to samo', () => {
    // Rozróżnienie „nie ustawiono filtra" od „ustawiono na nic" jest jedynym powodem,
    // dla którego `addOptional` istnieje osobno od `add`.
    const nieustawiony = new SqlFilter().addOptional('dual_id = ?', undefined);
    expect(nieustawiony.where()).toBe('');

    const ustawionyNaNull = new SqlFilter().addOptional('dual_id = ?', null);
    expect(ustawionyNaNull.where()).toBe('WHERE dual_id = $1');
    expect(ustawionyNaNull.params()).toEqual([null]);
  });

  it('pusty napis i zero są wartościami, nie brakiem', () => {
    const filter = new SqlFilter().addOptional('a = ?', '').addOptional('b = ?', 0);

    expect(filter.where()).toBe('WHERE a = $1 AND b = $2');
    expect(filter.params()).toEqual(['', 0]);
  });

  it('warunek BEZ wartości (EXISTS) wchodzi do WHERE i nie rusza numeracji', () => {
    const filter = new SqlFilter()
      .add('EXISTS (SELECT 1 FROM flags f WHERE f.status = \'open\')')
      .add('a = ?', 'A');

    expect(filter.where()).toBe(
      "WHERE EXISTS (SELECT 1 FROM flags f WHERE f.status = 'open') AND a = $1",
    );
    expect(filter.params()).toEqual(['A']);
  });

  it('`bind` numeruje wartości spoza WHERE (LIMIT) w tej samej puli', () => {
    const filter = new SqlFilter().add('a = ?', 'A');
    const limit = filter.bind(50);

    expect(limit).toBe('$2');
    expect(filter.params()).toEqual(['A', 50]);

    // Kolejność w TEKŚCIE zapytania nie musi odpowiadać kolejności wywołań: numer
    // jest zapisany we fragmencie, a tablica parametrów indeksowana pozycyjnie.
    filter.add('b = ?', 'B');
    expect(filter.where()).toBe('WHERE a = $1 AND b = $3');
    expect(filter.params()).toEqual(['A', 50, 'B']);
  });

  it('niezgodna liczba miejsc i wartości RZUCA — to pomyłka autora, nie stan świata', () => {
    expect(() => new SqlFilter().add('a = ? AND b = ?', 'A')).toThrow(/2 miejsc/);
    expect(() => new SqlFilter().add('a = ?', 'A', 'B')).toThrow(/podano 2/);
  });
});
