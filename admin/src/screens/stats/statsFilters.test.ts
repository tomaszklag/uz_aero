/**
 * UZ Aero — panel: filtry statystyk ↔ URL.
 *
 * Filtr mieszka w adresie (`?od=…&do=…&ujecie=…`), więc obie strony tłumaczenia
 * muszą być odwracalne — a wpis nieczytelny ma dawać raport DOMYŚLNY, nie stronę
 * błędu. Presety liczą się od DZIŚ zegara SERWERA (`report.at`).
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STATS_FILTER,
  filterFromParams,
  isPresetActive,
  paramsFromFilter,
  statsPresets,
  statsQuery,
} from './statsFilters';

describe('filterFromParams', () => {
  it('czyta adres z paska mockupu: od, do i ujęcie po polsku', () => {
    const filter = filterFromParams(
      new URLSearchParams('od=2026-07-01&do=2026-07-30&ujecie=operacja'),
    );
    expect(filter).toEqual({ from: '2026-07-01', to: '2026-07-30', view: 'operation' });
  });

  it('brak parametrów = zakres DOMYŚLNY serwera i ujęcie per samolot', () => {
    expect(filterFromParams(new URLSearchParams(''))).toEqual(DEFAULT_STATS_FILTER);
  });

  it('wartości nieczytelne POMIJA — adres z literówką pokazuje raport, nie błąd', () => {
    const filter = filterFromParams(new URLSearchParams('od=wczoraj&ujecie=kosmos'));
    expect(filter).toEqual(DEFAULT_STATS_FILTER);
  });
});

describe('paramsFromFilter', () => {
  it('wartości domyślne pomija — pełny raport to czyste `#/statystyki`', () => {
    expect(paramsFromFilter(DEFAULT_STATS_FILTER)).toEqual({});
  });

  it('round-trip: filtr → adres → filtr wraca bez strat', () => {
    const filter = { from: '2026-07-01', to: '2026-07-30', view: 'pilot' as const };
    const params = new URLSearchParams(paramsFromFilter(filter));
    expect(filterFromParams(params)).toEqual(filter);
  });
});

describe('statsQuery', () => {
  it('do serwera jadą WYŁĄCZNIE daty — ujęcie jest sprawą ekranu, nie zapytania', () => {
    expect(statsQuery({ from: '2026-07-01', to: '2026-07-30', view: 'pilot' })).toEqual({
      from: '2026-07-01',
      to: '2026-07-30',
    });
    expect(statsQuery(DEFAULT_STATS_FILTER)).toEqual({});
  });
});

describe('statsPresets', () => {
  // Piątek 31 lipca 2026 — zegar SERWERA z odpowiedzi, nie przeglądarki.
  const AT = '2026-07-31T14:22:07.000Z';

  it('tydzień od poniedziałku, poprzedni miesiąc w całości, rok od 1 stycznia', () => {
    const presets = statsPresets(AT);
    expect(presets).toEqual([
      { key: 'week', label: 'Ten tydzień', from: '2026-07-27', to: '2026-07-31' },
      { key: 'previous_month', label: 'Poprzedni miesiąc', from: '2026-06-01', to: '2026-06-30' },
      { key: 'year_to_date', label: 'Rok do dziś', from: '2026-01-01', to: '2026-07-31' },
    ]);
  });

  it('niedziela nie przewija tygodnia do przodu (`getUTCDay` daje wtedy 0)', () => {
    const [week] = statsPresets('2026-08-02T08:00:00.000Z');
    expect(week).toMatchObject({ from: '2026-07-27', to: '2026-08-02' });
  });

  it('styczeń: poprzedni miesiąc to grudzień POPRZEDNIEGO roku', () => {
    const [, previousMonth] = statsPresets('2026-01-15T08:00:00.000Z');
    expect(previousMonth).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('preset jest aktywny tylko przy DOKŁADNEJ równości obu granic', () => {
    const [week] = statsPresets(AT);
    expect(isPresetActive({ from: week!.from, to: week!.to, view: 'aircraft' }, week!)).toBe(true);
    expect(isPresetActive({ from: week!.from, to: null, view: 'aircraft' }, week!)).toBe(false);
  });
});
