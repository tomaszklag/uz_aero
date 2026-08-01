/**
 * UZ Aero — panel: testy przejść z pulpitu (`A01`, `A01a`).
 *
 * ══ PO CO ODDZIELNY PLIK NA SAME ADRESY ══
 * Pulpit bez przejść jest tablicą ogłoszeń, a przejście prowadzące gdzie indziej niż
 * obiecuje kafel jest gorsze od jego braku. Adresy są też JEDYNĄ rzeczą na tym ekranie,
 * którą da się zepsuć bez zmiany ani jednej liczby — literówka w nazwie parametru daje
 * poprawnie wyglądającą listę BEZ zawężenia.
 *
 * Dlatego test porównuje je z parserami filtrów ekranów docelowych, a nie z napisami
 * przepisanymi drugi raz: przejście musi się rozłożyć z powrotem na ten filtr,
 * o który prosiliśmy.
 */

import { describe, expect, it } from 'vitest';

import { filterFromParams as eksportyFilter } from '../eksporty/eksportyFilters';
import { filterFromParams as flotaFilter } from '../flota/flotaFilters';
import { filterFromParams as dniFilter } from '../dni/dniFilters';
import {
  MISSING_SCREENS,
  dniDniaHref,
  dniOtwarteHref,
  dzienLink,
  eksportyBrakujaceHref,
  eksportyHrefAll,
  flagaHref,
  flagiHref,
  flotaZajeteHref,
  samolotLink,
} from './pulpitLinks';

/** Query string adresu jako `URLSearchParams` — tak, jak odczyta go router panelu. */
const paramsOf = (href: string): URLSearchParams =>
  new URLSearchParams(href.split('?')[1] ?? '');

describe('kafel prowadzi do listy zawężonej TAK, JAK POLICZONA jest jego liczba', () => {
  it('„Samoloty w ruchu" → flota z chipem „Z claimem"', () => {
    const href = flotaZajeteHref();
    expect(href).toBe('/flota?zakres=claimed');
    // Rozkłada się z powrotem na ten filtr, o który prosiliśmy.
    expect(flotaFilter(paramsOf(href)).scope).toBe('claimed');
  });

  it('„Dni otwarte" → lista dni z chipem „Otwarte"', () => {
    const href = dniOtwarteHref();
    expect(href).toBe('/dni?stan=open');
    expect(dniFilter(paramsOf(href)).state).toBe('open');
  });

  it('„Flagi otwarte" → skrzynka w stanie DOMYŚLNYM (czyli otwartych)', () => {
    // Adres bez parametrów jest tu POPRAWNY: domyślny filtr skrzynki to `status: open`,
    // więc `?status=open` byłoby zawężeniem, którego `paramsFromFilter` i tak pomija.
    expect(flagiHref()).toBe('/flagi');
  });

  it('„Eksport arkuszy" z awarią → monitor zawężony do kart, których NIE MA', () => {
    const href = eksportyBrakujaceHref();
    expect(href).toBe('/eksporty?stan=missing');
    expect(eksportyFilter(paramsOf(href)).scope).toBe('missing');
  });

  it('„Eksport arkuszy" bez awarii → pełny monitor, bez zawężenia', () => {
    expect(eksportyHrefAll()).toBe('/eksporty');
  });
});

describe('wiersze prowadzą w miejsce, które ISTNIEJE', () => {
  it('sprawa → szuflada flagi nad skrzynką', () => {
    expect(flagaHref(1046)).toBe('/flagi/1046');
  });

  it('dzień → karta dnia (pełna strona, nie szuflada)', () => {
    expect(dzienLink('sess-1')).toBe('/dni/sess-1');
  });

  it('nieudany eksport → wiersz ROZWINIĘTY w zawężonym monitorze', () => {
    // Zawężenie zostaje razem z uuid-em: administrator, który zamknie rozwinięcie,
    // ma wrócić do listy awarii, a nie do pełnego monitora.
    const href = eksportyBrakujaceHref('sess-x');
    expect(href).toBe('/eksporty/sess-x?stan=missing');
    expect(eksportyFilter(paramsOf(href)).scope).toBe('missing');
  });

  it('samolot wolny → szuflada jednostki na ekranie floty', () => {
    expect(samolotLink('ac-1')).toBe('/flota/ac-1');
  });

  it('podsumowanie doby → lista dni zawężona do TEJ doby, obustronnie', () => {
    const href = dniDniaHref('2026-07-30');
    const filter = dniFilter(paramsOf(href));
    expect(filter.from).toBe('2026-07-30');
    expect(filter.to).toBe('2026-07-30');
  });

  it('identyfikatory ze znakami specjalnymi nie rozbijają adresu', () => {
    // `aircraft.id` jest UUID-em, ale rejestracja bywa kluczem w starych danych —
    // a `SP/ABC` w ścieżce zrobiłby z jednego segmentu dwa.
    expect(samolotLink('SP/ABC')).toBe('/flota/SP%2FABC');
  });
});

describe('ekran, którego nie ma, NIE dostaje linku', () => {
  it('rejestr zdarzeń (`A04`) ma powód blokady, a nie adres', () => {
    // Link do strony „w budowie" byłby czwartym ślepym zaułkiem w panelu. Powód jest
    // DANĄ, a nie napisem w JSX-ie, żeby dało się go usunąć w jednym miejscu, gdy
    // ekran powstanie.
    expect(MISSING_SCREENS.zdarzenia).toContain('A04');
    expect(Object.values(MISSING_SCREENS)).not.toContain('/zdarzenia');
  });
});
