/**
 * UZ Aero - panel 2.0: decyzje o zgłoszeniach rejestracyjnych.
 *
 * Mutacja deklaruje SWOJE unieważnienia tutaj, a nie na ekranie: dwa ekrany wołające
 * tę samą mutację nie mogą pamiętać dwóch różnych list.
 *
 * == ZATWIERDZENIE UNIEWAZNIA DWIE LISTY ==
 * Zgłoszeń - bo wiersz zmienia status - i PILOTÓW, bo zatwierdzenie ZAKŁADA konto.
 * Odrzucenie tyka wyłącznie zgłoszeń. Zwróconego konta nie wstawiamy do cache'u
 * (ta sama zasada, co w `usePilotCommands.ts`): serwer składa wiersz skrótem, a prawda
 * przychodzi z odświeżonej listy.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  approveRegistration,
  rejectRegistration,
  type ApproveRegistrationBody,
} from '../api/registrations';
import { keys } from './keys';

export function useApproveRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      provider,
      subject,
      body,
    }: {
      provider: string;
      subject: string;
      body: ApproveRegistrationBody;
    }) => approveRegistration(provider, subject, body),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.registrations.all }),
        qc.invalidateQueries({ queryKey: keys.pilots.all }),
      ]),
  });
}

export function useRejectRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, subject, reason }: { provider: string; subject: string; reason: string }) =>
      rejectRegistration(provider, subject, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.registrations.all }),
  });
}
