/**
 * UZ Aero — panel: filtry monitora eksportu ↔ query string.
 *
 * Filtr mieszka w URL-u, więc obie strony tłumaczenia muszą być odwracalne — a jedyne
 * zawężenie, którego serwer NIE ZNA (`revised`), nie ma prawa do niego pojechać.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EXPORTS_FILTER,
  EXPORTS_PAGE_LIMIT,
  exportsHref,
  exportListQuery,
  filterFromParams,
  isNarrowed,
  paramsFromFilter,
  type ExportsFilter,
} from './exportsFilters';

const params = (query: string) => new URLSearchParams(query);

describe('filtry monitora eksportu', () => {
  it('pusty adres daje filtr domyślny — bez ukrytego zakresu dat', () => {
    // Mockup ma w pasku `?dni=7`, ale ukryte zawężenie sprawiłoby, że liczniki i pusta
    // lista mówią o czymś, czego nie widać w adresie.
    expect(filterFromParams(params(''))).toEqual(DEFAULT_EXPORTS_FILTER);
    expect(isNarrowed(DEFAULT_EXPORTS_FILTER)).toBe(false);
  });

  it('czyta zakres, samolot, wyszukiwanie i chip stanu', () => {
    const filter = filterFromParams(
      params('od=2026-07-25&do=2026-07-31&samolot=SP-AXA&szukaj=abc&stan=blocked'),
    );

    expect(filter).toEqual({
      from: '2026-07-25',
      to: '2026-07-31',
      aircraftId: 'SP-AXA',
      search: 'abc',
      scope: 'blocked',
    });
    expect(isNarrowed(filter)).toBe(true);
  });

  it('wartości nieczytelne POMIJA zamiast odrzucać — adres z literówką ma działać', () => {
    const filter = filterFromParams(params('od=wczoraj&stan=zielony&szukaj=%20%20'));

    expect(filter.from).toBeNull();
    expect(filter.scope).toBe('all');
    expect(filter.search).toBeNull();
  });

  it('jest odwracalny, a wartości domyślne nie trafiają do adresu', () => {
    const filter: ExportsFilter = {
      from: '2026-07-25',
      to: null,
      aircraftId: null,
      search: 'SP-KLM',
      scope: 'missing',
    };

    expect(paramsFromFilter(filter)).toEqual({
      od: '2026-07-25',
      szukaj: 'SP-KLM',
      stan: 'missing',
    });
    expect(filterFromParams(params(new URLSearchParams(paramsFromFilter(filter)).toString()))).toEqual(
      filter,
    );
    // Adres pełnej listy zostaje czytelny.
    expect(paramsFromFilter(DEFAULT_EXPORTS_FILTER)).toEqual({});
  });

  it('do trasy jedzie `state`, ale NIGDY `revised` — serwer takiego stanu nie zna', () => {
    // `revised` nie jest stanem, tylko wymiarem PRZECINAJĄCYM stany: zawęża po samym
    // numerze rewizji (`> 1`), niezależnie od tego, co dziś leży w arkuszu. Wysłanie go
    // jako `?state=` skończyłoby się czterysetką, więc pytamy o CAŁY zakres (bez `state`)
    // i odsiewamy rewizję 1 na wierszach — dokładnie tak, jak serwer liczy `revised`.
    const limit = { limit: EXPORTS_PAGE_LIMIT };
    expect(exportListQuery({ ...DEFAULT_EXPORTS_FILTER, scope: 'revised' })).toEqual(limit);
    expect(exportListQuery({ ...DEFAULT_EXPORTS_FILTER, scope: 'blocked' })).toEqual({
      ...limit,
      state: 'blocked',
    });
    expect(exportListQuery(DEFAULT_EXPORTS_FILTER)).toEqual(limit);
  });

  it('ZAWSZE wysyła limit — bezpiecznik ma być widoczny po obu stronach', () => {
    // Do 2026-08-01 `EXPORTS_PAGE_LIMIT` nie było używane NIGDZIE, a jego docblock
    // obiecywał komunikat, którego na ekranie nie było. Stała bez użycia i obietnica
    // bez pokrycia to jedna wada, nie dwie.
    for (const scope of ['all', 'revised', 'missing'] as const) {
      expect(exportListQuery({ ...DEFAULT_EXPORTS_FILTER, scope }).limit).toBe(
        EXPORTS_PAGE_LIMIT,
      );
    }
  });

  it('przepisuje zakres i wyszukiwanie na parametry trasy', () => {
    expect(
      exportListQuery({
        from: '2026-07-25',
        to: '2026-07-31',
        aircraftId: 'SP-AXA',
        search: 'klm',
        scope: 'all',
      }),
    ).toEqual({
      from: '2026-07-25',
      to: '2026-07-31',
      aircraftId: 'SP-AXA',
      q: 'klm',
      limit: EXPORTS_PAGE_LIMIT,
    });
  });

  it('buduje adres z zaznaczonym wierszem, zachowując zawężenie', () => {
    const filter: ExportsFilter = { ...DEFAULT_EXPORTS_FILTER, scope: 'missing' };

    expect(exportsHref(filter)).toBe('/eksporty?stan=missing');
    expect(exportsHref(filter, 'sess-1')).toBe('/eksporty/sess-1?stan=missing');
    expect(exportsHref(DEFAULT_EXPORTS_FILTER, 'sess-1')).toBe('/eksporty/sess-1');
  });
});
