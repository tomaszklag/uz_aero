/**
 * UZ Aero — panel: „Nalot: blok vs czas lotu" i „Wykorzystanie floty" (moduł CZYSTY).
 *
 * Dwa boczne wykresy mockupu `A10`. Liczby (blok, lot, dni aktywne, procent
 * wykorzystania) przychodzą z serwera; ten moduł liczy wyłącznie GEOMETRIĘ pasków
 * (szerokości względem maksimum) i składa podpisy.
 */

import { duration } from '@uzaero/format';

import type { StatsAircraftItemDto } from '../../api/dto';
import { DASH, pct0 } from './statsFormat';

/** Wiersz pary pasków: blok (zielony, pełna skala) i lot (niebieski, ta sama skala). */
export interface DuoRowView {
  key: string;
  name: string;
  blockWidth: string;
  blockLabel: string;
  flightWidth: string;
  flightLabel: string;
}

/** Wiersz miernika wykorzystania: `21 · 70 %` na torze z twardą krawędzią. */
export interface MeterRowView {
  key: string;
  name: string;
  width: string;
  /** Poniżej progu połowy zakresu miernik świeci bursztynem (mockup: 47 % amber). */
  amber: boolean;
  label: string;
}

/**
 * Wykorzystanie poniżej POŁOWY dni zakresu jest bursztynowe. Próg wynika z mockupu
 * (70 % i 60 % zielone, 47 % amber) — to sygnał „jednostka stoi częściej, niż lata",
 * nie alarm; dokładna wartość progu jest decyzją prezentacji, nie serwera.
 */
const METER_AMBER_BELOW_PCT = 50;

const nameOf = (row: StatsAircraftItemDto): string => row.reg ?? row.aircraftId;

/** Szerokość jako `%` z jednym miejscem — geometria, jak wysokości w `dashboardSpark`. */
const widthPct = (value: number, max: number): string =>
  max <= 0 ? '0%' : `${((value / max) * 100).toFixed(1)}%`;

/** Pary pasków w porządku serwera (malejąco po bloku) — wspólna skala = max bloku. */
export function duoRows(aircraft: StatsAircraftItemDto[]): DuoRowView[] {
  const max = aircraft.reduce((acc, row) => Math.max(acc, row.blockMs), 0);
  return aircraft.map((row) => ({
    key: row.aircraftId,
    name: nameOf(row),
    blockWidth: widthPct(row.blockMs, max),
    blockLabel: duration(row.blockMs),
    flightWidth: widthPct(row.flightMs, max),
    flightLabel: duration(row.flightMs),
  }));
}

export function meterRows(aircraft: StatsAircraftItemDto[]): MeterRowView[] {
  return aircraft.map((row) => ({
    key: row.aircraftId,
    name: nameOf(row),
    width: row.utilizationPct == null ? '0%' : `${row.utilizationPct.toFixed(1)}%`,
    amber: row.utilizationPct != null && row.utilizationPct < METER_AMBER_BELOW_PCT,
    label: row.utilizationPct == null ? DASH : `${row.activeDays} · ${pct0(row.utilizationPct)}`,
  }));
}
