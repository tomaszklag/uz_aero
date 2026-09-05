/**
 * UZ Aero (serwer) - trasy zgłoszeń rejestracyjnych (`/admin/api/registrations`,
 * logowanie Google 2026-09-04; `docs/logowanie-google.md` §8).
 *
 * Cienkie jak reszta: zod → zapytanie/komenda → status.
 *
 * ══ JEDNA ZDOLNOŚĆ NA CAŁYM ZASOBIE: `accounts.manage` ══
 * Także na ODCZYCIE, inaczej niż przy zgłoszeniach błędów (tam lista jedzie na
 * `panel.access`). Lista zgłoszeń to e-maile i imiona ludzi SPOZA klubu - dane osobowe
 * osób, które jeszcze niczego w tym systemie nie zrobiły. Kto nie może założyć konta,
 * nie ma powodu ich oglądać.
 *
 * Klucz w adresie to `(provider, subject)`, bo taki jest klucz główny tabeli - zgłoszenie
 * nie ma i nie potrzebuje surogatu. `subject` Google jest napisem cyfr, więc jedzie
 * w ścieżce bez kodowania; gdy dojdzie dostawca z egzotycznym `sub`, `encodeURIComponent`
 * po stronie panelu załatwi sprawę bez zmiany kontraktu.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminRegistrationCommands } from '../../../application/admin/commands/registrations.ts';
import type { AdminRegistrationQueries } from '../../../application/admin/queries/registrations.ts';
import { PILOT_ROLES } from '../../../domain/roles.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

const STATUSES = ['pending', 'linked', 'rejected'] as const;

/** `?status=pending,rejected`; pusty = wszystkie (domyślny widok panelu to `pending`). */
const listQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((raw) => (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(STATUSES))),
});

/** Dostawcy wymienieni IMIENNIE - nowy dochodzi tu świadomie, razem z adapterem. */
const keyParams = z.object({
  provider: z.enum(['google']),
  subject: z.string().min(1).max(200),
});

/**
 * Kod normalizujemy do WERSALIKÓW tak samo jak przy zakładaniu konta z panelu
 * (`routes/admin/pilots.ts`): „kza" i „KZA" to w intencji administratora ten sam kod.
 */
const approveBody = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1).max(200),
  role: z.enum(PILOT_ROLES),
});

/** `.trim()` przed `.min(1)`: spacje nie liczą się za powód. */
const rejectBody = z.object({ reason: z.string().trim().min(1).max(500) });

export function registerAdminRegistrationRoutes(
  app: FastifyInstance,
  queries: AdminRegistrationQueries,
  commands: AdminRegistrationCommands,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/registrations', capability: 'accounts.manage' },
    async (req, reply) => {
      const parsed = listQuery.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

      return reply.send(await queries.list(parsed.data.status));
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/registrations/:provider/:subject/approve', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const key = keyParams.safeParse(req.params);
      if (!key.success) return reply.code(400).send({ error: 'bad_request' });

      const body = approveBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await commands.approve(actor, { ...key.data, ...body.data });
      if (!outcome.ok) return refusal(reply, outcome);

      // 201 i STAN PO DECYZJI: panel przestawia wiersz bez drugiego żądania, a stempel
      // i autor decyzji pochodzą z serwera, nie z zegara przeglądarki.
      const after = await queries.byKey(key.data.provider, key.data.subject);
      return reply.code(201).send({ pilot: outcome.result, registration: after });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/registrations/:provider/:subject/reject', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const key = keyParams.safeParse(req.params);
      if (!key.success) return reply.code(400).send({ error: 'bad_request' });

      const body = rejectBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await commands.reject(actor, { ...key.data, reason: body.data.reason });
      if (!outcome.ok) return refusal(reply, outcome);

      const after = await queries.byKey(key.data.provider, key.data.subject);
      return reply.send({ registration: after });
    },
  );
}

/**
 * Wariant odmowy → status i ciało. Jedno miejsce dla obu decyzji, bo odmowa z innym
 * polem w innej trasie to dokładnie ten rozjazd, przed którym broni `authorize.ts`.
 */
function refusal(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  outcome:
    | { ok: false; reason: 'not_found' }
    | { ok: false; reason: 'already_decided'; status: string }
    | { ok: false; reason: 'conflict'; field: 'code' | 'email' },
): unknown {
  switch (outcome.reason) {
    case 'not_found':
      return reply.code(404).send({ error: 'not_found' });
    case 'already_decided':
      return reply.code(409).send({ error: 'already_decided', status: outcome.status });
    case 'conflict':
      return reply.code(409).send({ error: 'conflict', field: outcome.field });
  }
}
