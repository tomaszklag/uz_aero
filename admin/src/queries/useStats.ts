/**
 * UZ Aero - panel: odczyt statystyk (`A10`).
 *
 * Hook jest cienki z zasady - decyzje o treści mieszkają w czystych modułach
 * `screens/stats/*.ts`. Domyślne 30 s `staleTime` z `queries/client.ts` zostaje:
 * raport opisuje dni ZAMKNIĘTE, więc nie starzeje się z sekundy na sekundę jak pulpit,
 * a seria przełączeń ujęcia nie ma prawa robić burzy żądań o te same sumy.
 */

import { useQuery } from '@tanstack/react-query';

import type { StatsReportDto } from '../api/dto';
import { getStats, type StatsQuery } from '../api/stats';
import { keys } from './keys';

export function useStats(query: StatsQuery) {
  return useQuery<StatsReportDto>({
    queryKey: keys.stats.report(query),
    queryFn: () => getStats(query),
  });
}
