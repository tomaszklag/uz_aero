/**
 * UZ Aero - panel 2.0: ZAKRESY DAT dziennika i szybkie filtry.
 *
 * Moduł CZYSTY: `now` przychodzi ARGUMENTEM, nie z zegara w środku. Powód jest ten
 * sam, dla którego serwer podaje `at` w odpowiedzi - „dziś" jest pytaniem o zegar,
 * a funkcja, która sama go czyta, nie da się przetestować ani przesunąć w czasie.
 *
 * ══ WSZYSTKO LICZY SIE W UTC ══
 * Cały produkt jest w UTC (log samolotu, karty arkusza, czasy zdarzeń), więc „dzisiaj"
 * znaczy dobę UTC, a nie dobę strefy przeglądarki. Inaczej administrator w Polsce
 * widziałby po 22:00 „dzisiaj", które na serwerze jest już jutrem - a w narzędziu
 * nadzoru wiarygodnie wyglądająca odpowiedź o innym okresie jest najgorszą awarią.
 */

/** Zakres jak w kontrakcie serwera: dzień UTC `YYYY-MM-DD`, obustronnie domknięty. */
export interface DayRange {
  from: string;
  to: string;
}

/** Szybkie filtry - kolejność jest kolejnością na pasku. */
export const QUICK_RANGES = ['dzis', 'weekend', 'dni30', 'miesiac', 'poprzedni'] as const;

export type QuickRange = (typeof QUICK_RANGES)[number];

/** Napis na chipie. `Record`, więc nowy zakres bez nazwy nie skompiluje się. */
const LABELS: Record<QuickRange, string> = {
  dzis: 'Dzisiaj',
  weekend: 'Weekend',
  dni30: '30 dni',
  miesiac: 'Ten miesiąc',
  poprzedni: 'Poprzedni miesiąc',
};

export const quickRangeLabel = (range: QuickRange): string => LABELS[range];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Chwila -> dzień UTC. Jedyne miejsce, w którym powstaje napis daty w tym module. */
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const startOfDay = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;

/**
 * Znaczenie każdego szybkiego filtra.
 *
 * `weekend` jest jedynym, który wymaga wyjaśnienia, więc dostaje je tutaj: w sobotę
 * i niedzielę znaczy TRWAJĄCY weekend (żeby w niedzielę wieczorem widzieć własny
 * dzień), a od poniedziałku - ten, który właśnie minął. Klub lata w weekend i rozlicza
 * go w tygodniu, więc „ostatni weekend" jest tu pytaniem częstszym niż „najbliższy".
 */
export function rangeOf(quick: QuickRange, now: number): DayRange {
  const today = startOfDay(now);
  const date = new Date(today);

  switch (quick) {
    case 'dzis':
      return { from: dayOf(today), to: dayOf(today) };

    case 'weekend': {
      // `getUTCDay()`: 0 = niedziela, 6 = sobota.
      const weekday = date.getUTCDay();
      // Ile dni wstecz leży sobota TRWAJĄCEGO albo OSTATNIEGO weekendu.
      const backToSaturday = weekday === 6 ? 0 : weekday === 0 ? 1 : weekday + 1;
      const saturday = today - backToSaturday * DAY_MS;
      return { from: dayOf(saturday), to: dayOf(saturday + DAY_MS) };
    }

    case 'dni30':
      // 30 dni WŁĄCZNIE z dzisiejszym - stąd 29, nie 30. Zakres jest domknięty
      // z obu stron, więc „ostatnie 30 dni" ma zawierać dokładnie trzydzieści dób.
      return { from: dayOf(today - 29 * DAY_MS), to: dayOf(today) };

    case 'miesiac':
      return { from: dayOf(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)), to: dayOf(today) };

    case 'poprzedni': {
      const first = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
      // Ostatni dzień poprzedniego miesiąca = dzień przed pierwszym bieżącego.
      const last = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) - DAY_MS;
      return { from: dayOf(first), to: dayOf(last) };
    }
  }
}

/**
 * Który chip jest ZAPALONY dla bieżącego zakresu - albo `null`.
 *
 * Pytamy o RÓWNOŚĆ zakresu, nie o to, co kliknięto: dzięki temu ręczna zmiana daty
 * gasi chip sama, a wpisanie z klawiatury tego samego miesiąca zapala go z powrotem.
 * Drugie źródło prawdy („ostatnio kliknięty chip") rozjechałoby się z adresem przy
 * pierwszym wklejonym linku.
 */
export function activeQuickRange(range: DayRange, now: number): QuickRange | null {
  return (
    QUICK_RANGES.find((quick) => {
      const candidate = rangeOf(quick, now);
      return candidate.from === range.from && candidate.to === range.to;
    }) ?? null
  );
}

/**
 * Zakres domyślny - ten sam, który wybiera serwer, gdy panel nic nie poda.
 *
 * Panel i tak wpisuje go do adresu przy pierwszym wejściu, żeby każdy adres z paska
 * przeglądarki dało się wkleić w komplecie.
 */
export const defaultRange = (now: number): DayRange => rangeOf('dni30', now);
