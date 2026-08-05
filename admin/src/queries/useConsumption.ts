/**
 * UZ Aero — panel: odczyt analityki zużycia (`A10a`, `A10b`).
 *
 * Hook cienki jak reszta — decyzje o treści mieszkają w czystych modułach
 * `screens/consumption/*.ts`. Raport dotyczy dni ZAMKNIĘTYCH, więc nie starzeje się
 * z sekundy na sekundę; domyślne 30 s `staleTime` z `queries/client.ts` zostaje.
 */

import { useQuery } from '@tanstack/react-query';

import type { ConsumptionReportDto } from '../api/dto';
import { getConsumption, type ConsumptionQuery } from '../api/consumption';
import { keys } from './keys';

export function useConsumption(query: ConsumptionQuery) {
  return useQuery<ConsumptionReportDto>({
    queryKey: keys.consumption.report(query),
    queryFn: () => getConsumption(query),
  });
}
