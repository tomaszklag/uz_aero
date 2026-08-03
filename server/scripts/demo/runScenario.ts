/**
 * UZ Aero (dane demo) — WYKONAWCA SCENARIUSZA.
 *
 * Bierze scenariusz (czyste dane) i przepuszcza go przez API: paczki telefonów, potem
 * akcje panelu. Nie zna ani `fetch`-a, ani Fastify — rozmawia przez `DemoTransport`,
 * bo ten sam przebieg jedzie w dwóch światach:
 *
 *  • `scripts/seedDemo.ts` — prawdziwy HTTP do działającego serwera (`DemoClient`);
 *  • `test/demoScenario.test.ts` — `app.inject` na PGlite, bez sieci i bez Dockera.
 *
 * Dzięki temu test sprawdza NIE tylko dane, ale i tę procedurę: wyszukanie flagi po
 * opisie, kolejność „wszystkie paczki przed akcjami panelu", przełączanie tożsamości
 * między administratorem a szefem wyszkolenia.
 */

import type { AdminFlagPage } from '../../src/application/admin/contracts/flags.ts';
import type { WireEvent } from './dayStream.ts';
import type { DemoAdminAction, DemoScenario } from './scenario.ts';

/** Odpowiedź `POST /events` — tyle, ile wykonawca z niej czyta. */
export interface IngestReply {
  accepted: number;
  duplicates: number;
}

/** Jedyne, czego wykonawca potrzebuje od świata zewnętrznego. */
export interface DemoTransport {
  loginPilot(pilotCode: string): Promise<void>;
  sendEvents(
    pilotCode: string,
    events: readonly WireEvent[],
    sourceDevice: string,
  ): Promise<IngestReply>;
  loginPanel(pilotCode: string): Promise<void>;
  adminGet<T>(path: string): Promise<T>;
  adminPost<T>(path: string, body: unknown): Promise<T>;
}

export interface RunSummary {
  accepted: number;
  duplicates: number;
  batches: number;
  /** Akcje panelu, które faktycznie się wykonały (flaga mogła już nie być otwarta). */
  adminActions: number;
  /** Akcje pominięte razem z powodem — seed nigdy nie milczy o tym, czego nie zrobił. */
  skipped: string[];
}

export type LogFn = (message: string) => void;

export async function runScenario(
  transport: DemoTransport,
  scenario: DemoScenario,
  log: LogFn = () => {},
): Promise<RunSummary> {
  const summary: RunSummary = {
    accepted: 0,
    duplicates: 0,
    batches: 0,
    adminActions: 0,
    skipped: [],
  };

  for (const pilotId of scenario.pilotIds) await transport.loginPilot(pilotId);
  log(`Zalogowano ${scenario.pilotIds.length} kont pilotów: ${scenario.pilotIds.join(', ')}`);

  for (const batch of scenario.batches) {
    const reply = await transport.sendEvents(batch.picId, batch.events, batch.sourceDevice);
    summary.accepted += reply.accepted;
    summary.duplicates += reply.duplicates;
    summary.batches += 1;
    log(
      `  ${batch.note} — przyjęto ${reply.accepted}` +
        (reply.duplicates > 0 ? `, duplikatów ${reply.duplicates}` : ''),
    );
  }

  for (const action of scenario.adminActions) {
    await transport.loginPanel(action.actorId);
    const done = await performAdminAction(transport, action, log);
    if (done == null) summary.adminActions += 1;
    else summary.skipped.push(done);
  }

  return summary;
}

/** `null` = wykonano; napis = powód pominięcia. */
async function performAdminAction(
  transport: DemoTransport,
  action: DemoAdminAction,
  log: LogFn,
): Promise<string | null> {
  switch (action.kind) {
    case 'resolve_flag': {
      // Numer flagi nadaje sekwencja przy ingeście, więc scenariusz opisuje ją cechami
      // i dopiero tutaj zamienia opis na `id`.
      const query = new URLSearchParams({
        status: 'open',
        type: action.flag.type,
        aircraftId: action.flag.aircraftId,
        sessionUuid: action.flag.sessionUuid,
      });
      const page = await transport.adminGet<AdminFlagPage>(`/flags?${query.toString()}`);
      const flag = page.items[0];
      if (flag == null) {
        return `nie znaleziono otwartej flagi ${action.flag.type} na ${action.flag.aircraftId}`;
      }

      const result = await transport.adminPost<{ exports: Array<{ sessionUuid: string }> }>(
        `/flags/${flag.id}/resolve`,
        { note: action.note },
      );
      log(
        `  [${action.actorId}] flaga #${flag.id} ${flag.type} rozwiązana` +
          (result.exports.length > 0 ? `, karty ponowione: ${result.exports.length}` : ''),
      );
      return null;
    }

    case 'void_event': {
      await transport.adminPost(`/sessions/${action.sessionUuid}/corrections`, {
        targetUuid: action.targetUuid,
        action: 'void',
        reason: action.reason,
      });
      log(`  [${action.actorId}] unieważniono zdarzenie ${action.targetUuid}`);
      return null;
    }

    case 'retry_export': {
      await transport.adminPost(`/exports/${action.sessionUuid}/retry`, {});
      log(`  [${action.actorId}] ponowiono eksport ${action.sessionUuid}`);
      return null;
    }

    case 'deactivate_pilot': {
      await transport.adminPost(`/pilots/${action.pilotId}/active`, { active: false });
      log(`  [${action.actorId}] konto ${action.pilotId} wyłączone`);
      return null;
    }
  }
}
