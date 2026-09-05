/**
 * UZ Aero - panel 2.0: zgłoszenie rejestracyjne -> to, co pokazuje kolejka i karta.
 *
 * Moduł CZYSTY (bez Reacta): napisy powstają tu, żeby widok tylko je wstawiał.
 * Formatowanie daty też tu, nie w `.tsx` - ta sama reguła, która trzyma arytmetykę
 * poza widokiem (`test/architecture.test.ts`).
 */

import { dateTimeUtcShort } from '@uzaero/format';

import type { RegistrationDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';

export interface RegistrationRow {
  subject: string;
  provider: string;
  name: string;
  email: string;
  /** „4 WRZ 09:38 UTC" - chwila pierwszego logowania; ten sam zapis, co przy zgłoszeniach błędów. */
  sinceLabel: string;
}

export function registrationRow(dto: RegistrationDto): RegistrationRow {
  return {
    subject: dto.subject,
    provider: dto.provider,
    name: dto.name,
    email: dto.email,
    sinceLabel: `${dateTimeUtcShort(new Date(dto.createdAt).getTime())} UTC`,
  };
}

/**
 * Odmowa decyzji -> zdanie. `null` = to nie jest odmowa ze znanym powodem; wołający
 * schodzi wtedy na `errorMessage` z `apiMessage.ts`.
 *
 * `already_decided` mówi, JAKA decyzja już zapadła: ktoś inny (albo druga karta tej
 * samej przeglądarki) zdążył pierwszy, a człowiek patrzy na formularz, który nie ma
 * już czego rozstrzygać.
 */
export function registrationRefusalMessage(error: unknown): string | null {
  if (!isHttpError(error) || error.status !== 409) return null;
  if (error.body.error === 'already_decided') {
    return error.body.status === 'linked'
      ? 'To zgłoszenie zostało już zatwierdzone - konto istnieje.'
      : 'To zgłoszenie zostało już odrzucone.';
  }
  if (error.body.error === 'conflict') {
    return error.body.field === 'email'
      ? 'Konto z tym adresem e-mail już istnieje. Wpisz ten adres w istniejącym koncie zamiast zatwierdzać zgłoszenie.'
      : 'Ten kod ma już inny pilot.';
  }
  return null;
}
