/**
 * Ninerdeck (serwer) - trasy kont pilotów (`/admin/api/pilots*`, mockupy `A06`, `A06a`).
 *
 * Cienkie jak reszta repo: zod → komenda → status. Trasa nie zna ani transakcji, ani
 * audytu, ani reguły „kto nie może odciąć kogo" - to wszystko jest w komendzie
 * i w `domain/accountGuards.ts`.
 *
 * ══ DOPISANIA CZŁONKA TU NIE MA (issue #100, D3) ══
 * `POST /pilots` zniknęło razem z drogą, którą opisywało: z panelu KLUBU nie da się
 * nikogo dopisać adresem ani linkiem. Nowy członek wchodzi kodem klubu, a decyzję o nim
 * podejmują trasy `/memberships/*`; pierwszego administratora klubu zakłada moduł
 * Organizacje (`platform.manage`).
 *
 * ══ ZDOLNOŚĆ JEST TU ROZSZCZEPIONA I TO JEST TREŚĆ EKRANU ══
 * `GET` wymaga `panel.access`, każda mutacja - `accounts.manage`. Mockup A06 mówi to
 * wprost: „Szef wyszkolenia widzi tę listę, ale bez przycisków - potrzebuje jej do
 * statystyk i flag, nie do zarządzania dostępem". Przyciski w panelu są wtedy WIDOCZNE
 * i zablokowane z powodem, a nie ukryte; serwer i tak odmawia, bo ukrycie przycisku
 * nigdy nie było zabezpieczeniem.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminPilotCommands } from '../../../application/admin/commands/pilots.ts';
import type { AdminPilotQueries } from '../../../application/admin/queries/pilots.ts';
import { PAGE_LIMIT_MAX } from '../../../application/admin/ports.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { dayParam, endOfDay } from './dayRange.ts';
import {
  accountToWire,
  pilotCode,
  pilotEmail,
  pilotIdParams,
  pilotName,
  pilotRole,
} from './pilotFields.ts';

const roles = z
  .union([pilotRole, z.array(pilotRole)])
  .transform((value) => (Array.isArray(value) ? value : [value]));

const listQuery = z.object({
  active: z.enum(['true', 'false']).optional(),
  role: roles.optional(),
  /** Fragment kodu, nazwiska albo e-maila - dopasowanie zawierające, nie dokładne. */
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().positive().max(PAGE_LIMIT_MAX).default(200),
  /** Okno kolumny „dni lotne”; brak = bieżący miesiąc UTC (liczy zapytanie). */
  from: dayParam.optional(),
  to: dayParam.optional(),
});

/**
 * Wszystkie pola opcjonalne, bo `PATCH` opisuje ZMIANĘ, nie stan docelowy. Pusty obiekt
 * przejdzie walidację i odbije się o `no_changes` w komendzie - i tak ma być: to jest
 * pytanie o świat („czy coś się zmienia"), a nie o kształt żądania.
 */
const patchBody = z.object({
  code: pilotCode.optional(),
  name: pilotName.optional(),
  email: pilotEmail.optional(),
  role: pilotRole.optional(),
});

const activeBody = z.object({ active: z.boolean() });

export function registerAdminPilotRoutes(
  app: FastifyInstance,
  pilots: AdminPilotCommands,
  queries: AdminPilotQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    // `panel.access`, nie `accounts.manage`: listę CZYTA każdy, kto ma wejście do
    // panelu. Ta sama trasa jest słownikiem pilotów dla filtrów innych ekranów (`A02`).
    { method: 'GET', url: '/pilots', capability: 'panel.access' },
    async (req, reply, actor) => {
      const query = listQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const q = query.data;
      // Lista CZŁONKÓW klubu z sesji (wielofirmowość) - nie wszystkich osób serwera.
      return reply.send(
        await queries.list(actor.orgId, {
          active: q.active === undefined ? undefined : q.active === 'true',
          roles: q.role,
          search: q.q,
          direction: q.sort,
          limit: q.limit,
          fromMs: q.from,
          toMs: endOfDay(q.to),
        }),
      );
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'PATCH', url: '/pilots/:id', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = pilotIdParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = patchBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await pilots.update(actor, params.data.id, body.data);
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.send({
        pilot: accountToWire(outcome.result.account, new Date()),
        revokedSessions: outcome.result.revokedSessions,
      });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/pilots/:id/active', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = pilotIdParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = activeBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await pilots.setActive(actor, params.data.id, body.data.active);
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.send({
        pilot: accountToWire(outcome.result.account, new Date()),
        revokedSessions: outcome.result.revokedSessions,
      });
    },
  );

  adminRoute(
    app,
    gate,
    // `DELETE`, nie `POST /pilots/:id/delete`: usunięcie zasobu to metoda HTTP, która
    // dokładnie to znaczy, a odpowiedź nie niesie treści. Nagłówka CSRF wymaga tak samo
    // jak reszta mutacji (`SAFE_METHODS` to wyłącznie GET/HEAD/OPTIONS).
    { method: 'DELETE', url: '/pilots/:id', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = pilotIdParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await pilots.remove(actor, params.data.id);
      if (!outcome.ok) return refusal(reply, outcome);

      // 204, nie 200 z wierszem: wiersza już nie ma, więc nie ma czego oddać. Panel
      // i tak przeładowuje listę - to ona jest stanem po operacji.
      return reply.code(204).send();
    },
  );

}

/**
 * Wariant odmowy → status i ciało. Jedno miejsce, bo cztery trasy odmawiają tak samo,
 * a odmowa z innym polem w innej trasie to dokładnie ten rozjazd, przed którym broni
 * `authorize.ts`.
 *
 * **409 `refused` niesie POWÓD.** „Nie można" bez wyjaśnienia przy przycisku
 * „Deaktywuj" kazałoby administratorowi zgadywać, czy to awaria, czy zasada -
 * a to jest dokładnie ta chwila, w której człowiek sięga po `UPDATE` w psql.
 */
function refusal(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  outcome: { reason: string; field?: 'code' | 'email'; refusal?: string },
): unknown {
  if (outcome.reason === 'not_found') return reply.code(404).send({ error: 'not_found' });
  if (outcome.reason === 'no_changes') return reply.code(400).send({ error: 'no_changes' });
  if (outcome.reason === 'conflict') {
    return reply.code(409).send({ error: 'conflict', field: outcome.field });
  }
  return reply.code(409).send({ error: 'refused', reason: outcome.refusal });
}
