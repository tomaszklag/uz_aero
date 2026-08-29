/**
 * UZ Aero - panel: FILTRY STATYSTYK ↔ query string (moduł CZYSTY, testowany w Node).
 *
 * Filtry mieszkają w URL-u (`docs/architektura-panelu-frontend.md` §4.4): raport
 * „lipiec, ujęcie per pilot" ma być linkiem do wklejenia, nie stanem, który ginie
 * po F5. Parametry są po polsku, jak w pasku adresu mockupu:
 * `/statystyki?od=2026-07-01&do=2026-07-30&ujecie=samolot`.
 *
 * ══ BRAK `od`/`do` ≠ „panel wybiera zakres" ══
 * Zakres domyślny (ostatnie 30 dni) liczy SERWER od swojego zegara - panel bez
 * parametrów wysyła zapytanie bez zakresu i pokazuje ten, który wrócił w odpowiedzi.
 * „Dziś" jest pytaniem o zegar, a zegar przeglądarki jest trzecim, niesprawdzonym
 * zegarem w równaniu (ten sam argument, co przy wiekach na pulpicie).
 */

import type { StatsQuery } from '../../api/stats';

/** Ujęcie raportu - trzy przekroje TEGO SAMEGO zbioru dni. */
export type StatsView = 'aircraft' | 'pilot' | 'operation';

export interface StatsFilter {
  /** Dzień UTC `YYYY-MM-DD` włącznie; `null` = zakres domyślny serwera. */
  from: string | null;
  to: string | null;
  view: StatsView;
}

export const DEFAULT_STATS_FILTER: StatsFilter = {
  from: null,
  to: null,
  view: 'aircraft',
};

/** Wartości parametru `ujecie` - po polsku, bo takie stoją w mockupie w pasku adresu. */
const VIEW_PARAM: Record<StatsView, string> = {
  aircraft: 'samolot',
  pilot: 'pilot',
  operation: 'operacja',
};

const viewFromParam = (value: string | null): StatsView | null => {
  for (const [view, param] of Object.entries(VIEW_PARAM) as [StatsView, string][]) {
    if (param === value) return view;
  }
  return null;
};

/** `YYYY-MM-DD` i nic innego - wpis nieczytelny traktujemy jak brak filtra. */
const isDay = (value: string | null): value is string =>
  value != null && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Query string → filtr. Wartości nieznane są POMIJANE, nie odrzucane. */
export function filterFromParams(params: URLSearchParams): StatsFilter {
  return {
    from: isDay(params.get('od')) ? params.get('od') : null,
    to: isDay(params.get('do')) ? params.get('do') : null,
    view: viewFromParam(params.get('ujecie')) ?? DEFAULT_STATS_FILTER.view,
  };
}

/** Filtr → query string. Wartości domyślne POMIJAMY - pełny raport to `#/statystyki`. */
export function paramsFromFilter(filter: StatsFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.from != null) params.od = filter.from;
  if (filter.to != null) params.do = filter.to;
  if (filter.view !== DEFAULT_STATS_FILTER.view) params.ujecie = VIEW_PARAM[filter.view];
  return params;
}

/** Filtr ekranu → parametry trasy serwera (dni jadą jako `YYYY-MM-DD`). */
export function statsQuery(filter: StatsFilter): StatsQuery {
  return {
    ...(filter.from == null ? {} : { from: filter.from }),
    ...(filter.to == null ? {} : { to: filter.to }),
  };
}

// ── presety zakresu ─────────────────────────────────────────────────────────────

export interface StatsPreset {
  key: 'week' | 'previous_month' | 'year_to_date';
  label: string;
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Trzy presety z mockupu, liczone od DZIŚ zegara SERWERA (`report.at`) - nie od
 * zegara przeglądarki. Tydzień zaczyna się w poniedziałek (ISO), „rok do dziś"
 * od 1 stycznia.
 */
export function statsPresets(atIso: string): StatsPreset[] {
  const nowMs = Date.parse(atIso);
  const today = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const d = new Date(today);

  // `getUTCDay()` daje 0 dla niedzieli - przesuwamy na poniedziałek jako początek.
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = today - sinceMonday * DAY_MS;

  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const previousMonthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);

  return [
    { key: 'week', label: 'Ten tydzień', from: dayOf(monday), to: dayOf(today) },
    {
      key: 'previous_month',
      label: 'Poprzedni miesiąc',
      from: dayOf(previousMonthStart),
      to: dayOf(monthStart - DAY_MS),
    },
    { key: 'year_to_date', label: 'Rok do dziś', from: dayOf(yearStart), to: dayOf(today) },
  ];
}

/** Czy preset jest AKTYWNY - dokładna równość obu granic z filtrem. */
export function isPresetActive(filter: StatsFilter, preset: StatsPreset): boolean {
  return filter.from === preset.from && filter.to === preset.to;
}
