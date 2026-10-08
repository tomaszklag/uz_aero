/**
 * Ninerdeck - panel: KTÓRE pozycje ma kolumna boczna i dokąd prowadzi goły adres
 * (wielofirmowość, issue #99 C6; „panel dla wszystkich", issue #216).
 *
 * Pod obserwacją jedna reguła i jej konsekwencje: pozycja należy do DOSTĘPU, więc
 * sesja klubu nie widzi modułu platformy, sesja platformy nie widzi modułów klubu,
 * a członek z PUSTYM zakresem widzi sam Kalendarz - i ekran startowy MUSI iść za tym
 * samym rachunkiem, bo stała `/dziennik` odsyłałaby go na trasę, która odpowie 403.
 */

import { describe, expect, it } from 'vitest';

import type { Capability } from '../../api/dto';
import { HOME, NAV_ITEMS, hasAccess, homeFor, navItemsFor, navSectionsFor } from './nav';

const CLUB: readonly Capability[] = ['panel.access', 'fleet.manage', 'accounts.manage'];
const PLATFORM: readonly Capability[] = ['platform.manage', 'bugs.triage'];

const routes = (capabilities: readonly Capability[] | undefined, kind: 'org' | 'platform'): string[] =>
  navItemsFor(capabilities, kind).map((item) => item.to);

describe('pozycje kolumny bocznej', () => {
  it('sesja KLUBU z Podglądem klubu dostaje moduły klubu i ani jednego modułu platformy', () => {
    // Siedem pozycji w stałej kolejności (4.0.0, pkt 32): Dziennik · Do sprawdzenia ·
    // Statystyki | Kalendarz · Zlecenia | Piloci · Samoloty. Dziennik pierwszy = startowy.
    expect(routes(CLUB, 'org')).toEqual([
      '/dziennik',
      '/do-sprawdzenia',
      '/statystyki',
      '/kalendarz',
      '/zlecenia',
      '/piloci',
      '/samoloty',
    ]);
  });

  // Numer zgłoszenia zostaje w komentarzu: strażnik hexów czyta napisy testów jak kolory.
  it('członek z PUSTYM zakresem dostaje Kalendarz i Zlecenia - jak w aplikacji', () => {
    expect(routes([], 'org')).toEqual(['/kalendarz', '/zlecenia']);
    // Akceptujący bez Podglądu klubu: też tylko planowanie - kolejka decyzji stoi w kalendarzu.
    expect(routes(['reservations.approve', 'fleet.watch'], 'org')).toEqual(['/kalendarz', '/zlecenia']);
  });

  it('sesja PLATFORMY dostaje wyłącznie swoje moduły - Kalendarz nie jest jej', () => {
    // Superadministrator nie wchodzi do danych klubu (docs/wielofirmowosc.md §3.3),
    // więc Dziennik, Piloci, Samoloty i Kalendarz nie mają tu czego pokazać.
    expect(routes(PLATFORM, 'platform')).toEqual(['/organizacje', '/zgloszenia']);
  });

  it('kolejność jest kolejnością z NAV_ITEMS, nie kolejnością zdolności', () => {
    // Filtr, nie sortowanie: kolejność pozycji opisuje produkt, a nie to, w jakiej
    // kolejności serwer wypisał zdolności w odpowiedzi.
    const all = NAV_ITEMS.map((item) => item.access).filter((a): a is Capability => a !== 'club');
    expect(routes([...all].reverse(), 'org')).toEqual(NAV_ITEMS.map((item) => item.to));
  });

  it('brak sesji znaczy PUSTĄ kolumnę, nie kolumnę z kłódkami', () => {
    expect(routes(undefined, 'platform')).toEqual([]);
    expect(routes([], 'platform')).toEqual([]);
  });
});

describe('grupy kolumny (4.0.0, pkt 32-34)', () => {
  const sections = (capabilities: readonly Capability[] | undefined, kind: 'org' | 'platform') =>
    navSectionsFor(capabilities, kind).map((s) => ({ label: s.label, items: s.items.map((i) => i.to) }));

  it('administrator widzi TRZY grupy z podpisami: Loty, Planowanie, Klub', () => {
    expect(sections(CLUB, 'org')).toEqual([
      { label: 'Loty', items: ['/dziennik', '/do-sprawdzenia', '/statystyki'] },
      { label: 'Planowanie', items: ['/kalendarz', '/zlecenia'] },
      { label: 'Klub', items: ['/piloci', '/samoloty'] },
    ]);
  });

  it('pilot z pustym zakresem ma listę PŁASKĄ - jedna grupa nie dostaje nagłówka', () => {
    expect(sections([], 'org')).toEqual([{ label: null, items: ['/kalendarz', '/zlecenia'] }]);
  });

  it('rama superadministratora jest płaska', () => {
    expect(sections(PLATFORM, 'platform')).toEqual([{ label: null, items: ['/organizacje', '/zgloszenia'] }]);
  });

  it('grupa bez widocznej pozycji znika w całości - Loty i Klub bez Podglądu klubu', () => {
    // Koordynator bez „Podglądu klubu" ma same moduły planowania: nagłówków Loty i Klub
    // nie ma, a jedyna zostająca grupa traci podpis.
    expect(sections(['reservations.manage', 'orders.create'], 'org')).toEqual([
      { label: null, items: ['/kalendarz', '/zlecenia'] },
    ]);
    expect(sections(['panel.access'], 'org').map((s) => s.label)).toEqual(['Loty', 'Planowanie', 'Klub']);
  });

  it('pozycje jednej grupy stoją w NAV_ITEMS obok siebie - inaczej grupa rozpadłaby się na dwie', () => {
    const groups = NAV_ITEMS.map((item) => item.group);
    const seen = new Set<string>();
    groups.forEach((group, index) => {
      if (index > 0 && groups[index - 1] !== group) expect(seen.has(group)).toBe(false);
      seen.add(group);
    });
  });
});

describe('dostęp', () => {
  it('„klub" otwiera każda sesja klubu - także z pustym zakresem - i żadna platformy', () => {
    expect(hasAccess([], 'org', 'club')).toBe(true);
    expect(hasAccess(undefined, 'org', 'club')).toBe(true);
    expect(hasAccess(PLATFORM, 'platform', 'club')).toBe(false);
  });

  it('zdolność pyta o zbiór, nie o rodzaj sesji', () => {
    expect(hasAccess(CLUB, 'org', 'panel.access')).toBe(true);
    expect(hasAccess([], 'org', 'panel.access')).toBe(false);
    expect(hasAccess(PLATFORM, 'platform', 'bugs.triage')).toBe(true);
  });
});

describe('ekran startowy', () => {
  it('to PIERWSZA DOSTĘPNA pozycja, osobno dla klubu, pilota i platformy', () => {
    expect(homeFor(CLUB, 'org')).toBe('/dziennik');
    expect(homeFor([], 'org')).toBe('/kalendarz');
    expect(homeFor(PLATFORM, 'platform')).toBe('/organizacje');
  });

  it('sesja bez pozycji dostaje ekran startowy klubu - adres musi być zawsze', () => {
    // Adresu nie da się nie mieć (marka i przekierowanie z gołego adresu go żądają),
    // a odmowę powie ekran „Brak dostępu". `HOME` jest tą wartością awaryjną.
    expect(homeFor([], 'platform')).toBe(HOME);
    expect(homeFor(undefined, 'platform')).toBe(HOME);
  });

  it('KAŻDA zdolność otwiera swój pierwszy moduł - także dołożona jutro', () => {
    // Pętla idzie po ZDOLNOŚCIACH, nie po pozycjach: `panel.access` otwiera trzy
    // moduły klubu naraz, więc ekranem startowym jest pierwszy z nich. Pozycja
    // „każdy członek" (`club`) nie ma zdolności - sprawdza ją przypadek wyżej.
    for (const item of NAV_ITEMS) {
      if (item.access === 'club') continue;
      const kind = item.access === 'platform.manage' || item.access === 'bugs.triage' ? 'platform' : 'org';
      const first = NAV_ITEMS.find((i) => i.access === item.access)!;
      expect(homeFor([item.access], kind)).toBe(first.to);
    }
  });
});
