/**
 * UZ Aero (serwer) - strona ODCZYTU modułu „Zgłoszenia" (issue #87).
 *
 * Scenariusz, dla którego powstaje: trwają testy z pilotami, na biurku leży lista
 * rzeczy, które nie działają, i trzeba odpowiedzieć na pytanie „co jest jeszcze do
 * zrobienia i przy którym ekranie". Stąd kształt odpowiedzi: lista Z LICZNIKAMI
 * wszystkich statusów, także tych, których filtr właśnie nie pokazuje.
 *
 * Klasa jest cienka: porządek i filtrowanie są własnością portu, mapowanie - czystej
 * funkcji. Tu zostaje wyłącznie SUFIT listy, bo to decyzja produktowa, nie SQL-owa.
 */

import type { BugReportsPort, Database } from '../../common/ports.ts';
import type { BugStatus } from '../../../domain/bugReports.ts';
import type { AdminBugReport, AdminBugReportList } from '../contracts/bugReports.ts';
import { bugReport } from '../mappers/bugReport.ts';

/**
 * Ile zgłoszeń wchodzi na jedną odpowiedź.
 *
 * Bez stronicowania i to jest świadome (patrz `BugReportsPort.list`): to jest lista
 * JEDNEJ fazy projektu, liczona w setkach. Sufit stoi tu, a nie w SQL-u, żeby dało
 * się go podnieść jedną liczbą, gdy testy potrwają dłużej, niż zakładamy.
 */
export const BUG_LIST_LIMIT = 300;

export class AdminBugReportQueries {
  constructor(
    private readonly db: Database,
    private readonly reports: BugReportsPort,
  ) {}

  /** `statuses` puste = wszystkie; liczniki są zawsze po CAŁEJ tabeli. */
  async list(statuses: readonly BugStatus[]): Promise<AdminBugReportList> {
    const [items, counts] = await Promise.all([
      this.reports.list(this.db, { statuses, limit: BUG_LIST_LIMIT }),
      this.reports.countByStatus(this.db),
    ]);
    return { items: items.map(bugReport), counts };
  }

  async byUuid(uuid: string): Promise<AdminBugReport | null> {
    const record = await this.reports.byUuid(this.db, uuid);
    return record == null ? null : bugReport(record);
  }
}
