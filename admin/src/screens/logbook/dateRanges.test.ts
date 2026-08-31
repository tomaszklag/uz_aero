import { describe, expect, it } from 'vitest';

import { activeQuickRange, defaultRange, QUICK_RANGES, quickRangeLabel, rangeOf } from './dateRanges';

/** Czwartek 13 sierpnia 2026, 21:40 UTC - pora, o której doba lokalna już się rozjeżdża. */
const THURSDAY = Date.UTC(2026, 7, 13, 21, 40);
const SATURDAY = Date.UTC(2026, 7, 15, 10, 0);
const SUNDAY = Date.UTC(2026, 7, 16, 23, 30);

describe('szybkie zakresy', () => {
  it('dzisiaj to JEDNA doba UTC, nie doba przeglądarki', () => {
    // O 21:40 UTC w Polsce jest 23:40 - gdyby liczyć lokalnie, „dzisiaj" wskazywałoby
    // ten sam dzień, ale o 22:30 UTC już następny. Log jest w UTC, więc filtr też.
    expect(rangeOf('dzis', THURSDAY)).toEqual({ from: '2026-08-13', to: '2026-08-13' });
  });

  it('30 dni obejmuje DOKŁADNIE trzydzieści dób, razem z dzisiejszą', () => {
    // Zakres jest domknięty z obu stron, więc odejmujemy 29, nie 30.
    expect(rangeOf('dni30', THURSDAY)).toEqual({ from: '2026-07-15', to: '2026-08-13' });
  });

  it('ten miesiąc liczy się od pierwszego DO DZIŚ, nie do końca miesiąca', () => {
    expect(rangeOf('miesiac', THURSDAY)).toEqual({ from: '2026-08-01', to: '2026-08-13' });
  });

  it('poprzedni miesiąc to CAŁY poprzedni miesiąc', () => {
    expect(rangeOf('poprzedni', THURSDAY)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('poprzedni miesiąc przeskakuje rok bez potykania się o grudzień', () => {
    const january = Date.UTC(2026, 0, 9, 12, 0);
    expect(rangeOf('poprzedni', january)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('weekend', () => {
  it('w środku tygodnia pokazuje ten, który MINĄŁ', () => {
    // Czwartek 13 sierpnia -> weekend 8-9 sierpnia. Klub lata w weekend i rozlicza
    // go w tygodniu, więc „ostatni" jest tu pytaniem częstszym niż „najbliższy".
    expect(rangeOf('weekend', THURSDAY)).toEqual({ from: '2026-08-08', to: '2026-08-09' });
  });

  it('w sobotę i niedzielę pokazuje TRWAJĄCY, nie poprzedni', () => {
    // Inaczej w niedzielę wieczorem administrator nie zobaczyłby własnego dnia.
    expect(rangeOf('weekend', SATURDAY)).toEqual({ from: '2026-08-15', to: '2026-08-16' });
    expect(rangeOf('weekend', SUNDAY)).toEqual({ from: '2026-08-15', to: '2026-08-16' });
  });
});

describe('który chip jest zapalony', () => {
  it('rozpoznaje zakres po RÓWNOŚCI, nie po tym, co kliknięto', () => {
    // Dzięki temu ręczna zmiana daty gasi chip sama, a wpisanie z klawiatury tego
    // samego miesiąca zapala go z powrotem - bez drugiego źródła prawdy obok adresu.
    expect(activeQuickRange({ from: '2026-08-01', to: '2026-08-13' }, THURSDAY)).toBe('miesiac');
    expect(activeQuickRange({ from: '2026-08-13', to: '2026-08-13' }, THURSDAY)).toBe('dzis');
  });

  it('zakres wpisany ręcznie nie zapala żadnego chipa', () => {
    expect(activeQuickRange({ from: '2026-08-03', to: '2026-08-09' }, THURSDAY)).toBeNull();
  });

  it('domyślny zakres to trzydzieści dni - ten sam, który wybiera serwer', () => {
    expect(defaultRange(THURSDAY)).toEqual(rangeOf('dni30', THURSDAY));
  });
});

describe('nazwy chipów', () => {
  it('każdy zakres ma nazwę po polsku i żadna nie jest pusta', () => {
    for (const quick of QUICK_RANGES) {
      expect(quickRangeLabel(quick).length).toBeGreaterThan(3);
    }
  });
});
