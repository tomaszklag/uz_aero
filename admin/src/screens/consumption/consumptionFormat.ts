/**
 * UZ Aero — panel: formaty analityki zużycia (moduł CZYSTY).
 *
 * Uzupełnienie `statsFormat.ts` o zapisy, których statystyki zakresu nie mają: stawka
 * z niepewnością („51.3 ±2.1"), przelicznik motogodzin i podpis podstawy modelu.
 *
 * Reguła całego panelu obowiązuje bez zmian: `null` to ZAWSZE kreska, nigdy zero.
 * Dochodzi druga, właściwa temu ekranowi — **liczba bez niepewności nie ma prawa
 * wyglądać jak pomiar**, więc stawka z nieznanym przedziałem dostaje wprost adnotację
 * „bez przedziału", a nie samą wartość.
 */

import { DASH } from '../stats/statsFormat';

export { DASH };

/** Godziny z minutami z milisekund — „21:06" (wstęga podziału czasu). */
export function hoursMinutes(ms: number | null): string {
  if (ms == null || ms < 0) return DASH;
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/** Stawka paliwa — „51.3" (jedno miejsce; paliwomierz nie ma lepszej rozdzielczości). */
export function rateValue(lPerH: number | null): string {
  return lPerH == null ? DASH : lPerH.toFixed(1);
}

/**
 * Podpis niepewności pod stawką.
 *
 * Trzy różne zdania, bo to trzy różne sytuacje:
 *  • `±2.1 · 95%` — stawka wyznaczona, przedział znany;
 *  • `≤ 3.4 L/h · 95%` — stawka PRZYPIĘTA do zera przez więz: rozkład jest ucięty,
 *    więc symetryczne `±` sięgałoby poniżej zera, czyli poza dziedzinę;
 *  • `bez przedziału — równań tyle, co niewiadomych` — dopasowanie przechodzi przez
 *    punkty i nie ma z czego oszacować rozrzutu.
 */
export function rateUncertainty(
  ciHalfWidth: number | null,
  pinned: boolean,
  unit = 'L/h',
): string {
  if (pinned) {
    return ciHalfWidth == null
      ? 'nieodróżnialna od zera'
      : `≤ ${ciHalfWidth.toFixed(1)} ${unit} · 95%`;
  }
  return ciHalfWidth == null
    ? 'bez przedziału — równań tyle, co niewiadomych'
    : `±${ciHalfWidth.toFixed(1)} · 95%`;
}

/** Przelicznik motogodzin — dwa miejsca, bo różnica 0.96 vs 1.00 jest tu treścią. */
export function mhRate(value: number | null): string {
  return value == null ? DASH : value.toFixed(2);
}

/** Nazwa fazy po polsku — klucz domenowy jest angielski, ekran mówi do człowieka. */
export function phaseLabel(phase: string): string {
  switch (phase) {
    case 'ground':
      return 'Ziemia · silnik';
    case 'climb':
      return 'Wznoszenie';
    case 'cruise':
      return 'Przelot';
    case 'descent':
      return 'Zniżanie';
    case 'air':
      return 'W powietrzu';
    case 'engine':
      return 'Praca silnika';
    default:
      return phase;
  }
}

/** Ton fazy — wspólny dla kart stawek, wstęgi i tabeli interwałów. */
export function phaseTone(phase: string): 'green' | 'blue' | 'amber' | 'dim' {
  switch (phase) {
    case 'climb':
      return 'green';
    case 'cruise':
    case 'air':
      return 'blue';
    case 'descent':
      return 'amber';
    default:
      return 'dim';
  }
}

/** Miesiąc `YYYY-MM` → „JUL" — oś trendu (mockup bez roku). */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function monthShort(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? '?';
}

/** Znacznik czasu UTC → „30 JUL" (kolumna dnia w tabelach). */
export function dayOf(at: number | null): string {
  if (at == null) return DASH;
  const date = new Date(at);
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()] ?? '?'}`;
}

/** Godzina UTC „09:58" — granice interwału. */
export function timeOf(at: number): string {
  const date = new Date(at);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

/** Nazwa granicy interwału — z jakiego zdarzenia pochodzi odczyt. */
export function boundLabel(kind: string): string {
  switch (kind) {
    case 'preflight':
      return 'preflight';
    case 'refuel':
      return 'tankowanie';
    case 'day_close':
      return 'zamknięcie';
    default:
      return kind;
  }
}

/** Powód odrzucenia interwału — po polsku, bo stoi w kolumnie „Stan". */
export function rejectionLabel(rejected: string | null): string | null {
  switch (rejected) {
    case 'negative-consumption':
      return 'paliwa przybyło — sprawdź odczyt';
    case 'engine-too-short':
      return 'za krótki odcinek pracy silnika';
    case 'no-engine':
      return 'silnik nie pracował';
    case 'outlier':
      return 'poza modelem — prawdopodobny błąd odczytu';
    default:
      return null;
  }
}
