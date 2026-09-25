/**
 * Ninerdeck - GEOMETRIA WYKRESÓW karty maszyny: motogodziny i paliwo w czasie
 * (obserwowanie 3.2.0, issue #205; `docs/obserwowanie-samolotu.md` §6.4).
 *
 * ══ SERIE LICZY SERWER, TELEFON LICZY EKRAN ══
 * Punkty przychodzą gotowe `(at, value, source)`; tu jest wyłącznie przekład na
 * piksele: skala pionu, siatka, odcinki pełne i przerywane, podpisy osi i kursor.
 * Druga kopia rachunku w aplikacji byłaby pierwszym miejscem, w którym wykres pokazałby
 * co innego niż karta liczników obok.
 *
 * ══ DWIE SKALE PIONU, ŚWIADOMIE ══ (§6.4)
 * Licznik idzie od minimum do maksimum okna - jak profil śladu („skala zaczyna się od
 * dna lotu"): od zera linia 1 236 godzin byłaby kreską przy suficie. Paliwo idzie od
 * zera do POJEMNOŚCI, bo tu zero JEST wartością, a pojemność - ścianą, której nie
 * wolno przekroczyć.
 *
 * ══ MASZYNA STAŁA = KRESKA PRZERYWANA ══
 * Między zdaniem a następnym przejęciem rejestr o maszynie nie mówi nic, więc odcinek
 * jest szary i przerywany (ta sama kreska, którą issue #75 rysuje kołowanie). Odcinek
 * WEWNĄTRZ operacji (przejęcie → tankowanie → zdanie) jest pełny. Odcinek zaczynający
 * się wpisem administratora też jest „postojem": wpis pada przy biurku, nie w kabinie.
 *
 * Brak danych to brak linii, nie zero: seria z jednym punktem rysuje sam punkt.
 */

import { dateUtcDayMonth, litres, motoHours, plural, shortName, timeUtc } from '@ninerdeck/format';

import type { RemoteSeriesPoint } from '../../../application';

export type SeriesKind = 'mh' | 'fuel';

export interface SeriesPoint {
  at: number;
  value: number;
  source: RemoteSeriesPoint['source'];
  sessionUuid: string | null;
  pilotId: string | null;
}

export interface SeriesInput {
  kind: SeriesKind;
  points: readonly SeriesPoint[];
  /** Okno osi czasu - te same 90 dni, o które pytała karta; koniec = „teraz". */
  from: number;
  to: number;
  /** Pole wykresu w pikselach (bez podpisów osi). */
  width: number;
  height: number;
  /** Pojemność zbiorników - sufit skali paliwa; bez niej sufitem jest maksimum okna. */
  capacityL?: number | null;
}

export interface PlotPoint extends SeriesPoint {
  x: number;
  y: number;
}

export interface PlotRun {
  /** Indeksy w `points`: odcinek od `from` do `to` włącznie. */
  from: number;
  to: number;
  /** `engine` = wewnątrz operacji (pełna zieleń); `idle` = maszyna stała (szara przerywana). */
  kind: 'engine' | 'idle';
}

export interface GridLine {
  y: number;
  label: string;
}

export interface SeriesPlot {
  points: PlotPoint[];
  runs: PlotRun[];
  /** Cztery poziomy siatki z podpisem - tyle mieści się czytelnie na wysokości telefonu. */
  grid: GridLine[];
  low: number;
  high: number;
}

/** Oddech na krańcach pola - pierwszy i ostatni punkt nie siedzą na krawędzi. */
export const PLOT_PAD_X = 10;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;
const GRID_STEPS = [0, 1, 2, 3];

const DAY_MS = 86_400_000;

/** Punkty z drutu → liczby; wiersz bez czytelnej chwili WYPADA (nie ma gdzie stanąć). */
export function toSeries(wire: readonly RemoteSeriesPoint[]): SeriesPoint[] {
  return wire.flatMap((p) => {
    const at = Date.parse(p.at);
    if (!Number.isFinite(at) || !Number.isFinite(p.value)) return [];
    return [{ at, value: p.value, source: p.source, sessionUuid: p.sessionUuid, pilotId: p.pilotId }];
  });
}

/**
 * Skala pionu: dla paliwa od zera do pojemności (zaokrąglonej w górę do wartości,
 * której nie przebije żaden punkt), dla licznika od dna do sufitu OKNA z oddechem
 * jednego kroku siatki - płaska linia (maszyna stała 90 dni) dostaje sztuczny zakres,
 * bo skala zerowej wysokości nie ma jak narysować niczego.
 */
export function valueRange(
  kind: SeriesKind,
  points: readonly SeriesPoint[],
  capacityL: number | null | undefined,
): { low: number; high: number } {
  const values = points.map((p) => p.value);
  const max = values.length === 0 ? 0 : Math.max(...values);
  const min = values.length === 0 ? 0 : Math.min(...values);
  if (kind === 'fuel') {
    const ceiling = capacityL != null && capacityL > 0 ? Math.max(capacityL, max) : max;
    return { low: 0, high: ceiling > 0 ? ceiling : 1 };
  }
  if (values.length === 0) return { low: 0, high: 1 };
  if (max === min) return { low: Math.floor(min) - 1, high: Math.floor(min) + 2 };
  // Sufit i dno na pełnych godzinach: podpisy siatki mają być liczbami, które pilot
  // zna z licznika, a nie ułamkami wynikającymi z geometrii.
  return { low: Math.floor(min), high: Math.ceil(max) };
}

/** Podpis poziomu siatki: „1 237" dla licznika (godziny z odstępem tysięcy), „180 L"/„120" dla paliwa. */
export function gridLabel(kind: SeriesKind, value: number, top: boolean): string {
  if (kind === 'fuel') return top ? litres(value) : String(Math.round(value));
  const hours = Math.round(value);
  return String(hours).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function buildSeriesPlot(input: SeriesInput): SeriesPlot {
  const sorted = [...input.points].sort((a, b) => a.at - b.at);
  const { low, high } = valueRange(input.kind, sorted, input.capacityL);
  const spanMs = Math.max(1, input.to - input.from);
  const spanW = Math.max(1, input.width - 2 * PLOT_PAD_X);
  const plotH = Math.max(1, input.height - PAD_TOP - PAD_BOTTOM);
  const spanV = Math.max(1e-9, high - low);

  const points: PlotPoint[] = sorted.map((p) => ({
    ...p,
    x: PLOT_PAD_X + ((p.at - input.from) / spanMs) * spanW,
    y: PAD_TOP + plotH - ((p.value - low) / spanV) * plotH,
  }));

  const runs: PlotRun[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const engine =
      a.sessionUuid != null && a.sessionUuid === b.sessionUuid && a.source !== 'release';
    runs.push({ from: i, to: i + 1, kind: engine ? 'engine' : 'idle' });
  }

  const grid: GridLine[] = GRID_STEPS.map((i) => {
    const ratio = i / (GRID_STEPS.length - 1);
    const value = high - (high - low) * ratio;
    return { y: PAD_TOP + plotH * ratio, label: gridLabel(input.kind, value, i === 0) };
  });

  return { points, runs, grid, low, high };
}

/* ── oś czasu ──────────────────────────────────────────────────────────────── */

export interface AxisLabel {
  /** Położenie w pikselach pola (po przybliżeniu). */
  x: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
}

/**
 * Trzy podpisy osi czasu: początek widocznego okna, jego środek i koniec - koniec pisze
 * „DZIŚ", gdy okno sięga „teraz". Liczone z OKNA WIDOCZNEGO, więc po przybliżeniu
 * mówią o tym, co widać, a nie o całych 90 dniach.
 */
export function axisLabels(
  visible: { from: number; to: number },
  width: number,
  now: number,
): AxisLabel[] {
  const mid = (visible.from + visible.to) / 2;
  const endIsNow = Math.abs(visible.to - now) < DAY_MS / 2;
  return [
    { x: 0, text: dateUtcDayMonth(visible.from), anchor: 'start' },
    { x: width / 2, text: dateUtcDayMonth(mid), anchor: 'middle' },
    { x: width, text: endIsNow ? 'DZIŚ' : dateUtcDayMonth(visible.to), anchor: 'end' },
  ];
}

/* ── kursor ────────────────────────────────────────────────────────────────── */

export interface CursorReading {
  point: PlotPoint;
  /** „14 WRZ 16:40 · 1 224:10". */
  title: string;
  /** „zdanie samolotu · J. Wrona". */
  sub: string;
}

const SOURCE_LABEL: Readonly<Record<RemoteSeriesPoint['source'], string>> = {
  claim: 'przejęcie',
  release: 'zdanie samolotu',
  refuel: 'tankowanie',
  admin: 'wpis administratora',
};

/**
 * Kursor wskazuje NAJBLIŻSZY punkt w czasie, nie wartość „między" - wykres pokazuje,
 * co pokazały przyrządy, a między odczytami rejestr nic nie wie. Podpis niesie chwilę,
 * wartość i ŹRÓDŁO punktu: bez źródła liczba każe zgadywać, czy to zdanie, czy wpis
 * z biurka (§6.4).
 */
export function cursorReading(
  plot: SeriesPlot,
  at: number,
  kind: SeriesKind,
  mhFormat: 'hhmm' | 'decimal',
  nameOf: (pilotId: string) => string | null,
): CursorReading | null {
  if (plot.points.length === 0) return null;
  let best = plot.points[0]!;
  for (const p of plot.points) if (Math.abs(p.at - at) < Math.abs(best.at - at)) best = p;
  const value = kind === 'fuel' ? litres(best.value) : motoHours(best.value, mhFormat);
  const who = best.pilotId == null ? null : nameOf(best.pilotId);
  return {
    point: best,
    title: `${dateUtcDayMonth(best.at)} ${timeUtc(best.at)} · ${value}`,
    sub: who == null ? SOURCE_LABEL[best.source] : `${SOURCE_LABEL[best.source]} · ${shortName(who)}`,
  };
}

/* ── nagłówek wykresu ──────────────────────────────────────────────────────── */

export interface SeriesHead {
  /** „+38:10", „1 118 L"; `null` = za mało punktów, żeby cokolwiek policzyć. */
  value: string | null;
  /** „w 90 dni", „zużyte w 90 dni · 5 tankowań". */
  note: string;
}

/**
 * Licznik: przyrost między pierwszym a ostatnim odczytem okna. Paliwo: suma spadków
 * WEWNĄTRZ operacji (przejęcie→zdanie, tankowanie→zdanie) - postój między operacjami
 * nie jest zużyciem, choć poziom bywa wtedy inny (dolewka poza aplikacją); tankowań
 * tyle, ile punktów `refuel`.
 */
export function seriesHead(kind: SeriesKind, points: readonly SeriesPoint[], mhFormat: 'hhmm' | 'decimal', days: number): SeriesHead {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  if (kind === 'mh') {
    if (sorted.length < 2) return { value: null, note: `w ${days} dni` };
    const delta = sorted[sorted.length - 1]!.value - sorted[0]!.value;
    return { value: `${delta >= 0 ? '+' : '−'}${motoHours(Math.abs(delta), mhFormat)}`, note: `w ${days} dni` };
  }
  let used = 0;
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (a.sessionUuid != null && a.sessionUuid === b.sessionUuid && a.source !== 'release' && b.value < a.value) {
      used += a.value - b.value;
    }
  }
  const refuels = sorted.filter((p) => p.source === 'refuel').length;
  const note = [`zużyte w ${days} dni`, refuels > 0 ? `${refuels} ${plural(refuels, 'tankowanie', 'tankowania', 'tankowań')}` : null]
    .filter((x): x is string => x != null)
    .join(' · ');
  return { value: sorted.length < 2 ? null : litres(used), note };
}
