/**
 * Ninerdeck - ODSTĘP WZNOWIENIA ŁĄCZA KANAŁU KLUBU (4.0.0, `docs/kanal-klubu.md` §3.3,
 * ryzyko KK2; epik KK-C #246).
 *
 * Rosnący i z rozrzutem: po restarcie serwera każdy telefon wraca w INNEJ chwili, zamiast
 * uderzyć w niego naraz z całym klubem. Połowa odstępu jest stała, połowa losowa - żaden
 * telefon nie czeka dłużej, niż mówi sufit, a żadne dwa nie wracają w tej samej sekundzie.
 * Ta sama reguła, co w panelu (`admin/src/live/reconnect.ts`): dwie powierzchnie jednego
 * serwera mają mu oszczędzać ten sam szczyt.
 */

export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

/** `attempt` = ile prób z rzędu się nie udało (0 = pierwsze wznowienie po zerwaniu). */
export function reconnectDelay(attempt: number, random: () => number): number {
  const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
