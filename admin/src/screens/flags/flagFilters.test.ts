/**
 * UZ Aero - panel: filtry skrzynki ↔ query string (moduł czysty).
 *
 * Reguła, której pilnujemy: filtr da się WKLEIĆ. Adres jest jedynym magazynem stanu
 * listy, więc round-trip musi być wierny, a adres nieczytelny nie może wywalić ekranu.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FLAG_FILTER,
  FLAG_PAGE_LIMIT,
  filterFromParams,
  flagListQuery,
  isNarrowed,
  paramsFromFilter,
  type FlagFilter,
} from './flagFilters';

const parse = (query: string): FlagFilter => filterFromParams(new URLSearchParams(query));

describe('filtr ↔ adres', () => {
  it('goły adres skrzynki znaczy „otwarte" - i ustawia to PANEL, nie serwer', () => {
    // Trasa listy celowo nie zawęża nic sama: domyślne zawężenie w API byłoby
    // niewidoczną regułą, przez którą liczniki przestałyby się zgadzać z listą.
    expect(parse('')).toEqual(DEFAULT_FLAG_FILTER);
    expect(flagListQuery(parse('')).status).toBe('open');
  });

  it('round-trip jest wierny dla każdego zawężenia', () => {
    const filter: FlagFilter = {
      status: 'resolved',
      type: 'mh_regression',
      sessionUuid: 'e881-04dc',
      from: '2026-07-24',
      to: '2026-07-31',
    };
    expect(filterFromParams(new URLSearchParams(paramsFromFilter(filter)))).toEqual(filter);
  });

  it('wartości domyślne NIE trafiają do adresu - link ma być do przepisania', () => {
    expect(paramsFromFilter(DEFAULT_FLAG_FILTER)).toEqual({});
  });

  it('adres z literówką pokazuje skrzynkę domyślną, a nie stronę błędu', () => {
    const filter = parse('status=cokolwiek&type=nie_ma_takiego&od=wczoraj&do=');
    expect(filter).toEqual(DEFAULT_FLAG_FILTER);
  });

  it('„wszystkie" znaczy BRAK filtra statusu, a nie trzeci status', () => {
    expect(flagListQuery(parse('status=all')).status).toBeUndefined();
  });

  it('zakres dat jedzie do serwera jako epoch ms i jest OBUSTRONNIE DOMKNIĘTY', () => {
    // Dzień UTC w adresie (czytelny dla człowieka), milisekundy w kontrakcie
    // (jedna jednostka czasu w całym panelu). Konwersja mieszka w jednym miejscu.
    const query = flagListQuery(parse('od=2026-07-24&do=2026-07-31'));
    expect(query.from).toBe(Date.UTC(2026, 6, 24, 0, 0, 0, 0));
    expect(query.to).toBe(Date.UTC(2026, 6, 31, 23, 59, 59, 999));
  });

  it('limit jest zawsze podany - obcięcie listy ma być widoczne w `total`', () => {
    expect(flagListQuery(DEFAULT_FLAG_FILTER).limit).toBe(FLAG_PAGE_LIMIT);
  });

  it('rozpoznaje zawężenie, bo pusta skrzynka mówi wtedy CO INNEGO', () => {
    expect(isNarrowed(DEFAULT_FLAG_FILTER)).toBe(false);
    // Sam status to nie zawężenie: „brak otwartych flag" jest wiadomością o stanie
    // klubu, a nie o zapytaniu.
    expect(isNarrowed({ ...DEFAULT_FLAG_FILTER, status: 'resolved' })).toBe(false);
    expect(isNarrowed({ ...DEFAULT_FLAG_FILTER, type: 'mh_gap' })).toBe(true);
    expect(isNarrowed({ ...DEFAULT_FLAG_FILTER, sessionUuid: 'x' })).toBe(true);
  });
});
