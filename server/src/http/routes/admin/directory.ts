/**
 * Ninerdeck (serwer) - `GET /admin/api/directory`: słownik klubu dla panelu
 * (issue #216, „panel dla wszystkich").
 *
 * Trasa KAŻDEGO członka (`capability: null`): odpowiada na to samo pytanie, co
 * `GET /reference` telefonu - „jak podpisać to, co widzę" - i tylko na nie. Listy
 * modułów Piloci i Samoloty zostają na „Podglądzie klubu" (`panel.access`), bo niosą
 * adresy, zakresy, sesje i konfigurację; kalendarz i kolejka decyzji czytają odtąd
 * stąd, a nie stamtąd. Powody: nagłówek `application/admin/contracts/directory.ts`.
 */

import type { FastifyInstance } from 'fastify';

import type { AdminDirectoryQueries } from '../../../application/admin/queries/directory.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

export function registerAdminDirectoryRoutes(
  app: FastifyInstance,
  directory: AdminDirectoryQueries,
  gate: AdminGate,
): void {
  adminRoute(app, gate, { method: 'GET', url: '/directory', capability: null }, async (_req, reply, actor) =>
    reply.send(await directory.of(actor.orgId)),
  );
}
