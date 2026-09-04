/**
 * UZ Aero (serwer) - KONTRAKT zgłoszeń rejestracyjnych w panelu (logowanie Google,
 * 2026-09-04; `docs/logowanie-google.md` §8).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` i siebie nawzajem (pilnuje `test/architecture.test.ts`). Status
 * tożsamości ma tu LUSTRO, dokładnie jak `PilotRoleWire`: definicja mieszka
 * w `application/common/ports.ts` (`IdentityStatus`), poza zasięgiem tej granicy.
 */

import type { PilotRoleWire } from './pilots.ts';

/** Lustro `IdentityStatus` z `application/common/ports.ts` - patrz nagłówek pliku. */
export type RegistrationStatusWire = 'pending' | 'linked' | 'rejected';

/**
 * Jedno zgłoszenie - wiersz listy I treść szuflady w jednym kształcie (jak zgłoszenia
 * błędów): to jest kilka pól z profilu Google i decyzja, nie ma czego skracać.
 *
 * `email` i `name` pochodzą Z GOOGLE. Po zatwierdzeniu konto pilota ma własne
 * `pilotCode`; imię klubowe nadaje administrator w formularzu zatwierdzenia, więc
 * w tym kontrakcie go nie ma - jest w `AdminPilotListItem`.
 */
export interface AdminRegistration {
  provider: string;
  /** `sub` od dostawcy - identyfikator w adresie trasy decyzji. */
  subject: string;
  email: string;
  name: string;
  status: RegistrationStatusWire;
  /** Powód odrzucenia - WYMAGANY przy `rejected`, bo pilot czyta go na `00d`. */
  rejectReason: string | null;
  /** ISO 8601 UTC - chwila pierwszego logowania tym kontem Google. */
  createdAt: string;
  lastLoginAt: string | null;
  decidedAt: string | null;
  /** KOD administratora, który zdecydował; `null` = jeszcze bez decyzji. */
  decidedBy: string | null;
  /** Konto pilota po zatwierdzeniu; `null` w pozostałych stanach. */
  pilotId: string | null;
  pilotCode: string | null;
}

export interface AdminRegistrationList {
  items: AdminRegistration[];
  /** Liczniki po CAŁEJ tabeli, także statusów, których filtr nie pokazuje. */
  counts: Record<RegistrationStatusWire, number>;
}

/**
 * Ciało zatwierdzenia = formularz konta bez e-maila: adres przychodzi ze zgłoszenia
 * (tożsamość Google) i administrator go nie wpisuje. Kod proponuje panel z imienia,
 * ale wysyła to, co administrator potwierdził - on jest właścicielem słownika kodów.
 */
export interface ApproveRegistrationBody {
  code: string;
  name: string;
  role: PilotRoleWire;
}

export interface RejectRegistrationBody {
  reason: string;
}
