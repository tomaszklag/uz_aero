/**
 * UZ Aero (serwer) — trasy operacji serwisowych (`/admin/api/maintenance/*`, mockup `A11`).
 *
 * Cienkie jak reszta repo: zod → zapytanie/komenda → status.
 *
 * ══ ZDOLNOŚCI SĄ TU ROZSZCZEPIONE I KAŻDA MA POWÓD ══
 *  • przebudowa projekcji i stan schematu → **`maintenance.run`** (nowa pozycja katalogu,
 *    decyzja do potwierdzenia — uzasadnienie przy `Capability` w `domain/roles.ts`);
 *  • sprzątanie wygasłych tokenów → **`accounts.manage`**, bo to ta sama tabela i ta sama
 *    władza, co unieważnianie sesji przy deaktywacji konta (`AdminPilotCommands`);
 *  • kolejka ponowień eksportu → **nie ma tu trasy w ogóle**. Ekran woła `GET /exports`
 *    i `POST /exports/:uuid/retry` z `A05` (`fleet.manage`); druga implementacja
 *    ponowienia byłaby gorsza niż brak drugiego przycisku.
 *
 * ══ DLACZEGO PORÓWNANIE JEST `GET`-em ══
 * Bo niczego nie zapisuje i nie zostawia śladu w dzienniku (`queries/maintenance.ts`).
 * `POST` sugerowałby, że coś się wydarzyło — a wydarzył się wyłącznie odczyt.
 * Przeciwstawna decyzja przy podglądzie korekty (`POST …/corrections/preview`) miała
 * inny powód: tam parametrem jest kształt korekty, a nie brak parametrów.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminMaintenanceCommands } from '../../../application/admin/commands/maintenance.ts';
import type { AdminMaintenanceQueries } from '../../../application/admin/queries/maintenance.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

/**
 * Powód nadpisania. Wymagany PRZEZ KOMENDĘ, a nie tylko przez ten schemat — zod pilnuje
 * kształtu (napis, długość), a decyzję „bez powodu nie ma zapisu" podejmuje warstwa
 * aplikacji, żeby obowiązywała także wołającego spoza HTTP (CLI).
 */
const rebuildBody = z.object({
  // BEZ `.trim().min(1)` i to jest celowe: powód złożony z samych spacji ma odbić się
  // o KOMENDĘ (`reason_required`), a nie o walidator kształtu (`bad_request`). Inaczej
  // reguła „bez powodu nie ma zapisu" nie miałaby ani jednego testu na własnym kodzie,
  // a wołający spoza HTTP (CLI) omijałby ją w całości.
  reason: z.string().max(2000).optional(),
});

/**
 * Potwierdzenie kasowania. Pole jest OPCJONALNE w schemacie i to jest celowe: gdyby zod
 * je wymuszał, gołe żądanie odbijałoby się o walidator, a reguła „serwer wymaga jawnej
 * intencji" nie miałaby ani jednego testu na własnym kodzie. Odmowę wydaje komenda.
 */
const pruneBody = z.object({
  confirm: z.string().min(1).max(100).optional(),
});

export function registerAdminMaintenanceRoutes(
  app: FastifyInstance,
  queries: AdminMaintenanceQueries,
  commands: AdminMaintenanceCommands,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/maintenance/projections/compare', capability: 'maintenance.run' },
    async (_req, reply) => reply.send(await queries.compareProjections()),
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/maintenance/projections/rebuild', capability: 'maintenance.run' },
    async (req, reply, actor) => {
      const body = rebuildBody.safeParse(req.body ?? {});
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await commands.rebuildProjections(actor, { reason: body.data.reason });
      if (!outcome.ok) {
        // Dwie odmowy, dwa statusy — bo to dwa różne zdania do człowieka:
        //  • 400 `reason_required`  — wada ŻĄDANIA (brakuje pola), popraw formularz.
        //    Ta sama granica, co przy korekcie administratora.
        //  • 409 `nothing_to_rebuild` — stan ŚWIATA: projekcja już się zgadza, więc
        //    nie ma operacji do wykonania i nie ma czego wpisać do dziennika. Ten sam
        //    status, co przy fladze rozwiązanej przez kogoś innego (`flag.resolve`).
        const status = outcome.reason === 'nothing_to_rebuild' ? 409 : 400;
        return reply.code(status).send({ error: outcome.reason });
      }

      return reply.send(outcome.report);
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/maintenance/refresh-tokens', capability: 'accounts.manage' },
    async (_req, reply) => reply.send(await queries.refreshTokens()),
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/maintenance/refresh-tokens/purge', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const body = pruneBody.safeParse(req.body ?? {});
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await commands.pruneRefreshTokens(actor, { confirm: body.data.confirm });
      if (!outcome.ok) return reply.code(400).send({ error: outcome.reason });

      return reply.send(outcome.report);
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/maintenance/schema', capability: 'maintenance.run' },
    async (_req, reply) => reply.send(await queries.schema()),
  );
}
