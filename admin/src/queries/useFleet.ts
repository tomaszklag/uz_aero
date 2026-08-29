/**
 * UZ Aero - panel: odczyt floty (`A07`) i progu flagi paliwa (`A07a`).
 *
 * ══ DLACZEGO ZWYKŁE `useQuery`, A NIE `useInfiniteQuery` ══
 * Bo trasa nie ma kursora i mieć go nie musi: klub ma kilka jednostek, a lista jest
 * jednocześnie SŁOWNIKIEM samolotów dla filtrów innych ekranów (`A02`). Lista, którą
 * trzeba doładowywać stronami, nie nadaje się do rozwijanego filtra - i to jest powód,
 * dla którego kształt tej trasy różni się od dni lotnych i dziennika audytu.
 *
 * Hooki są cienkie z zasady: decyzja o treści ekranu mieszka w czystych modułach
 * `screens/fleet/*.ts`, a tutaj zostaje wyłącznie to, co dotyczy cache'u.
 */

import { useQuery } from '@tanstack/react-query';

import type { AircraftToleranceDto, FleetPageDto } from '../api/dto';
import { getFuelTolerance, listFleet, type FleetListQuery } from '../api/fleet';
import { keys } from './keys';

export function useFleet(query: FleetListQuery = {}, enabled = true) {
  return useQuery<FleetPageDto>({
    queryKey: keys.fleet.list(query),
    queryFn: () => listFleet(query),
    enabled,
  });
}

/**
 * Próg `FUEL_MISMATCH` dla pojemności wpisywanej w formularzu.
 *
 * `staleTime: Infinity`, bo `max(10 L, 5% pojemności)` jest funkcją CZYSTĄ - odpowiedź
 * dla 1100 L nigdy się nie zestarzeje, więc odświeżanie jej przy powrocie do karty
 * byłoby żądaniem o wynik, który już mamy.
 *
 * Zapytanie jest wyłączone przy pojemności niepoprawnej, bo „jaki próg dla pustego
 * pola" nie jest pytaniem - a nie dlatego, że panel musi cokolwiek ratować. Do
 * 2026-08-01 ten warunek BYŁ jedyną obroną: trasa odpowiadała progiem na `0`, `-500`,
 * pusty parametr i `1e300`, czyli reguła „dopuszczalna pojemność" siedziała w panelu,
 * dokładnie tam, gdzie ten przekrój deklaruje, że jej nie ma. Dziś `GET /fleet/tolerance`
 * waliduje tak samo jak zapis: kształt spoza zakresu → `400 bad_request`, wartość ≤ 0
 * (w tym pusty parametr, który koercja zamienia w `0`) → `409 capacity_not_positive`.
 */
export function useFuelTolerance(capacityL: number | null) {
  return useQuery<AircraftToleranceDto>({
    queryKey: keys.fleet.tolerance(capacityL ?? 0),
    queryFn: () => getFuelTolerance(capacityL as number),
    enabled: capacityL != null && capacityL > 0,
    staleTime: Infinity,
  });
}
