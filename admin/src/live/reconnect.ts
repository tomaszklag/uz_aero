/**
 * Ninerdeck - panel: ODSTĘP WZNOWIENIA KANAŁU KLUBU (4.0.0, `docs/kanal-klubu.md` §3.3,
 * ryzyko KK2; epik KK-D #246).
 *
 * Rosnący i z rozrzutem: po restarcie serwera każda otwarta karta panelu wraca w INNEJ
 * chwili, zamiast uderzyć w niego naraz. Połowa odstępu jest stała, połowa losowa - żadna
 * karta nie czeka dłużej, niż mówi sufit, a żadne dwie nie wracają w tej samej sekundzie.
 */

export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

/** `attempt` = ile prób z rzędu się nie udało (0 = pierwsze wznowienie po zerwaniu). */
export function reconnectDelay(attempt: number, random: () => number): number {
  const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
