/**
 * UZ Aero — panel: odczyt listy kont (`A06`).
 *
 * ══ DLACZEGO ZWYKŁE `useQuery`, A NIE `useInfiniteQuery` ══
 * Bo trasa nie ma kursora i mieć go nie musi: klub ma kilkanaście kont, a lista jest
 * jednocześnie SŁOWNIKIEM pilotów dla filtrów innych ekranów. Lista, którą trzeba
 * doładowywać stronami, nie nadaje się do rozwijanego filtra — i to jest powód,
 * dla którego kształt tej trasy różni się od dni lotnych i dziennika audytu.
 *
 * Hook jest cienki z zasady: decyzja o treści ekranu mieszka w czystych modułach
 * `screens/pilots/*.ts`, a tutaj zostaje wyłącznie to, co dotyczy cache'u.
 */

import { useQuery } from '@tanstack/react-query';

import type { PilotPageDto } from '../api/dto';
import { listPilots, type PilotListQuery } from '../api/pilots';
import { keys } from './keys';

export function usePilots(query: PilotListQuery, enabled = true) {
  return useQuery<PilotPageDto>({
    queryKey: keys.pilots.list(query),
    queryFn: () => listPilots(query),
    enabled,
  });
}
