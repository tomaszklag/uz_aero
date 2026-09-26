/**
 * Ninerdeck (serwer) - adapter TOKENÓW PUSH (`push_tokens`; migracja 13, issue #164,
 * `docs/rezerwacje.md` §12.2).
 *
 * ══ TOKEN ŻYJE RAZEM Z SESJĄ LOGOWANIA ══
 * Bez tego wspólny tablet klubu wysyłałby powiadomienia pilota, który dawno oddał
 * urządzenie koledze - a tego nikt by nie zauważył, bo push nie wraca z potwierdzeniem
 * do właściciela konta.
 *
 * Kaskada `ON DELETE` z `login_sessions` NIE WYSTARCZA i do przeglądu bezpieczeństwa
 * 3.1.0 (issue #169, K7) była jedyną obroną: unieważnienie sesji STEMPLUJE wiersz
 * (`revoked_at`), a nie kasuje go, więc kaskada nie zadziałała nigdy - wylogowany
 * telefon dalej dostawał budziki. Obrona ma odtąd DWA piętra: `byPilots` pyta wyłącznie
 * o tokeny sesji ŻYWYCH (nieunieważnionych i niewygasłych - ta sama definicja, co
 * `PgLoginSessions.find`), a samo unieważnienie sprząta tokeny swojej sesji
 * (`PgLoginSessions.revoke/revokeAll`). Pierwsze piętro jest gwarancją, drugie -
 * porządkiem w tabeli.
 *
 * ══ BEZ `org_id` I TO JEST ZGODNE Z REGUŁĄ ══
 * Token opisuje URZĄDZENIE osoby, a ta bywa w kilku klubach naraz i przełącza je bez
 * wylogowania. Klub niesie POWIADOMIENIE, czyli treść, która przez ten token wychodzi -
 * i to tam (`notifications.org_id`) stoi zawężenie.
 */

import type { Clock, PushTokensPort, Queryable } from '../../../application/common/ports.ts';

export class PgPushTokensRepo implements PushTokensPort {
  constructor(private readonly clock: Clock) {}

  async register(
    db: Queryable,
    token: { token: string; sessionId: string; pilotId: string },
    at: Date,
  ): Promise<void> {
    // Ten sam token bywa przypisany do NOWEJ sesji: wspólny tablet, na którym pilot A
    // się wylogował, a pilot B zalogował, dostaje od systemu ten sam identyfikator
    // urządzenia. Przepisanie na bieżącą sesję i bieżącą osobę jest wtedy jedyną
    // poprawną odpowiedzią - inaczej budzik dzwoniłby do poprzedniego właściciela.
    await db.query(
      `INSERT INTO push_tokens (token, session_id, pilot_id, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE
          SET session_id = EXCLUDED.session_id,
              pilot_id   = EXCLUDED.pilot_id,
              created_at = EXCLUDED.created_at`,
      [token.token, token.sessionId, token.pilotId, at],
    );
  }

  async byPilots(db: Queryable, pilotIds: readonly string[]): Promise<string[]> {
    if (pilotIds.length === 0) return [];
    const { rows } = await db.query<{ token: string }>(
      `SELECT t.token
         FROM push_tokens t
         JOIN login_sessions s
           ON s.id = t.session_id AND s.revoked_at IS NULL AND s.expires_at > $2
        WHERE t.pilot_id = ANY($1::text[])`,
      [pilotIds, this.clock.now().toISOString()],
    );
    return rows.map((r) => r.token);
  }

  async forget(db: Queryable, tokens: readonly string[]): Promise<void> {
    if (tokens.length === 0) return;
    await db.query(`DELETE FROM push_tokens WHERE token = ANY($1::text[])`, [tokens]);
  }
}
