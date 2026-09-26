/**
 * Ninerdeck - panel: ścieżka akceptacji i kolejka decyzji - odczyty i dwa zapisy
 * (milestone 3.1.0, issue #165).
 *
 * Warstwa `queries/` zna sieć (`api/`) i cache, ale nie zna ekranu.
 *
 * ══ `enabled` JEST PARAMETREM, BO OBA ODCZYTY MAJĄ WŁASNĄ ZDOLNOŚĆ ══
 * Ścieżkę czyta wyłącznie `accounts.manage` (to rozdanie władzy: kto ma prawo zablokować
 * cudzy lot), kolejkę - `reservations.approve` (moje kroki). Pytanie zadane bez zdolności
 * wróciłoby 403 i zapaliło baner błędu na ekranie, na którym nic złego się nie stało -
 * ta sama reguła, co przy kolejce zgłoszeń kodem klubu.
 *
 * ══ DECYZJA UNIEWAŻNIA KOLEJKĘ I KALENDARZ ══
 * Zatwierdzona sprawa znika z kolejki i zmienia pasek na siatce (ramka przestaje być
 * przerywana), a odmowa zwalnia termin. Mutacja deklaruje swoje unieważnienia TUTAJ,
 * a nie na ekranie - kolejka i szuflada zajętości wołają tę samą i nie mogą pamiętać
 * dwóch różnych list.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  decideBooking,
  getAircraftPreview,
  getApprovalQueue,
  getApprovalSteps,
  getPilotPreview,
  replaceApprovalSteps,
  type DecisionBody,
} from '../api/approvals';
import type {
  AircraftPreviewDto,
  ApprovalPathDto,
  ApprovalQueueDto,
  ApprovalStepInputDto,
  PilotPreviewDto,
} from '../api/dto';
import { keys } from './keys';

export function useApprovalSteps(enabled: boolean) {
  return useQuery<ApprovalPathDto>({
    queryKey: keys.approvals.steps,
    queryFn: getApprovalSteps,
    enabled,
  });
}

/**
 * Zapis CAŁEJ ścieżki. Odpowiedzi NIE wstawiamy do cache'u ręcznie, choć jest kompletna:
 * zapis przestawia sprawy w toku (§11.2), więc kolejka też się starzeje - a jedno
 * unieważnienie korzenia obsługuje obie listy naraz.
 */
export function useReplaceApprovalSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (steps: readonly ApprovalStepInputDto[]) => replaceApprovalSteps(steps),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.approvals.all });
      // Zapis ścieżki potwierdza sprawy z kompletem zgód (issue #207), więc pasek na osi
      // floty zmienia kształt - kalendarz ma to zobaczyć bez odświeżania karty.
      void qc.invalidateQueries({ queryKey: keys.calendar.all });
    },
  });
}

export function useApprovalQueue(enabled: boolean) {
  return useQuery<ApprovalQueueDto>({
    queryKey: keys.approvals.queue,
    queryFn: getApprovalQueue,
    enabled,
  });
}

export function useDecideBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DecisionBody }) => decideBooking(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.approvals.all });
      void qc.invalidateQueries({ queryKey: keys.calendar.all });
    },
  });
}

/**
 * Podgląd pilota przy decyzji (issue #206). `null` = szuflada nie jest otwarta na
 * pilocie - zapytanie śpi, a nie pyta serwer o nic.
 */
export function usePilotPreview(target: { bookingId: string; pilotId: string } | null) {
  return useQuery<PilotPreviewDto>({
    queryKey: keys.approvals.pilotPreview(target?.bookingId ?? '', target?.pilotId ?? ''),
    queryFn: () => getPilotPreview(target!.bookingId, target!.pilotId),
    enabled: target != null,
  });
}

export function useAircraftPreview(bookingId: string | null) {
  return useQuery<AircraftPreviewDto>({
    queryKey: keys.approvals.aircraftPreview(bookingId ?? ''),
    queryFn: () => getAircraftPreview(bookingId!),
    enabled: bookingId != null,
  });
}
