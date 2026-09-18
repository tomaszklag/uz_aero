/**
 * Ninerdeck (serwer) - WYLOGOWANIE URZĄDZENIA CZŁONKA z panelu klubu (2.1.0, issue #133;
 * §5.6).
 *
 * ══ TU SĄ WYŁĄCZNIE CUDZE SESJE ══
 * Wyłączenie cudzej sesji jest decyzją o innym człowieku, więc idzie przez `AuditedWrite`
 * i zostawia wpis. Wyłączenie WŁASNEJ nie jest decyzją o nikim - to ten sam gest, co
 * „Wyloguj" w pasku, tylko wycelowany w inne urządzenie - i dlatego mieszka gdzie indziej
 * (`AuthCommands.revokeOwnSession`), bez audytu: dziennik nadzoru opisuje władzę nad kimś,
 * a nie porządki we własnych kartach przeglądarki.
 *
 * ══ ZAKRES SIEDZI W CELU, NIE W SPRAWDZENIU ══
 * `LoginSessionsPort.revoke` przyjmuje trójkę (sesja, osoba, klub) i zawęża nią `UPDATE`.
 * Dzięki temu „wyloguj sesję X" z adresu żądania nie ma jak dosięgnąć urządzenia, którym
 * ta sama osoba pracuje w INNYM klubie - nawet gdyby ktoś znał identyfikator.
 *
 * ══ AUDYT NIE NIESIE IDENTYFIKATORA SESJI ══
 * Niesie kod pilota, powierzchnię i etykietę urządzenia - czyli to, co człowiek rozpozna.
 * `sid` jest claimem tokenu i nie ma po co trafiać do dziennika, który czyta więcej osób
 * niż brama (ta sama zasada, przez którą audyt `password.link_sent` nie niesie tokenu).
 *
 * Konstruktor bez `Database`/`Queryable` - jak każda komenda panelu (`auditedWrite.ts`,
 * `test/architecture.test.ts`): nie ma jak zapisać z pominięciem śladu.
 */

import type { Clock, LoginSessionsPort } from '../../common/ports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor, PilotsAdminPort } from '../ports.ts';

export type RevokeSessionOutcome =
  | { ok: true; revoked: number }
  /** Sesji nie ma, należy do kogoś innego, stoi w innym klubie albo już jest wyłączona. */
  | { ok: false; reason: 'not_found' };

/**
 * Sygnał przerwania transakcji. MUSI być wyjątkiem: `AuditedWrite.run` dopisuje wpis
 * audytu zawsze, więc zwrócenie wartości zostawiłoby w dzienniku ślad po operacji,
 * której nie było. Poza ten plik nie wychodzi.
 */
class SessionNotFound extends Error {}

export class AdminLoginSessionCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly pilots: PilotsAdminPort,
    private readonly sessions: LoginSessionsPort,
    private readonly clock: Clock,
  ) {}

  /** „Wyloguj to urządzenie" z karty członka. */
  async revoke(actor: Actor, pilotId: string, sessionId: string): Promise<RevokeSessionOutcome> {
    const now = this.clock.now();
    try {
      return await this.write.run(actor, async (tx) => {
        const member = await this.pilots.byId(tx, actor.orgId, pilotId);
        // Osoba spoza klubu administratora jest dla niego NIEISTNIEJĄCA - jak wszędzie
        // od epiku C (issue #99): 404, nie 403.
        if (member == null) throw new SessionNotFound();

        // Wiersz czytamy PRZED zapisem wyłącznie po to, żeby audyt miał czym nazwać
        // urządzenie - przez `tx`, bo cudzy uchwyt w otwartej transakcji czeka na jej
        // koniec (pułapka PGlite, `architektura-panelu-serwer.md` §7.9 (k)).
        const target = (await this.sessions.list(tx, pilotId, actor.orgId)).find(
          (s) => s.id === sessionId,
        );
        const done = await this.sessions.revoke(
          tx,
          { id: sessionId, pilotId, orgId: actor.orgId },
          now,
          'admin',
        );
        if (!done) throw new SessionNotFound();

        return {
          result: { ok: true, revoked: 1 } as const,
          audit: {
            action: 'session.revoke' as const,
            targetType: 'pilot',
            targetId: pilotId,
            details: {
              code: member.code,
              surface: target?.surface ?? null,
              device: target?.deviceLabel ?? null,
            },
          },
        };
      });
    } catch (err) {
      if (err instanceof SessionNotFound) return { ok: false, reason: 'not_found' };
      throw err;
    }
  }

  /**
   * „Wyloguj wszędzie w tym klubie". Zero sesji NIE jest odmową, tylko wynikiem:
   * administrator kliknął przycisk, którego skutek już zaszedł (człowiek wylogował się
   * sam minutę temu), a `404` kazałoby mu szukać błędu tam, gdzie go nie ma. Wpis audytu
   * powstaje mimo to - decyzja zapadła, niezależnie od tego, ile urządzeń zastała.
   */
  async revokeAll(actor: Actor, pilotId: string): Promise<RevokeSessionOutcome> {
    const now = this.clock.now();
    try {
      return await this.write.run(actor, async (tx) => {
        const member = await this.pilots.byId(tx, actor.orgId, pilotId);
        if (member == null) throw new SessionNotFound();

        const revoked = await this.sessions.revokeAll(
          tx,
          { pilotId, orgId: actor.orgId },
          now,
          'admin',
        );
        return {
          result: { ok: true, revoked } as const,
          audit: {
            action: 'session.revoke_all' as const,
            targetType: 'pilot',
            targetId: pilotId,
            details: { code: member.code, revoked },
          },
        };
      });
    } catch (err) {
      if (err instanceof SessionNotFound) return { ok: false, reason: 'not_found' };
      throw err;
    }
  }
}
