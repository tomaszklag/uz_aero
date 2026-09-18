/**
 * Ninerdeck - panel 2.0: zapisy na kontach pilotów.
 *
 * Mutacja deklaruje SWOJE unieważnienia tutaj, a nie na ekranie: dwa ekrany wołające
 * tę samą mutację nie mogą pamiętać dwóch różnych list.
 *
 * == WSZYSTKIE UNIEWAZNIAJA CALY KORZEN `pilots` I ANI JEDNA NIE WSTAWIA
 *    ZWROCONEGO WIERSZA DO TABELI ==
 * Serwer składa wiersz w odpowiedzi mutacji skrótem (`accountToWire` w
 * `server/src/http/routes/admin/pilots.ts`): oddaje tożsamość i status konta, ale
 * statystyki podaje zerami, a stempel zmiany bierze z chwili odpowiedzi. Wpisanie go
 * do cache'u przez `setQueryData` byłoby więc wstawieniem do tabeli wiersza, który
 * w bazie wygląda inaczej. Prawda przychodzi z odświeżonej listy - to kosztuje jedno
 * żądanie i nie kosztuje ani jednej niespójności.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  deletePilot,
  pilotSessions,
  revokeAllPilotSessions,
  revokePilotSession,
  sendPasswordLink,
  setPilotActive,
  updatePilot,
  type UpdatePilotBody,
} from '../api/pilots';
import { keys } from './keys';

/** Jedno unieważnienie dla wszystkich trzech mutacji - patrz nagłówek pliku. */
const invalidatePilots = (qc: QueryClient): Promise<void> =>
  qc.invalidateQueries({ queryKey: keys.pilots.all });

// `useCreatePilot` odeszło razem z `POST /pilots` (issue #100, D3): z panelu klubu nie
// da się nikogo dopisać. Mutacje zatwierdzenia i odrzucenia zgłoszenia dochodzą w epiku E.

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

// -- dostęp członka: link „ustaw hasło" i urządzenia (2.1.0, issue #134 D4) -----

/**
 * „Wyślij link do ustawienia hasła".
 *
 * Bez unieważnień i to jest treść, nie przeoczenie: list nie zmienia w klubie NICZEGO -
 * metody logowania urosną dopiero wtedy, gdy adresat naprawdę ustawi hasło, a tego
 * panel nie zobaczy bez odświeżenia listy przy najbliższej okazji. Potwierdzenie
 * („wysłano na … · ważny godzinę") trzyma ekran, bo dotyczy TEGO kliknięcia.
 */
export function useSendPasswordLink() {
  return useMutation({ mutationFn: (id: string) => sendPasswordLink(id) });
}

/**
 * Urządzenia członka w tym klubie.
 *
 * `enabled` wyłącza zapytanie bez `accounts.manage`: bez tej zdolności odpowiedź byłaby
 * 403, czyli czerwony baner na karcie, na której nic złego się nie stało - ta sama
 * reguła, co przy kolejce zgłoszeń i kodzie klubu.
 */
export function usePilotSessions(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: keys.pilots.sessions(id ?? ''),
    queryFn: () => pilotSessions(id!),
    enabled: enabled && id != null,
  });
}

/**
 * „Wyloguj" przy wierszu i „Wyloguj wszędzie w tym klubie".
 *
 * Obie unieważniają korzeń `pilots`, nie samą listę urządzeń: „ostatnio aktywny"
 * w wierszu listy członków liczy się z TYCH SAMYCH sesji, więc lista, która nie
 * wie o wylogowaniu, pisałaby „ostatnio 3 min temu" o urządzeniu właśnie odciętym.
 */
export function useRevokePilotSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sessionId }: { id: string; sessionId: string }) =>
      revokePilotSession(id, sessionId),
    onSuccess: () => invalidatePilots(qc),
  });
}

export function useRevokeAllPilotSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeAllPilotSessions(id),
    onSuccess: () => invalidatePilots(qc),
  });
}
