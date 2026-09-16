/**
 * Ninerdeck (serwer) - WSPÓLNE pola wejściowe modułu Piloci i mapowanie członka na drut.
 *
 * Istnieje, bo od issue #100 kod pilota i rolę przyjmują DWIE trasy: edycja członka
 * (`PATCH /pilots/:id`) i zatwierdzenie zgłoszenia (`POST /memberships/:id/approve`).
 * Druga kopia walidatora rozjechałaby się przy pierwszej poprawce, a objaw byłby
 * najgorszy z możliwych: jedna droga przyjmuje kod, którego druga nie przyjmuje,
 * i to samo pole w tym samym module zachowuje się inaczej zależnie od drzwi.
 *
 * Ta sama zasada, co w `dayRange.ts` (parsowanie dnia dla wszystkich list panelu)
 * i `uniqueConflict.ts` (rozpoznanie kolizji dla kont i floty).
 */

import { z } from 'zod';

import type { AdminPilotListItem } from '../../../application/admin/contracts/pilots.ts';
import type { AdminPilotAccount } from '../../../application/admin/ports.ts';
import { PILOT_ROLES } from '../../../domain/roles.ts';

/**
 * Kod pilota: WERSALIKI, bez spacji, 2–10 znaków.
 *
 * Wielkość liter normalizujemy, a nie odrzucamy: „kza" i „KZA" to w intencji
 * administratora ten sam kod, a porównanie w bazie i tak idzie bez rozróżniania
 * wielkości (`PilotsAdminPort.conflict`). Kod jedzie do kart arkusza i do logu dnia,
 * więc krótki i mono - dłuższy rozjechałby kolumnę w dokumencie klubu.
 */
export const pilotCode = z
  .string()
  .trim()
  .min(2)
  .max(10)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9]+$/.test(value), {
    message: 'kod pilota: wyłącznie litery i cyfry',
  });

export const pilotName = z.string().trim().min(2).max(100);

/**
 * E-mail jest OPCJONALNY, bo kolumna `pilots.email` jest `NULL`-owalna od schematu
 * bazowego. Pusty napis znaczy „bez e-maila" (`null`), a nie „e-mail o zerowej
 * długości" - inaczej wyczyszczone pole w formularzu wjechałoby do bazy jako wartość
 * i zajęło unikalny indeks.
 */
export const pilotEmail = z
  .union([z.string().trim().email().max(200), z.literal('')])
  .transform((value) => (value === '' ? null : value));

export const pilotRole = z.enum(PILOT_ROLES);

/** Identyfikator OSOBY w adresie trasy - klucz zdarzeń, nie kod pilota. */
export const pilotIdParams = z.object({ id: z.string().min(1).max(100) });

/**
 * Członek klubu → wiersz kontraktu w odpowiedzi MUTACJI.
 *
 * `flyingDays: 0` i `updatedAt` z chwili odpowiedzi są tu ŚWIADOMYM uproszczeniem:
 * mutacja oddaje tożsamość i status członkostwa, którego dotyczyła, a nie jego
 * statystyki. Panel i tak unieważnia listę po każdej zmianie, więc liczba dni lotnych
 * przychodzi z odświeżonej listy, gdzie jest policzona w oknie. Dokładanie tu drugiego
 * zapytania po agregat byłoby kosztem bez odbiorcy.
 */
export const accountToWire = (account: AdminPilotAccount, at: Date): AdminPilotListItem => ({
  id: account.id,
  orgId: account.orgId,
  code: account.code,
  name: account.name,
  email: account.email,
  active: account.active,
  role: account.role,
  updatedAt: at.toISOString(),
  flyingDays: 0,
});
