/**
 * Ninerdeck - panel: kod klubu - odczyt i dwie czynności (issue #101, E3).
 *
 * Rotacja i wyłączenie oddają NOWY STAN karty, więc tu - inaczej niż przy kontach -
 * wstawiamy odpowiedź do cache'u zamiast unieważniać: kod jest całą treścią odpowiedzi
 * (serwer nie składa go skrótem), a wylosowany kod, którego karta nie pokazuje od razu,
 * jest kodem, którego administrator nie ma jak podać pilotom.
 *
 * Kolejkę zgłoszeń rotacja unieważnia mimo to: karta kodu pisze, ile zgłoszeń czeka
 * BIEŻĄCYM kodem, a ta liczba po rotacji spada do zera.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { disableClubCode, getClubCode, rotateClubCode } from '../api/clubCode';
import type { ClubCodeDto } from '../api/dto';
import { keys } from './keys';

/**
 * `enabled` jest parametrem, bo kod widzi WYŁĄCZNIE konto z `accounts.manage`: kod jest
 * włącznikiem jedynej drogi do klubu, więc jego odczyt jest tą samą władzą, co decyzja
 * o zgłoszeniu. Pytanie zadane bez tej zdolności wróciłoby 403 i zapaliło baner błędu.
 */
export function useClubCode(enabled: boolean) {
  return useQuery<ClubCodeDto>({
    queryKey: keys.clubCode,
    queryFn: getClubCode,
    enabled,
  });
}

const applyState = (qc: QueryClient, state: ClubCodeDto): void => {
  qc.setQueryData(keys.clubCode, state);
  void qc.invalidateQueries({ queryKey: keys.memberships.all });
};

export function useRotateClubCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rotateClubCode,
    onSuccess: (state) => applyState(qc, state),
  });
}

export function useDisableClubCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: disableClubCode,
    onSuccess: (state) => applyState(qc, state),
  });
}
