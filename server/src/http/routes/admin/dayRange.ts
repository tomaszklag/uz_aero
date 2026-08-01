/**
 * UZ Aero (serwer) — zakres DAT w query stringu tras panelu.
 *
 * Panel filtruje po DNIACH, nie po stemplach, bo tak wygląda kalendarz na `A02`
 * i pasek zakresu na `A09`. Parser stoi w osobnym pliku, bo używają go co najmniej
 * dwie trasy (dni lotne, dziennik audytu), a druga kopia tej samej reguły to
 * najkrótsza droga do listy, która gubi ostatni dzień tylko na jednym ekranie.
 */

import { z } from 'zod';

/** Dzień jako `YYYY-MM-DD` w UTC → północ tego dnia (epoch ms). */
export const dayParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'oczekiwano daty YYYY-MM-DD (UTC)')
  .transform((value) => {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  });

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Górna granica zakresu jako KONIEC doby, nie jej początek.
 *
 * Zakres jest obustronnie DOMKNIĘTY: `do=2026-07-31` obejmuje cały 31 lipca do
 * 23:59:59.999 UTC. Inaczej „od 25 do 31" gubiłoby ostatni dzień — najbardziej
 * nieoczywisty możliwy sposób na zgubienie danych w narzędziu nadzoru.
 */
export function endOfDay(dayStartMs: number | undefined): number | undefined {
  return dayStartMs === undefined ? undefined : dayStartMs + DAY_MS - 1;
}
