/**
 * UZ Aero — panel: filtry dziennika audytu ↔ query string.
 *
 * Na tym ekranie URL nie jest wygodą, tylko WYMAGANIEM: ekran korekty obiecuje „ślad
 * w audycie → A09", a karta dnia odsyła do śladu konkretnej flagi. Obie drogi to linki,
 * które muszą prowadzić do dziennika ODFILTROWANEGO po obiekcie — więc obie strony
 * tłumaczenia (URL → filtr → parametry trasy) mają test.
 */

import { describe, expect, it } from 'vitest';

import {
  auditHref,
  auditListQuery,
  actionsOf,
  DEFAULT_AUDIT_FILTER,
  filterFromParams,
  isNarrowed,
  paramsFromFilter,
  scopeFrom,
  targetHref,
  type AuditFilter,
} from './auditFilters';

const params = (query: string): URLSearchParams => new URLSearchParams(query);

describe('filtry dziennika audytu', () => {
  it('pusty adres daje filtr domyślny — bez zawężenia, najnowsze na górze', () => {
    expect(filterFromParams(params(''))).toEqual(DEFAULT_AUDIT_FILTER);
    expect(isNarrowed(DEFAULT_AUDIT_FILTER)).toBe(false);
  });

  it('czyta grupę, konto, obiekt, zakres i porządek', () => {
    const filter = filterFromParams(
      params('akcje=konta&kto=TMK&typ=pilot&obiekt=MBK&od=2026-07-25&do=2026-07-31&sort=asc'),
    );

    expect(filter).toEqual({
      scope: { kind: 'group', id: 'konta' },
      actor: 'TMK',
      targetType: 'pilot',
      targetId: 'MBK',
      from: '2026-07-25',
      to: '2026-07-31',
      sort: 'asc',
    });
    expect(isNarrowed(filter)).toBe(true);
  });

  it('`akcje` przyjmuje TAKŻE pojedynczy kod — jeden parametr, dwa znaczenia', () => {
    expect(scopeFrom('konserwacja')).toEqual({ kind: 'group', id: 'konserwacja' });
    expect(scopeFrom('flag.resolve')).toEqual({ kind: 'action', code: 'flag.resolve' });
    expect(scopeFrom('nie.ma')).toBeNull();
    expect(scopeFrom(null)).toBeNull();
  });

  it('wartości nieznane są POMIJANE — adres z literówką daje pełny dziennik', () => {
    // Strona błędu za literówkę w linku byłaby najgorszą odpowiedzią narzędzia,
    // do którego przychodzi się z wklejonego adresu.
    const filter = filterFromParams(params('akcje=bzdura&sort=wstecz&od=wczoraj&kto=%20%20'));

    expect(filter.scope).toBeNull();
    expect(filter.sort).toBe('desc');
    expect(filter.from).toBeNull();
    expect(filter.actor).toBeNull();
  });

  it('filtr → adres pomija wartości domyślne (link da się przeczytać)', () => {
    expect(paramsFromFilter(DEFAULT_AUDIT_FILTER)).toEqual({});
    expect(auditHref(DEFAULT_AUDIT_FILTER)).toBe('/audyt');

    expect(
      paramsFromFilter({
        ...DEFAULT_AUDIT_FILTER,
        scope: { kind: 'action', code: 'event.correct' },
        targetType: 'event',
        targetId: '4c88-9a01',
      }),
    ).toEqual({ akcje: 'event.correct', typ: 'event', obiekt: '4c88-9a01' });
  });

  it('adres → filtr → adres jest tożsamością (link wklejony wraca ten sam)', () => {
    const original = 'akcje=flota&kto=TMK&typ=aircraft&obiekt=SP-KLM&od=2026-07-01&do=2026-07-31&sort=asc';
    const round = new URLSearchParams(paramsFromFilter(filterFromParams(params(original))));

    expect(round.toString()).toBe(new URLSearchParams(original).toString());
  });

  it('`targetHref` buduje wejście z kontekstem z A02a i A02b', () => {
    // To jest dokładnie ten link, który obiecuje mockup korekty („ślad w audycie → A09")
    // i wiersz flagi na karcie dnia.
    expect(targetHref('event', '4c88-9a01')).toBe('/audyt?typ=event&obiekt=4c88-9a01');
    expect(targetHref('flag', '1044')).toBe('/audyt?typ=flag&obiekt=1044');
  });

  it('grupa rozwija się na LISTĘ kodów, pojedynczy kod na listę jednoelementową', () => {
    expect(actionsOf({ kind: 'group', id: 'konserwacja' })).toEqual([
      'maintenance.rebuild_projections',
      'maintenance.retry_exports',
      'maintenance.prune_tokens',
    ]);
    expect(actionsOf({ kind: 'action', code: 'export.retry' })).toEqual(['export.retry']);
    // Brak zawężenia to BRAK parametru, a nie pusta tablica: `?action=` byłoby dla
    // zoda po drugiej stronie napisem pustym, czyli 400.
    expect(actionsOf(null)).toBeUndefined();
  });

  it('zapytanie trasy niesie wyłącznie ustawione pola', () => {
    expect(auditListQuery(DEFAULT_AUDIT_FILTER)).toEqual({ sort: 'desc', limit: 50 });

    const narrowed: AuditFilter = {
      scope: { kind: 'action', code: 'flag.resolve' },
      actor: 'AKO',
      targetType: 'flag',
      targetId: '1044',
      from: '2026-07-01',
      to: null,
      sort: 'asc',
    };
    expect(auditListQuery(narrowed)).toEqual({
      action: ['flag.resolve'],
      actor: 'AKO',
      targetType: 'flag',
      targetId: '1044',
      from: '2026-07-01',
      sort: 'asc',
      limit: 50,
    });
  });

  it('każdy pojedynczy wymiar zawęża — także sam typ obiektu', () => {
    const only = (patch: Partial<AuditFilter>): boolean =>
      isNarrowed({ ...DEFAULT_AUDIT_FILTER, ...patch });

    expect(only({ actor: 'TMK' })).toBe(true);
    expect(only({ targetType: 'flag' })).toBe(true);
    expect(only({ targetId: '1044' })).toBe(true);
    expect(only({ from: '2026-07-01' })).toBe(true);
    expect(only({ scope: { kind: 'group', id: 'konta' } })).toBe(true);
    // Porządek to nie zawężenie: odwrócenie sortowania nie zmienia ZBIORU wierszy,
    // więc pusta lista przy `sort=asc` mówi to samo, co przy `desc`.
    expect(only({ sort: 'asc' })).toBe(false);
  });
});
