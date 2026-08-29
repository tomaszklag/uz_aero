/**
 * UZ Aero - panel: WYKRES „nalot dzień po dniu" (moduł CZYSTY) - geometria SVG.
 *
 * Dane przychodzą z serwera JAKO SZEREG (dzień → blok); ten moduł liczy WYŁĄCZNIE
 * geometrię rysunku: współrzędne polyline w viewBoxie 600×96 mockupu, kropki dni
 * zerowych i podpisy osi. To ta sama granica, co `dashboardSpark.ts` na pulpicie -
 * geometria nie jest metryką, a metryk ten moduł nie tworzy.
 *
 * Dzień zerowy dostaje KROPKĘ na osi zamiast zwykłego punktu - mockup mówi wprost:
 * to „dzień bez ani jednej sesji - nie brak danych", więc ma być widoczny, nie pusty.
 */

import { duration } from '@uzaero/format';

import type { StatsDailyPointDto } from '../../api/dto';
import { dayShort } from './statsFormat';

/** Geometria viewBoxu z mockupu: 600×96, podłoga na 85, sufit (maksimum) na 5. */
const WIDTH = 600;
const FLOOR_Y = 85;
const CEIL_Y = 5;

const HOUR_MS = 3_600_000;

export interface TrendView {
  /** Punkty polyline `„x,y x,y …"` - jeden na dzień kalendarzowy zakresu. */
  points: string;
  /** Kropki dni ZEROWYCH na osi (dzień bez sesji jest widoczny, nie pusty). */
  zeroDots: { key: string; x: number }[];
  /** Ostatni punkt szeregu - wyróżniony jak w mockupie. */
  lastDot: { x: number; y: number } | null;
  /** Do pięciu podpisów osi - pierwszy, ćwiartki i ostatni dzień. */
  axis: string[];
  /** Plakietka „max 10.2 h · 27 JUL"; `null` przy zakresie bez nalotu. */
  maxLabel: string | null;
  /** Plakietka „suma 186:39". */
  sumLabel: string;
  /** Przypis o dniach zerowych; `null`, gdy każdy dzień miał nalot. */
  zeroNote: string | null;
}

export function trendView(daily: StatsDailyPointDto[]): TrendView | null {
  if (daily.length === 0) return null;

  const max = daily.reduce((acc, point) => Math.max(acc, point.blockMs), 0);
  const spanX = daily.length > 1 ? WIDTH / (daily.length - 1) : 0;
  const xOf = (index: number): number =>
    daily.length === 1 ? WIDTH / 2 : round1(index * spanX);
  const yOf = (blockMs: number): number =>
    max === 0 ? FLOOR_Y : round1(FLOOR_Y - (blockMs / max) * (FLOOR_Y - CEIL_Y));

  const points = daily.map((point, index) => `${xOf(index)},${yOf(point.blockMs)}`).join(' ');
  const zeroDots = daily
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.blockMs === 0)
    .map(({ point, index }) => ({ key: point.day, x: xOf(index) }));

  const last = daily[daily.length - 1]!;
  const peak = daily.reduce((acc, point) => (point.blockMs > acc.blockMs ? point : acc), daily[0]!);
  const sum = daily.reduce((acc, point) => acc + point.blockMs, 0);

  return {
    points,
    zeroDots,
    lastDot: { x: xOf(daily.length - 1), y: yOf(last.blockMs) },
    axis: axisTicks(daily),
    maxLabel:
      max === 0 ? null : `max ${(peak.blockMs / HOUR_MS).toFixed(1)} h · ${dayShort(peak.day)}`,
    sumLabel: `suma ${duration(sum)}`,
    zeroNote: zeroNote(zeroDots.map((dot) => dot.key)),
  };
}

/** Zaokrąglenie współrzędnej do 0.1 - SVG nie potrzebuje piętnastu miejsc. */
const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Pierwszy dzień, ćwiartki i ostatni - bez duplikatów przy krótkich zakresach. */
function axisTicks(daily: StatsDailyPointDto[]): string[] {
  const last = daily.length - 1;
  const indexes = [0, Math.round(last * 0.25), Math.round(last * 0.5), Math.round(last * 0.75), last];
  const unique = [...new Set(indexes)];
  return unique.map((index) => dayShort(daily[index]!.day));
}

/** Do sześciu dni zerowych wypisujemy imiennie; dalej liczba mówi za listę. */
const ZERO_LIST_LIMIT = 6;

function zeroNote(zeroDays: string[]): string | null {
  if (zeroDays.length === 0) return null;
  const shown = zeroDays.slice(0, ZERO_LIST_LIMIT).map(dayShort).join(', ');
  const suffix = zeroDays.length > ZERO_LIST_LIMIT ? ', …' : '';
  const label =
    zeroDays.length === 1
      ? `Jeden dzień bez nalotu (${shown})`
      : `${zeroDays.length} dni bez nalotu (${shown}${suffix})`;
  return `${label} to dni bez ani jednej sesji - nie brak danych. Dzień bez \`session_claim\` nie istnieje w rejestrze i panel go nie zmyśla.`;
}
