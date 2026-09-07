/**
 * UZ Aero - panel 2.0: lista kont pilotów.
 *
 * Warstwa `queries/` zna sieć (`api/`) i cache, ale nie zna ekranu: hook oddaje dane,
 * a co z nich narysować, decyduje `screens/`.
 */

import { useQuery } from '@tanstack/react-query';

import type { PilotPageDto } from '../api/dto';
import { listPilots, type PilotListQuery } from '../api/pilots';
import { keys } from './keys';

/**
 * Górna granica listy kont.
 *
 * Nie jest stronicowaniem, tylko bezpiecznikiem: klub ma kilkanaście kont, a lista,
 * którą trzeba przewijać stronami, przestaje nadawać się na słownik do wyszukiwarki.
 * Gdy `total` z odpowiedzi przekroczy tę liczbę, ekran powie o tym wprost - lista
 * przycięta po cichu wygląda jak komplet.
 */
export const PILOT_LIST_LIMIT = 200;

export function usePilots(query: Omit<PilotListQuery, 'limit'>) {
  const full: PilotListQuery = { ...query, limit: PILOT_LIST_LIMIT };
  return useQuery<PilotPageDto>({
    queryKey: keys.pilots.list(full),
    queryFn: () => listPilots(full),
  });
}
