/**
 * UZ Aero - panel: kolejka zgłoszeń kodem klubu i decyzje o nich (issue #101, E3).
 *
 * Warstwa `queries/` zna sieć (`api/`) i cache, ale nie zna ekranu.
 *
 * ══ KAZDA DECYZJA UNIEWAZNIA OBA KORZENIE ══
 * Zatwierdzenie przenosi osobę z kolejki na listę członków, więc obie listy się
 * starzeją. Odrzucenie i cofnięcie odrzucenia ruszają samą kolejkę, ale unieważniają
 * tak samo: mutacja deklaruje swoje unieważnienia TUTAJ, a nie na ekranie, i trzy
 * decyzje o jednym bycie nie mogą pamiętać trzech różnych list.
 *
 * Zwróconego wiersza NIE wstawiamy do tabeli (`setQueryData`) - ta sama zasada, co przy
 * kontach: serwer składa go skrótem, a prawda przychodzi z odświeżonej listy.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { MembershipApprovalBody, MembershipQueueDto } from '../api/dto';
import {
  approveMembership,
  listPendingMemberships,
  rejectMembership,
  reopenMembership,
} from '../api/memberships';
import { keys } from './keys';

/**
 * Kolejka zgłoszeń. `enabled` jest parametrem, bo kartę widzi WYŁĄCZNIE konto
 * z `accounts.manage` - pytanie zadane bez tej zdolności wróciłoby 403 i zapaliło
 * baner błędu na ekranie, na którym nic złego się nie stało.
 */
export function usePendingMemberships(enabled: boolean) {
  return useQuery<MembershipQueueDto>({
    queryKey: keys.memberships.pending,
    queryFn: listPendingMemberships,
    enabled,
  });
}

const invalidateDecision = async (qc: QueryClient): Promise<void> => {
  await qc.invalidateQueries({ queryKey: keys.memberships.all });
  await qc.invalidateQueries({ queryKey: keys.pilots.all });
};

export function useApproveMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pilotId, body }: { pilotId: string; body: MembershipApprovalBody }) =>
      approveMembership(pilotId, body),
    onSuccess: () => invalidateDecision(qc),
  });
}

export function useRejectMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pilotId, reason }: { pilotId: string; reason: string }) =>
      rejectMembership(pilotId, reason),
    onSuccess: () => invalidateDecision(qc),
  });
}

/**
 * Cofnięcie odrzucenia - OSOBNA mutacja, nie „zatwierdź mimo odrzucenia": zdjęcie cudzej
 * odmowy i wpuszczenie do klubu to dwie decyzje i każda ma własny wpis w dzienniku.
 */
export function useReopenMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pilotId: string) => reopenMembership(pilotId),
    onSuccess: () => invalidateDecision(qc),
  });
}
