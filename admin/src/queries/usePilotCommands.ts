/**
 * UZ Aero - panel 2.0: zapisy na kontach pilotów.
 *
 * Mutacja deklaruje SWOJE unieważnienia tutaj, a nie na ekranie: dwa ekrany wołające
 * tę samą mutację nie mogą pamiętać dwóch różnych list.
 *
 * == WSZYSTKIE CZTERY UNIEWAZNIAJA CALY KORZEN `pilots` I ANI JEDNA NIE WSTAWIA
 *    ZWROCONEGO WIERSZA DO TABELI ==
 * Serwer składa wiersz w odpowiedzi mutacji skrótem (`accountToWire` w
 * `server/src/http/routes/admin/pilots.ts`): oddaje tożsamość i status konta, ale
 * statystyki podaje zerami, a stempel zmiany bierze z chwili odpowiedzi. Wpisanie go
 * do cache'u przez `setQueryData` byłoby więc wstawieniem do tabeli wiersza, który
 * w bazie wygląda inaczej. Prawda przychodzi z odświeżonej listy - to kosztuje jedno
 * żądanie i nie kosztuje ani jednej niespójności.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  createPilot,
  deletePilot,
  resetPilotPassword,
  setPilotActive,
  updatePilot,
  type CreatePilotBody,
  type UpdatePilotBody,
} from '../api/pilots';
import { keys } from './keys';

/** Jedno unieważnienie dla wszystkich czterech mutacji - patrz nagłówek pliku. */
const invalidatePilots = (qc: QueryClient): Promise<void> =>
  qc.invalidateQueries({ queryKey: keys.pilots.all });

export function useCreatePilot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePilotBody) => createPilot(body),
    onSuccess: () => invalidatePilots(qc),
  });
}

export function useUpdatePilot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePilotBody }) => updatePilot(id, body),
    onSuccess: () => invalidatePilots(qc),
  });
}

/**
 * Włączenie i wyłączenie dostępu.
 *
 * Osobna mutacja, nie parametr `useUpdatePilot`, bo to osobna trasa i osobna operacja:
 * wyłączenie konta zrywa w jednej transakcji wszystkie sesje telefonu i unieważnia
 * żywą sesję panelu. Sklejenie jej z poprawianiem nazwiska ukryłoby ten skutek.
 */
export function useSetPilotActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setPilotActive(id, active),
    onSuccess: () => invalidatePilots(qc),
  });
}

/**
 * Reset hasła.
 *
 * Odpowiedź niesie hasło JEDEN RAZ - nie ma trasy „pokaż ponownie". Ekran pokazuje je
 * i zapomina razem z zamknięciem formularza; do cache'u nie trafia, bo cache przeżywa
 * zamknięcie ekranu, a hasło nie ma prawa.
 */
export function useResetPilotPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resetPilotPassword(id),
    onSuccess: () => invalidatePilots(qc),
  });
}

/**
 * TRWAŁE usunięcie konta - jedyna nieodwracalna operacja w tym panelu.
 *
 * Unieważnia listę jak reszta mutacji; ekran zamyka po niej kartę, bo konta, którego
 * dotyczyła, już nie ma i nie ma czego pokazać.
 */
export function useDeletePilot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePilot(id),
    onSuccess: () => invalidatePilots(qc),
  });
}
