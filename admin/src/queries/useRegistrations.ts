/**
 * UZ Aero - panel 2.0: kolejka zgłoszeń rejestracyjnych (logowanie Google).
 *
 * Warstwa `queries/` zna sieć (`api/`) i cache, ale nie zna ekranu: hook oddaje dane,
 * a co z nich narysować, decyduje `screens/`.
 */

import { useQuery } from '@tanstack/react-query';

import type { RegistrationPageDto, RegistrationStatusDto } from '../api/dto';
import { listRegistrations } from '../api/registrations';
import { keys } from './keys';

/**
 * `enabled` jest tu parametrem, bo listę zgłoszeń wolno oglądać wyłącznie z
 * `accounts.manage` (to e-maile osób spoza klubu): konto bez tej zdolności nie ma
 * wysyłać żądania, które i tak wróci 403 - a 403 malowałby czerwony baner nad listą
 * pilotów, którą to konto ma prawo oglądać.
 */
export function useRegistrations(statuses: RegistrationStatusDto[], enabled: boolean) {
  const query = { statuses };
  return useQuery<RegistrationPageDto>({
    queryKey: keys.registrations.list(query),
    queryFn: () => listRegistrations(query),
    enabled,
  });
}
