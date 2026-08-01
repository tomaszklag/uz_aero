/**
 * UZ Aero — panel: filtry floty ↔ query string.
 *
 * Filtr mieszka w URL-u, więc jego tłumaczenie w obie strony jest tym, co decyduje,
 * czy „wklej mi link do wyłączonych jednostek" w ogóle działa.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FLEET_FILTER,
  NEW_AIRCRAFT_SEGMENT,
  dayLink,
  daysHref,
  dayHref,
  filterFromParams,
  fleetListQuery,
  isNarrowed,
  newAircraftHref,
  paramsFromFilter,
  aircraftHref,
  type FleetFilter,
} from './fleetFilters';

const params = (query: string) => new URLSearchParams(query);

describe('query string → filtr', () => {
  it('pusty adres daje filtr domyślny', () => {
    expect(filterFromParams(params(''))).toEqual(DEFAULT_FLEET_FILTER);
  });

  it('czyta zakres i wyszukiwanie', () => {
    expect(filterFromParams(params('zakres=disabled&szukaj=AT-3'))).toEqual({
      scope: 'disabled',
      search: 'AT-3',
    });
  });

  it('wartość nieznana jest POMIJANA — adres z literówką pokazuje listę, nie błąd', () => {
    expect(filterFromParams(params('zakres=nie-ma-takiego')).scope).toBe('all');
  });

  it('puste wyszukiwanie znaczy „bez filtra", nie „szukaj pustego napisu"', () => {
    expect(filterFromParams(params('szukaj=%20%20')).search).toBeNull();
  });
});

describe('filtr → query string', () => {
  it('wartości domyślne POMIJAMY — adres pełnej listy to po prostu `#/flota`', () => {
    expect(paramsFromFilter(DEFAULT_FLEET_FILTER)).toEqual({});
  });

  it('jedzie tam i z powrotem bez straty', () => {
    const filter: FleetFilter = { scope: 'claimed', search: 'Caravan' };
    expect(filterFromParams(new URLSearchParams(paramsFromFilter(filter)))).toEqual(filter);
  });
});

describe('filtr → parametry trasy', () => {
  it('`all` nie wysyła żadnego zawężenia', () => {
    expect(fleetListQuery({ scope: 'all', search: null })).toEqual({});
  });

  it('stan służby jedzie jako `status`, a claim jako osobne pole', () => {
    expect(fleetListQuery({ scope: 'active', search: null })).toEqual({ status: 'active' });
    expect(fleetListQuery({ scope: 'disabled', search: null })).toEqual({ status: 'disabled' });
    // `claimed` NIE jest wartością `service_status` — to dwa niezależne warunki bazy
    // złożone dla człowieka w jedno pytanie „co jest z tym samolotem".
    expect(fleetListQuery({ scope: 'claimed', search: null })).toEqual({ claimed: 'true' });
  });

  it('chip pyta o jednostki zajęte, NIGDY o zaprzeczenie', () => {
    const query = fleetListQuery({ scope: 'claimed', search: null });
    expect(query.claimed).not.toBe('false');
  });

  it('wyszukiwanie jedzie jako `q`', () => {
    expect(fleetListQuery({ scope: 'all', search: 'SP-K' })).toEqual({ q: 'SP-K' });
  });
});

describe('zawężenie i adresy', () => {
  it('rozpoznaje, czy cokolwiek zawęża listę', () => {
    expect(isNarrowed(DEFAULT_FLEET_FILTER)).toBe(false);
    expect(isNarrowed({ scope: 'disabled', search: null })).toBe(true);
    expect(isNarrowed({ scope: 'all', search: 'x' })).toBe(true);
  });

  it('szuflada ZOSTAWIA zawężenie listy pod spodem', () => {
    expect(aircraftHref({ scope: 'disabled', search: null }, 'ac-1')).toBe(
      '/flota/ac-1?zakres=disabled',
    );
  });

  it('adres nowej jednostki to ten sam ekran z segmentem `nowy`', () => {
    expect(newAircraftHref(DEFAULT_FLEET_FILTER)).toBe(`/flota/${NEW_AIRCRAFT_SEGMENT}`);
  });

  it('identyfikator w adresie jest KODOWANY — id jest nieprzezroczyste', () => {
    expect(aircraftHref(DEFAULT_FLEET_FILTER, 'a/b c')).toBe('/flota/a%2Fb%20c');
  });

  it('link „Dni lotne" zawęża listę dni do tej jednostki', () => {
    expect(daysHref('ac-1')).toBe('/dni?samolot=ac-1');
  });

  it('adres karty dnia jest osobną trasą, nie parametrem listy', () => {
    expect(dayHref('sess-1')).toBe('/dni/sess-1');
    expect(dayHref('a/b')).toBe('/dni/a%2Fb');
  });
});

describe('przejście z wiersza floty do dni', () => {
  it('jednostka WOLNA też je ma — i to ona jest przypadkiem najczęstszym', () => {
    // Do 2026-08-01 przycisk pojawiał się wyłącznie przy otwartym claimie, mimo że
    // prowadził na listę zawężoną do samolotu. Skutek: z tabeli floty nie dało się
    // dojść do historii jednostki, która akurat stoi na płycie — czyli prawie zawsze.
    expect(dayLink('ac-1', null)).toEqual({ to: '/dni?samolot=ac-1', label: 'Dni lotne' });
  });

  it('jednostka ZAJĘTA celuje w kartę tego dnia — to jedyny konsument `sessionUuid`', () => {
    expect(dayLink('ac-1', 'sess-9')).toEqual({ to: '/dni/sess-9', label: 'Otwarty dzień' });
  });
});
