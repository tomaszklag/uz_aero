/**
 * UZ Aero (serwer) - zmiana STATUSU zgłoszenia błędu (issue #87).
 *
 * Jedyna operacja zapisu panelu na `bug_reports` i jedyna zmiana, jakiej wiersz w ogóle
 * doznaje po przyjęciu z telefonu. Treści zgłoszenia nie poprawia nikt: to cudza relacja
 * z tego, co się stało, i poprawiona przestałaby nią być.
 *
 * ══ DLACZEGO PRZEZ `AuditedWrite`, SKORO TO „TYLKO" STATUS ══
 * Bo to jest decyzja o CUDZYM zgłoszeniu - dokładnie ta klasa akcji, dla której dziennik
 * audytu istnieje. „Kto zamknął zgłoszenie, które pilot wciąż widzi jako otwarte"
 * to pytanie, które pada w tydzień po tym, jak wszyscy zapomną. Przy okazji komenda nie
 * ma uchwytu do bazy (pilnuje `test/architecture.test.ts`), więc innej drogi zapisu
 * mieć nie może.
 *
 * ══ CZEGO TU NIE MA ══
 * Kasowania zgłoszeń. Byłaby to jedyna w panelu operacja NISZCZĄCA dane, dla której nie
 * ma powodu: zgłoszenie nietrafione zamyka się statusem `rejected` z komentarzem, a to
 * niesie więcej informacji niż pusty wiersz po wierszu, którego już nie ma.
 */

import type { BugReportsPort, Clock } from '../../common/ports.ts';
import type { BugStatus } from '../../../domain/bugReports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor } from '../ports.ts';

export interface BugStatusInput {
  uuid: string;
  status: BugStatus;
  /**
   * Komentarz administratora. Opcjonalny w typie, WYMAGANY przez trasę przy statusie
   * `rejected` - odrzucenie bez powodu nie mówi nic ani zgłaszającemu, ani temu, kto
   * za miesiąc przegląda listę.
   */
  note: string | null;
}

export type BugStatusOutcome = { ok: true } | { ok: false; reason: 'not_found' };

/** Sygnał przerwania transakcji - musi być WYJĄTKIEM, żeby wycofał wpis audytu. */
class BugNotFound extends Error {}

export class AdminBugReportCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly reports: BugReportsPort,
    private readonly clock: Clock,
  ) {}

  async setStatus(actor: Actor, input: BugStatusInput): Promise<BugStatusOutcome> {
    const at = this.clock.now();
    try {
      await this.write.run(actor, async (tx) => {
        // Stan SPRZED zmiany czytamy w tej samej transakcji, żeby dziennik mógł
        // powiedzieć „nowe → rozwiązane", a nie tylko „ustawiono rozwiązane".
        const before = await this.reports.byUuid(tx, input.uuid);
        if (before == null) throw new BugNotFound();

        const changed = await this.reports.setStatus(tx, input.uuid, {
          status: input.status,
          note: input.note,
          by: actor.pilotId,
          at,
        });
        if (!changed) throw new BugNotFound();

        return {
          result: undefined,
          audit: {
            action: 'bug.status',
            targetType: 'bug_report',
            targetId: input.uuid,
            details: {
              from: before.status,
              to: input.status,
              note: input.note,
              // Tożsamość zgłoszenia w dzienniku, bo lista panelu filtruje statusem
              // i zamknięte zgłoszenie bywa trudniejsze do odnalezienia niż wpis audytu.
              screen: before.screen,
              reportedBy: before.pilotCode ?? before.pilotId,
              reportedAt: before.createdAt.toISOString(),
            },
          },
        };
      });
    } catch (err) {
      if (err instanceof BugNotFound) return { ok: false, reason: 'not_found' };
      throw err;
    }

    return { ok: true };
  }
}
