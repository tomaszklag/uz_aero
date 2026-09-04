/**
 * UZ Aero (serwer) - przyjęcie ZGŁOSZEŃ BŁĘDÓW z telefonu (issue #87).
 *
 * Cienka jak `PrefsCommands` i to jest właściwy rozmiar: zgłoszenie nie ma reguł
 * domenowych do sprawdzenia, projekcji do odświeżenia ani flagi do otwarcia. Jedyna
 * decyzja - „to zgłoszenie już mam" - jest własnością klucza głównego, więc mieszka
 * w SQL-u (`ON CONFLICT DO NOTHING`), nie tutaj.
 *
 * ══ DLACZEGO PACZKA, A NIE POJEDYNCZE ZGŁOSZENIE ══
 * Bo telefon jest offline-first: pilot pisze zgłoszenie tam, gdzie zobaczył problem -
 * czyli często bez zasięgu - a wysyła je pętla okazji razem z resztą. Kolejka bywa
 * więc dłuższa niż jeden wpis, a wysyłka po jednym kosztowałaby tyle rundek, ile
 * zgłoszeń, przy identycznym wyniku.
 *
 * ══ TOŻSAMOŚĆ WYŁĄCZNIE Z TOKENU ══
 * `pilotId` przychodzi z trasy (`/me`), nigdy z ciała żądania - ta sama reguła, co
 * w preferencjach: jeden pilot nie ma jak zgłosić błędu w cudzym imieniu.
 */

import type {
  BugReportIntake,
  BugReportsPort,
  Database,
  NewBugReport,
} from '../../common/ports.ts';

export class BugReportCommands {
  constructor(
    private readonly db: Database,
    private readonly reports: BugReportsPort,
  ) {}

  /**
   * Zapisuje paczkę i mówi, ile wierszy przybyło. Bez transakcji: zgłoszenia są
   * niezależnymi faktami, więc częściowe przyjęcie jest LEPSZE niż odrzucenie
   * całości - telefon ponowi resztę przy następnej okazji, a idempotencja po uuid
   * pilnuje, żeby przyjęte nie zdublowały się przy ponowieniu.
   */
  submit(pilotId: string, reports: NewBugReport[]): Promise<BugReportIntake> {
    return this.reports.insertMany(this.db, pilotId, reports);
  }
}
