/**
 * UZ Aero — panel: filtry rejestru zdarzeń ↔ query string (`A04`).
 *
 * Adres tego ekranu jest produktem, a nie szczegółem implementacji: `ANALIZA` §3
 * nazywa „gdzie jest zdarzenie uuid=…" podstawowym scenariuszem współpracy, a karta
 * dnia i pulpit prowadzą tu z gotowym zawężeniem. Dlatego test sprawdza obie strony
 * tłumaczenia — a przy tym dwa alfabety naraz: adres EKRANU jest po polsku, a żądanie
 * do SERWERA po angielsku, i rozjazd między nimi daje listę bez zawężenia, która
 * wygląda zupełnie poprawnie.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EVENTS_FILTER,
  EVENTS_PAGE_LIMIT,
  eventHref,
  eventsHref,
  eventsListQuery,
  filterFromParams,
  isNarrowed,
  isUuidLookup,
  paramsFromFilter,
  sessionEventsHref,
  type EventsFilter,
} from './eventsFilters';

const parse = (query: string): EventsFilter => filterFromParams(new URLSearchParams(query));

describe('filtry rejestru: adres → filtr', () => {
  it('pusty adres daje filtr domyślny — bez ukrytego zawężenia do ostatniego tygodnia', () => {
    // Domyślny zakres dat sprawiłby, że kafle i pusta lista mówiłyby o czymś, czego
    // nie widać w adresie — a ten ekran istnieje po to, żeby adres dało się wkleić.
    expect(parse('')).toEqual(DEFAULT_EVENTS_FILTER);
    expect(isNarrowed(DEFAULT_EVENTS_FILTER)).toBe(false);
  });

  it('czyta komplet zawężeń z kluczy PO POLSKU', () => {
    expect(
      parse('uuid=ev-1&sesja=s-1&samolot=SP-AXA&pilot=KRZ&urzadzenie=Pixel&typ=takeoff&od=2026-07-30&do=2026-07-31&sort=asc'),
    ).toEqual({
      uuid: 'ev-1',
      sessionUuid: 's-1',
      aircraftId: 'SP-AXA',
      pilotId: 'KRZ',
      sourceDevice: 'Pixel',
      type: 'takeoff',
      from: '2026-07-30',
      to: '2026-07-31',
      sort: 'asc',
    });
  });

  it('typ SPOZA katalogu domeny jest POMIJANY, a nie wysyłany', () => {
    // Serwer odrzuciłby go czterysetką, a literówka w adresie ma pokazać rejestr,
    // nie stronę błędu. Kontrola: znany typ przechodzi, więc test nie przechodzi
    // dlatego, że pomija wszystko.
    expect(parse('typ=nie_ma_takiego').type).toBeNull();
    expect(parse('typ=drop').type).toBe('drop');
  });

  it('nieczytelna data i pusty napis są traktowane jak brak filtra', () => {
    expect(parse('od=wczoraj&do=2026-13-45').from).toBeNull();
    expect(parse('od=wczoraj&do=2026-13-45').to).toBeNull();
    expect(parse('uuid=%20%20').uuid).toBeNull();
    expect(parse('sort=bokiem').sort).toBe('desc');
  });

  it('data ISTNIEJĄCA przechodzi — także rok trzycyfrowy, który serwer też przyjmuje', () => {
    // Lustro `server/src/http/routes/admin/dayRange.ts`. Obie strony walidują ten sam
    // napis TYM SAMYM mechanizmem (parsowanie ISO 8601 UTC), więc zakres przepuszczony
    // przez ekran nie może dostać 400 od trasy. Do 2026-08-02 tak nie było: serwer
    // liczył `Date.UTC(y, m-1, d)`, a ta funkcja mapuje lata 0–99 na 1900 + rok, więc
    // `0099-01-01` przechodziło walidację panelu i wracało czterysetką — a ekran
    // pokazywał wtedy baner „Panel działa wyłącznie online", czyli komunikat o SIECI
    // przy błędzie walidacji.
    expect(parse('od=0099-01-01').from).toBe('0099-01-01');
    expect(parse('od=2024-02-29').from).toBe('2024-02-29');
    // Kontrola z drugiej strony: gdyby walidacja przepuszczała wszystko, asercje
    // o datach nieistniejących wyżej i tak by przeszły.
    expect(parse('od=2026-02-30').from).toBeNull();
  });

  it('białe znaki wokół wklejonego uuid-a są ucinane', () => {
    // Uuid wkleja się ze zgłoszenia albo z czatu, więc spacja na końcu to norma.
    expect(parse('uuid=%20ev-1%20').uuid).toBe('ev-1');
  });
});

describe('filtry rejestru: filtr → adres', () => {
  it('wartości domyślne NIE trafiają do adresu', () => {
    // Adres pełnego rejestru ma być po prostu `#/zdarzenia` — linkiem, który da się
    // przeczytać i przepisać.
    expect(paramsFromFilter(DEFAULT_EVENTS_FILTER)).toEqual({});
    expect(eventsHref(DEFAULT_EVENTS_FILTER)).toBe('/zdarzenia');
  });

  it('obieg w OBIE strony zachowuje filtr', () => {
    const filter: EventsFilter = {
      uuid: null,
      sessionUuid: 'sess-9',
      aircraftId: 'SP-KLM',
      pilotId: 'AKO',
      sourceDevice: 'admin:TMK',
      type: 'event_correction',
      from: '2026-07-01',
      to: '2026-07-31',
      sort: 'asc',
    };
    expect(filterFromParams(new URLSearchParams(paramsFromFilter(filter)))).toEqual(filter);
  });

  it('skróty wejścia z kontekstem budują ADRESY, nie same parametry', () => {
    expect(sessionEventsHref('sess-9')).toBe('/zdarzenia?sesja=sess-9');
    expect(eventHref('ev-1')).toBe('/zdarzenia?uuid=ev-1');
  });
});

describe('filtry rejestru: filtr → żądanie do serwera', () => {
  it('klucze zapytania są PO ANGIELSKU, a typ jedzie tablicą', () => {
    // Trasa przyjmuje `?type=` powtarzalnie (chip bywa grupą), więc nawet jeden typ
    // jedzie listą — inaczej dołożenie grupy zmieniałoby kształt żądania.
    const query = eventsListQuery({ ...DEFAULT_EVENTS_FILTER, type: 'landing', aircraftId: 'SP-AXA' });
    expect(query).toEqual({
      type: ['landing'],
      aircraftId: 'SP-AXA',
      sort: 'desc',
      limit: EVENTS_PAGE_LIMIT,
    });
  });

  it('pola nieustawione są POMIJANE, nie wysyłane jako puste', () => {
    // `?uuid=` to dla zoda po drugiej stronie napis pusty, czyli 400, a nie „bez filtra".
    const query = eventsListQuery(DEFAULT_EVENTS_FILTER);
    expect(Object.keys(query).sort()).toEqual(['limit', 'sort']);
  });

  it('kursor NIE jest częścią zapytania — dokłada go hook przy kolejnej stronie', () => {
    // Kursor opisuje pozycję WEWNĄTRZ wyniku filtra, więc jest parametrem strony,
    // a nie tożsamości pytania. Wpisany tu trafiłby do klucza cache'u.
    expect('cursor' in eventsListQuery(DEFAULT_EVENTS_FILTER)).toBe(false);
  });
});

describe('filtry rejestru: kiedy pustka znaczy „nie dotarło"', () => {
  it('samo `uuid` to SZUKANIE ZDARZENIA — inne zawężenie już nie', () => {
    // Od tego zależy stan pusty: „to zdarzenie nie dotarło na serwer" jest odpowiedzią
    // na pytanie zadane uuid-em, a nie na filtr po dacie i samolocie.
    expect(isUuidLookup(parse('uuid=ev-1'))).toBe(true);
    expect(isUuidLookup(parse('uuid=ev-1&samolot=SP-AXA'))).toBe(false);
    expect(isUuidLookup(parse('samolot=SP-AXA'))).toBe(false);
    // Samo sortowanie nie jest zawężeniem, więc nie psuje tego rozpoznania.
    expect(isUuidLookup(parse('uuid=ev-1&sort=asc'))).toBe(true);
  });

  it('`isNarrowed` widzi KAŻDE zawężenie z osobna', () => {
    for (const query of ['uuid=x', 'sesja=x', 'samolot=x', 'pilot=x', 'urzadzenie=x', 'typ=drop', 'od=2026-07-01', 'do=2026-07-01']) {
      expect(isNarrowed(parse(query)), query).toBe(true);
    }
    // Kontrola z drugiej strony: samo sortowanie zawężeniem NIE jest.
    expect(isNarrowed(parse('sort=asc'))).toBe(false);
  });
});
