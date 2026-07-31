/**
 * UZ Aero — panel: filtry listy dni ↔ query string (moduł czysty).
 *
 * Testujemy REGUŁY, nie brzmienie napisów. Najważniejsza z nich nie jest widoczna
 * w typach: **jeden chip „Stan" tłumaczy się na TRZY różne parametry trasy**
 * (`status`, `flagged`, `exported`), a liczniki kafli muszą pytać serwer TYM SAMYM
 * zawężeniem, co lista — inaczej „2 dni z flagą" obok listy jednego samolotu byłoby
 * zdaniem o czymś innym niż to, na co człowiek patrzy.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DNI_FILTER,
  DNI_PAGE_LIMIT,
  filterFromParams,
  isNarrowed,
  paramsFromFilter,
  sessionCountQuery,
  sessionListQuery,
  type DniFilter,
} from './dniFilters';

const params = (query: string): URLSearchParams => new URLSearchParams(query);

describe('filterFromParams', () => {
  it('pusty adres daje filtr domyślny: bez zawężenia, najnowsze na górze', () => {
    expect(filterFromParams(params(''))).toEqual(DEFAULT_DNI_FILTER);
  });

  it('czyta pełny adres wklejony w rozmowie', () => {
    const filter = filterFromParams(
      params('od=2026-07-25&do=2026-07-31&samolot=SP-KLM&pilot=AWR&stan=flagged&operacja=skoki&sort=asc'),
    );

    expect(filter).toEqual({
      from: '2026-07-25',
      to: '2026-07-31',
      aircraftId: 'SP-KLM',
      pilotId: 'AWR',
      state: 'flagged',
      operation: 'skoki',
      sort: 'asc',
    });
  });

  it('wartości nieznane POMIJA zamiast odrzucać — adres z literówką pokazuje listę', () => {
    // Panel nadzoru nie ma prawa odpowiadać stroną błędu na przekręcony link.
    const filter = filterFromParams(
      params('stan=w-locie&operacja=lot-w-kosmos&sort=byle-jak&od=31-07-2026&do=wczoraj'),
    );

    expect(filter).toEqual(DEFAULT_DNI_FILTER);
  });

  it('puste i same-spacje identyfikatory znaczą BRAK filtra, nie filtr pustki', () => {
    const filter = filterFromParams(params('samolot=%20%20&pilot='));
    expect(filter.aircraftId).toBeNull();
    expect(filter.pilotId).toBeNull();
  });
});

describe('paramsFromFilter', () => {
  it('pomija wartości domyślne — adres pełnej listy to po prostu `#/dni`', () => {
    expect(paramsFromFilter(DEFAULT_DNI_FILTER)).toEqual({});
  });

  it('jest odwrotnością odczytu (obie strony na tym samym zestawie)', () => {
    const filter: DniFilter = {
      from: '2026-07-25',
      to: '2026-07-31',
      aircraftId: 'SP-KLM',
      pilotId: 'AWR',
      state: 'exported',
      operation: 'ferry',
      sort: 'asc',
    };

    expect(filterFromParams(new URLSearchParams(paramsFromFilter(filter)))).toEqual(filter);
  });
});

describe('sessionListQuery', () => {
  it('brak zawężenia to BRAK parametrów stanu, nie `status=all`', () => {
    const query = sessionListQuery(DEFAULT_DNI_FILTER);

    expect(query).toEqual({ sort: 'desc', limit: DNI_PAGE_LIMIT });
    expect(query).not.toHaveProperty('status');
    expect(query).not.toHaveProperty('flagged');
  });

  it('jeden chip stanu → właściwy parametr trasy, bo serwer ma na to trzy pola', () => {
    const of = (state: DniFilter['state']) =>
      sessionListQuery({ ...DEFAULT_DNI_FILTER, state });

    expect(of('open')).toMatchObject({ status: 'active' });
    expect(of('closed')).toMatchObject({ status: 'closed' });
    expect(of('flagged')).toMatchObject({ flagged: true });
    expect(of('exported')).toMatchObject({ exported: true });

    // Stany są WZAJEMNIE WYKLUCZAJĄCE się także w zapytaniu: chip „Z flagą" nie
    // dokłada `status`, bo dzień z flagą bywa i otwarty, i zamknięty.
    expect(of('flagged')).not.toHaveProperty('status');
  });

  it('daty jadą jako DZIEŃ, nie jako epoch — górną granicę domyka serwer', () => {
    const query = sessionListQuery({ ...DEFAULT_DNI_FILTER, from: '2026-07-25', to: '2026-07-31' });
    expect(query).toMatchObject({ from: '2026-07-25', to: '2026-07-31' });
  });

  it('nie wysyła kursora — pierwszą stronę pobiera się bez niego', () => {
    // Kursor jest parametrem STRONY, a nie filtra: dokłada go `useSessions`
    // z odpowiedzi poprzedniej strony. Gdyby wchodził tutaj, wpadłby też do klucza
    // cache'u i każdy powrót „wstecz" zaczynałby listę od nowa.
    expect(sessionListQuery(DEFAULT_DNI_FILTER)).not.toHaveProperty('cursor');
  });
});

describe('sessionCountQuery', () => {
  it('podmienia STAN, resztę zawężenia zostawia nietkniętą', () => {
    const filter: DniFilter = {
      ...DEFAULT_DNI_FILTER,
      aircraftId: 'SP-KLM',
      from: '2026-07-25',
      state: 'open',
    };

    const count = sessionCountQuery(filter, 'flagged');

    expect(count).toMatchObject({ aircraftId: 'SP-KLM', from: '2026-07-25', flagged: true });
    // Stan poprzedni ZNIKA — inaczej kafel liczyłby „dni otwarte z flagą".
    expect(count).not.toHaveProperty('status');
  });

  it('pyta o jeden wiersz, bo liczy się wyłącznie `total`', () => {
    // `limit: 0` odrzuciłaby trasa (`z.coerce.number().int().positive()`), a większy
    // limit ściągałby wiersze, których kafel i tak nie pokaże.
    expect(sessionCountQuery(DEFAULT_DNI_FILTER, 'open').limit).toBe(1);
  });
});

describe('isNarrowed', () => {
  it('rozróżnia „pusty rejestr" od „nic w tym filtrze"', () => {
    expect(isNarrowed(DEFAULT_DNI_FILTER)).toBe(false);
    expect(isNarrowed({ ...DEFAULT_DNI_FILTER, state: 'flagged' })).toBe(true);
    expect(isNarrowed({ ...DEFAULT_DNI_FILTER, aircraftId: 'SP-KLM' })).toBe(true);
    expect(isNarrowed({ ...DEFAULT_DNI_FILTER, from: '2026-07-25' })).toBe(true);
  });

  it('sam kierunek sortowania NIE jest zawężeniem', () => {
    // Odwrócenie porządku pokazuje te same dni. Uznanie tego za filtr kazałoby
    // pustemu ekranowi mówić „zdejmij zawężenie", gdy nie ma czego zdejmować.
    expect(isNarrowed({ ...DEFAULT_DNI_FILTER, sort: 'asc' })).toBe(false);
  });
});
