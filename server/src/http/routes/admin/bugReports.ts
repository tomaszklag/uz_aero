/**
 * UZ Aero (serwer) - trasy modułu „Zgłoszenia" (`/admin/api/bug-reports`, issue #87).
 *
 * Cienkie jak reszta: zod → zapytanie/komenda → status.
 *
 * ══ DWIE RÓŻNE ZDOLNOŚCI NA JEDNYM ZASOBIE ══
 * Odczyt idzie na `panel.access` - lista zgłoszeń jest tym, po co w czasie testów
 * wchodzi się do panelu, i nie ma powodu jej komukolwiek zamykać. Zmiana statusu idzie
 * na `bugs.triage`, bo to decyzja o CUDZYM zgłoszeniu. Ta sama granica, którą
 * `sessions.ts` (odczyt) rysuje wobec `sessionVoid.ts` (zapis).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminBugReportCommands } from '../../../application/admin/commands/bugReports.ts';
import type { AdminBugReportQueries } from '../../../application/admin/queries/bugReports.ts';
import { BUG_STATUSES } from '../../../domain/bugReports.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

/**
 * Filtr statusem w adresie: `?status=new,in_progress`. Pusty parametr = wszystkie.
 *
 * Lista, nie pojedyncza wartość, bo domyślny widok panelu to „nowe i w toku" - jedna
 * wartość zmuszałaby ekran do dwóch żądań i sklejania wyniku po swojej stronie, czyli
 * do liczenia czegoś, co ma policzyć serwer.
 */
const listQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((raw) => (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(BUG_STATUSES))),
});

const params = z.object({ uuid: z.string().min(1).max(100) });

const patchBody = z.object({
  status: z.enum(BUG_STATUSES),
  /** `.trim()` przed `.min(1)`: spacje nie liczą się za komentarz. */
  note: z.string().trim().max(2000).nullable().optional(),
});

export function registerAdminBugReportRoutes(
  app: FastifyInstance,
  queries: AdminBugReportQueries,
  commands: AdminBugReportCommands,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/bug-reports', capability: 'panel.access' },
    async (req, reply) => {
      const parsed = listQuery.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

      return reply.send(await queries.list(parsed.data.status));
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'PATCH', url: '/bug-reports/:uuid', capability: 'bugs.triage' },
    async (req, reply, actor) => {
      const p = params.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'bad_request' });

      const b = patchBody.safeParse(req.body);
      if (!b.success) return reply.code(400).send({ error: 'bad_request' });

      const note = b.data.note == null || b.data.note.length === 0 ? null : b.data.note;
      // Odrzucenie BEZ powodu odbijamy tutaj, a nie w komendzie: to jest reguła
      // redakcyjna panelu („powiedz zgłaszającemu, dlaczego"), nie własność danych -
      // wiersz z `rejected` i pustym komentarzem jest w bazie poprawny i takie stare
      // wiersze mogą istnieć.
      if (b.data.status === 'rejected' && note == null) {
        return reply.code(400).send({ error: 'note_required' });
      }

      const outcome = await commands.setStatus(actor, {
        uuid: p.data.uuid,
        status: b.data.status,
        note,
      });
      if (!outcome.ok) return reply.code(404).send({ error: 'not_found' });

      // Odpowiadamy STANEM PO ZMIANIE, nie pustką: panel odświeża wiersz bez drugiego
      // żądania, a stempel i autor zmiany pochodzą z serwera, nie z zegara przeglądarki.
      const after = await queries.byUuid(p.data.uuid);
      if (after == null) return reply.code(404).send({ error: 'not_found' });
      return reply.send(after);
    },
  );
}
