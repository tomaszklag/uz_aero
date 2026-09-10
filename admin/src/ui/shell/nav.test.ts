/**
 * UZ Aero - panel: KTÓRE pozycje ma kolumna boczna i dokąd prowadzi goły adres
 * (wielofirmowość, issue #99 C6).
 *
 * Pod obserwacją jedna reguła i jej dwie konsekwencje: pozycja należy do ZDOLNOŚCI,
 * więc sesja klubu nie widzi modułu platformy, a sesja platformy nie widzi modułów
 * klubu - i ekran startowy MUSI iść za tym samym rachunkiem, bo stała `/dziennik`
 * odsyłałaby superadministratora na trasę, która odpowie mu 401.
 */

import { describe, expect, it } from 'vitest';

import type { Capability } from '../../api/dto';
import { HOME, NAV_ITEMS, homeFor, navItemsFor } from './nav';

const CLUB: readonly Capability[] = ['panel.access', 'fleet.manage', 'accounts.manage'];
const PLATFORM: readonly Capability[] = ['platform.manage', 'bugs.triage'];

const routes = (capabilities: readonly Capability[] | undefined): string[] =>
  navItemsFor(capabilities).map((item) => item.to);

describe('pozycje kolumny bocznej', () => {
  it('sesja KLUBU dostaje moduły klubu i ani jednego modułu platformy', () => {
    expect(routes(CLUB)).toEqual(['/dziennik', '/piloci', '/samoloty']);
  });

  it('sesja PLATFORMY dostaje wyłącznie swoje moduły', () => {
    // Superadministrator nie wchodzi do danych klubu (docs/wielofirmowosc.md §3.3),
    // więc Dziennik, Piloci i Samoloty nie mają tu czego pokazać.
    expect(routes(PLATFORM)).toEqual(['/organizacje', '/zgloszenia']);
  });

  it('kolejność jest kolejnością z NAV_ITEMS, nie kolejnością zdolności', () => {
    // Filtr, nie sortowanie: kolejność pozycji opisuje produkt, a nie to, w jakiej
    // kolejności serwer wypisał zdolności w odpowiedzi.
    const all = NAV_ITEMS.map((item) => item.capability);
    expect(routes([...all].reverse())).toEqual(NAV_ITEMS.map((item) => item.to));
  });

  it('brak zdolności i brak sesji znaczą PUSTĄ kolumnę, nie kolumnę z kłódkami', () => {
    expect(routes([])).toEqual([]);
    expect(routes(undefined)).toEqual([]);
  });
});

describe('ekran startowy', () => {
  it('to PIERWSZA DOSTĘPNA pozycja, osobno dla klubu i dla platformy', () => {
    expect(homeFor(CLUB)).toBe('/dziennik');
    expect(homeFor(PLATFORM)).toBe('/organizacje');
  });

  it('sesja bez pozycji dostaje ekran startowy klubu - adres musi być zawsze', () => {
    // Adresu nie da się nie mieć (marka i przekierowanie z gołego adresu go żądają),
    // a odmowę powie serwer na trasie. `HOME` jest tą wartością awaryjną.
    expect(homeFor([])).toBe(HOME);
    expect(homeFor(undefined)).toBe(HOME);
  });

  it('KAŻDA zdolność otwiera swój pierwszy moduł - także dołożona jutro', () => {
    // Bez tego reguła „pierwsza dostępna" mogłaby po cichu wskazywać stałą. Pętla
    // idzie po ZDOLNOŚCIACH, nie po pozycjach: `panel.access` otwiera trzy moduły
    // klubu naraz, więc ekranem startowym jest pierwszy z nich, nie każdy z nich.
    for (const capability of new Set(NAV_ITEMS.map((item) => item.capability))) {
      const first = NAV_ITEMS.find((item) => item.capability === capability)!;
      expect(homeFor([capability])).toBe(first.to);
    }
  });
});
