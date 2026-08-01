/**
 * UZ Aero — panel: filtry listy kont ↔ query string.
 *
 * Testujemy obie strony tłumaczenia, bo to jest jedyne miejsce, w którym adres staje
 * się filtrem i z powrotem — a link do listy kont jest tu scenariuszem współpracy
 * („popatrz na te dwa nieaktywne konta"), nie ozdobą.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PILOCI_FILTER,
  PILOCI_PAGE_LIMIT,
  accountsAuditHref,
  filterFromParams,
  isNarrowed,
  kontoHref,
  noweKontoHref,
  paramsFromFilter,
  pilociHref,
  pilotListQuery,
  type PilociFilter,
} from './pilociFilters';

const params = (query: string): URLSearchParams => new URLSearchParams(query);

describe('adres → filtr', () => {
  it('pusty adres daje filtr domyślny: wszystkie konta, alfabetycznie', () => {
    expect(filterFromParams(params(''))).toEqual(DEFAULT_PILOCI_FILTER);
  });

  it('czyta zakres, wyszukiwanie i kierunek', () => {
    expect(filterFromParams(params('stan=panel&szukaj=wrzosek&sort=desc'))).toEqual({
      scope: 'panel',
      search: 'wrzosek',
      sort: 'desc',
    });
  });

  it('nieznana wartość jest POMIJANA — adres z literówką pokazuje pełną listę', () => {
    expect(filterFromParams(params('stan=nieistnieje&sort=byle'))).toEqual(
      DEFAULT_PILOCI_FILTER,
    );
  });

  it('wyszukiwanie z samych spacji to brak wyszukiwania', () => {
    expect(filterFromParams(params('szukaj=%20%20')).search).toBeNull();
  });
});

describe('filtr → adres', () => {
  it('wartości domyślne POMIJAMY — pełna lista to po prostu `/piloci`', () => {
    expect(paramsFromFilter(DEFAULT_PILOCI_FILTER)).toEqual({});
    expect(pilociHref(DEFAULT_PILOCI_FILTER)).toBe('/piloci');
  });

  it('podróż w obie strony zachowuje filtr', () => {
    const filter: PilociFilter = { scope: 'inactive', search: 'MDB', sort: 'desc' };
    expect(filterFromParams(new URLSearchParams(paramsFromFilter(filter)))).toEqual(filter);
  });

  it('adres szuflady NIESIE zawężenie listy pod spodem', () => {
    const filter: PilociFilter = { scope: 'panel', search: null, sort: 'asc' };
    expect(kontoHref(filter, 'abc-123')).toBe('/piloci/abc-123?stan=panel');
    // Wariant „reset hasła" z mockupu A06a to ta sama szuflada z innym wejściem.
    expect(kontoHref(filter, 'abc-123', 'haslo')).toBe('/piloci/abc-123?stan=panel&akcja=haslo');
    expect(noweKontoHref(DEFAULT_PILOCI_FILTER)).toBe('/piloci/nowe');
  });
});

describe('link „Historia zmian"', () => {
  it('prowadzi do dziennika zawężonego do obiektów typu `pilot`', () => {
    // Nie na surową listę wszystkiego: to jest odesłanie po igłę, a przycisk obiecuje
    // historię KONT.
    expect(accountsAuditHref()).toBe('/audyt?typ=pilot');
  });
});

describe('filtr → parametry trasy', () => {
  it('„wszyscy" nie wysyła żadnego zawężenia', () => {
    expect(pilotListQuery(DEFAULT_PILOCI_FILTER)).toEqual({
      sort: 'asc',
      limit: PILOCI_PAGE_LIMIT,
    });
  });

  it('aktywni i nieaktywni jadą jako `active`, nie jako dwa różne parametry', () => {
    expect(pilotListQuery({ ...DEFAULT_PILOCI_FILTER, scope: 'active' })).toMatchObject({
      active: 'true',
    });
    expect(pilotListQuery({ ...DEFAULT_PILOCI_FILTER, scope: 'inactive' })).toMatchObject({
      active: 'false',
    });
  });

  it('„z rolą panelu" to DWIE role naraz — inaczej chip kłamałby o połowie kont', () => {
    expect(pilotListQuery({ ...DEFAULT_PILOCI_FILTER, scope: 'panel' })).toMatchObject({
      role: ['admin', 'training_lead'],
    });
  });

  it('wyszukiwanie jedzie jako `q`', () => {
    expect(pilotListQuery({ ...DEFAULT_PILOCI_FILTER, search: 'kza' })).toMatchObject({
      q: 'kza',
    });
  });
});

describe('czy filtr zawęża', () => {
  it('domyślny nie zawęża', () => {
    expect(isNarrowed(DEFAULT_PILOCI_FILTER)).toBe(false);
  });

  it('sam kierunek sortowania to nie zawężenie — lista ma tyle samo pozycji', () => {
    expect(isNarrowed({ ...DEFAULT_PILOCI_FILTER, sort: 'desc' })).toBe(false);
  });

  it('zakres i wyszukiwanie zawężają', () => {
    expect(isNarrowed({ ...DEFAULT_PILOCI_FILTER, scope: 'inactive' })).toBe(true);
    expect(isNarrowed({ ...DEFAULT_PILOCI_FILTER, search: 'x' })).toBe(true);
  });
});
