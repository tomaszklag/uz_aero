/**
 * UZ Aero (serwer) - strona ODCZYTU zgłoszeń rejestracyjnych (logowanie Google).
 *
 * Pytanie, na które odpowiada: „kto chce dołączyć i czeka na moją decyzję" - stąd
 * lista Z LICZNIKAMI wszystkich statusów, żeby zakładka PILOCI mogła pokazać plakietkę
 * „3 zgłoszenia" bez drugiego żądania. Klasa jest cienka: porządek i filtrowanie są
 * własnością portu, mapowanie - czystej funkcji. Tu zostaje wyłącznie SUFIT listy.
 */

import type { Database, IdentityStatus } from '../../common/ports.ts';
import type { AdminRegistration, AdminRegistrationList } from '../contracts/registrations.ts';
import { registration } from '../mappers/registration.ts';
import type { RegistrationsAdminPort } from '../ports.ts';

/**
 * Ile zgłoszeń wchodzi na jedną odpowiedź. Bez stronicowania, jak zgłoszenia błędów:
 * klub liczy kilkudziesięciu pilotów, a zgłoszeń rejestracyjnych będzie mniej niż lotów
 * w jeden weekend. Sufit stoi tu, żeby dało się go podnieść jedną liczbą.
 */
export const REGISTRATION_LIST_LIMIT = 300;

export class AdminRegistrationQueries {
  constructor(
    private readonly db: Database,
    private readonly registrations: RegistrationsAdminPort,
  ) {}

  /** `statuses` puste = wszystkie; liczniki są zawsze po CAŁEJ tabeli. */
  async list(statuses: readonly IdentityStatus[]): Promise<AdminRegistrationList> {
    const [items, counts] = await Promise.all([
      this.registrations.list(this.db, { statuses, limit: REGISTRATION_LIST_LIMIT }),
      this.registrations.countByStatus(this.db),
    ]);
    return { items: items.map(registration), counts };
  }

  async byKey(provider: string, subject: string): Promise<AdminRegistration | null> {
    const record = await this.registrations.find(this.db, provider, subject);
    return record == null ? null : registration(record);
  }
}
