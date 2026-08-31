/**
 * UZ Aero - panel 2.0: flota - lista, próg paliwa i zapisy konfiguracji.
 *
 * Lista i próg mieszkają w jednym pliku, bo to jeden zasób; różnią się natomiast
 * czasem życia i dlatego mają osobne klucze (`queries/keys.ts`).
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { AircraftToleranceDto, FleetPageDto } from '../api/dto';
import {
  createAircraft,
  deleteAircraft,
  getFuelTolerance,
  listFleet,
  updateAircraft,
  type CreateAircraftBody,
  type FleetListQuery,
  type UpdateAircraftBody,
} from '../api/fleet';
import { keys } from './keys';

export function useFleet(query: FleetListQuery) {
  return useQuery<FleetPageDto>({
    queryKey: keys.fleet.list(query),
    queryFn: () => listFleet(query),
  });
}

/**
 * Próg rozjazdu paliwa dla pojemności WPISYWANEJ w formularzu.
 *
 * `enabled` gasi zapytanie dla wartości, których serwer i tak nie policzy (pole puste,
 * zero, wartość ujemna): trasa odpowiada na nie odmową `409`, a odmowa w tle formularza
 * zamieniłaby podpowiedź w czerwony stan błędu przy każdym wykasowaniu pola.
 *
 * `staleTime: Infinity`, bo `max(10 L, 5%)` nie zmienia się między żądaniami - to
 * funkcja czysta, tylko policzona po drugiej stronie sieci.
 */
export function useFuelTolerance(capacityL: number | null) {
  const valid = capacityL != null && Number.isFinite(capacityL) && capacityL > 0;
  return useQuery<AircraftToleranceDto>({
    queryKey: keys.fleet.tolerance(valid ? capacityL : 0),
    queryFn: () => getFuelTolerance(capacityL as number),
    enabled: valid,
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Unieważniamy WYŁACZNIE listy - nigdy prefiksu `['fleet']`.
 *
 * Powód stoi przy kluczu: pod tym samym prefiksem żyje próg, który jest funkcją czystą
 * i jest w tej chwili aktywnym zapytaniem otwartego formularza.
 */
const invalidateFleet = (qc: QueryClient): Promise<void> =>
  qc.invalidateQueries({ queryKey: keys.fleet.lists });

export function useCreateAircraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAircraftBody) => createAircraft(body),
    onSuccess: () => invalidateFleet(qc),
  });
}

export function useUpdateAircraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAircraftBody }) =>
      updateAircraft(id, body),
    onSuccess: () => invalidateFleet(qc),
  });
}

/**
 * TRWAŁE usunięcie jednostki - nieodwracalne, więc ekran pyta o potwierdzenie.
 *
 * Unieważnia same listy, jak reszta mutacji floty: próg paliwa jest funkcją czystą
 * i skasowanie jednostki nie ma jak go zmienić.
 */
export function useDeleteAircraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAircraft(id),
    onSuccess: () => invalidateFleet(qc),
  });
}
