/**
 * UZ Aero - wysyłka ZGŁOSZEŃ BŁĘDÓW (issue #87, na czas testów z pilotami).
 *
 * Osobny, NISKOPRIORYTETOWY tor obok outboxa zdarzeń - dokładnie jak ślad kalibracyjny
 * (`traceSync.ts`) i z tego samego powodu: rejestr dnia jedzie pierwszy, bo od niego
 * zależy praca innych pilotów. Zgłoszeniu nigdzie się nie śpieszy, więc pętla okazji
 * woła nas na końcu przebiegu, jedna paczka na okazję.
 *
 * Księgowość jak w outboksie: wysłane wpisy dostają `sentAt`, brak odpowiedzi zostawia
 * je w kolejce (`authorizedFetch` zwija offline i odmowy do `null`). Potwierdzone
 * kasujemy - od tej chwili jedyną kopią jest serwer, tak jak przy nagraniu śladu
 * (issue #47). Osobny krok po oznaczeniu, żeby przerwanie procesu między jednym
 * a drugim zostawiło wiersze OZNACZONE, a nie skasowane przed potwierdzeniem zapisu.
 */

import type { AuthService } from '../auth/authService';
import type { BugReportPort, RemoteBugReport, ServerPort } from '../ports';
import { authorizedFetch } from './authorizedFetch';

/**
 * Paczka wysyłki. Serwer przyjmuje 50 na żądanie; kolejka dłuższa niż to znaczy telefon,
 * który miesiącami nie widział sieci - i wtedy kolejne okazje domykają resztę.
 */
export const BUG_REPORT_BATCH_LIMIT = 50;

export class BugReportSync {
  constructor(
    private readonly store: BugReportPort,
    private readonly server: ServerPort,
    private readonly auth: AuthService,
  ) {}

  /** Jedna paczka na okazję. Zwraca liczbę wysłanych (0 = pusto / offline / odmowa). */
  async uploadOnce(): Promise<number> {
    const batch = await this.store.getPendingBugReports(BUG_REPORT_BATCH_LIMIT);
    if (batch.length === 0) return 0;

    const wire: RemoteBugReport[] = batch.map((report) => ({
      uuid: report.uuid,
      // Czas na drucie jest ISO, jak w całym kontrakcie serwera; w magazynie epoch ms,
      // jak w całym telefonie. Tłumaczenie należy do tej granicy i do niej jedynej.
      createdAt: new Date(report.createdAt).toISOString(),
      severity: report.severity,
      description: report.description,
      screen: report.screen,
      appVersion: report.appVersion,
      sessionUuid: report.sessionUuid,
      context: report.context,
    }));

    const result = await authorizedFetch(this.auth, (token) =>
      this.server.pushBugReports(token, wire),
    );
    if (result == null) return 0;

    await this.store.markBugReportsSent(
      batch.map((r) => r.uuid),
      Date.now(),
    );
    // Kasujemy WSZYSTKO potwierdzone, nie tylko tę paczkę - sprząta to także wiersze
    // oznaczone tuż przed ubiciem procesu w poprzednim przebiegu.
    await this.store.purgeSentBugReports();
    return batch.length;
  }
}
