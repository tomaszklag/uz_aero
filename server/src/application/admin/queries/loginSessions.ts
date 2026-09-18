/**
 * Ninerdeck (serwer) - ODCZYT sesji logowania dla panelu (2.1.0, issue #133; §5.6).
 *
 * Dwie listy i dwa różne zakresy, i to jest cała treść tego pliku:
 *  • WŁASNE sesje osoby (`#/konto`) - wszystkie powierzchnie i wszystkie kluby, bo to
 *    pytanie o SIEBIE: „gdzie jestem zalogowany";
 *  • sesje CZŁONKA (karta członka) - wyłącznie w klubie administratora. Klub nie ma prawa
 *    zobaczyć urządzenia, którym ta sama osoba loguje się gdzie indziej (§3.3
 *    wielofirmowości) - i dlatego zawężenie stoi w SQL-u adaptera, nie w filtrze tutaj.
 */

import type { Database, LoginSessionView } from '../../common/ports.ts';
import type { LoginSessionsPort } from '../../common/ports.ts';
import type { AdminLoginSession } from '../contracts/loginSessions.ts';

/** Wiersz → kontrakt. `current` rozstrzyga WOŁAJĄCY, bo tylko on wie, skąd przyszedł. */
export const loginSessionView = (
  session: LoginSessionView,
  currentSessionId: string | null,
): AdminLoginSession => ({
  id: session.id,
  surface: session.surface,
  method: session.method,
  createdAt: session.createdAt.toISOString(),
  lastSeenAt: session.lastSeenAt.toISOString(),
  device: session.deviceLabel,
  ip: session.ip,
  current: currentSessionId != null && session.id === currentSessionId,
});

export class AdminLoginSessionQueries {
  constructor(
    private readonly db: Database,
    private readonly sessions: LoginSessionsPort,
  ) {}

  /** Moje urządzenia - wszystkie kluby i obie powierzchnie (`GET /admin/api/me/sessions`). */
  async mine(pilotId: string, currentSessionId: string | null): Promise<AdminLoginSession[]> {
    const rows = await this.sessions.list(this.db, pilotId);
    return rows.map((row) => loginSessionView(row, currentSessionId));
  }

  /**
   * Urządzenia członka W KLUBIE administratora. `current` jest tu zawsze `false`: to
   * cudze sesje, więc żadna z nich nie jest tą, z której administrator patrzy.
   */
  async ofMember(orgId: string, pilotId: string): Promise<AdminLoginSession[]> {
    const rows = await this.sessions.list(this.db, pilotId, orgId);
    return rows.map((row) => loginSessionView(row, null));
  }
}
