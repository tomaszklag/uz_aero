/**
 * Ninerdeck (serwer) - trasy MODUŁU ORGANIZACJE (`/admin/api/organizations*`; mockupy
 * `organizacje-lista`, `organizacje-klub`; `docs/wielofirmowosc.md` §8.1; issue #100, D3).
 *
 * Jedyne trasy panelu rejestrowane przez `platformRoute`, a nie `adminRoute`: brama pyta
 * o token PLATFORMOWY i rolę z `pilots.platform_role`, a handler dostaje `PlatformActor`
 * BEZ klubu - więc nie ma jak przypadkiem przefiltrować danych po klubie, którego nie ma.
 * Wpis audytu takiej akcji ma puste `org_id` (`auditedWrite.ts`).
 *
 * Administrator KLUBU tych tras nie otwiera i nie dostaje 403, tylko 401: jego sesja jest
 * sesją klubu, a ta nie jest tym rodzajem tokenu (`authorizePlatform`). To ta sama
 * asymetria, co przy zgłoszeniach błędów (issue #99, C6).
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { PlatformOrganizationCommands } from '../../../application/admin/commands/organizations.ts';
import type { AdminPasswordLinkCommands } from '../../../application/admin/commands/passwordLinks.ts';
import { organizationDetail } from '../../../application/admin/mappers/organizationListItem.ts';
import type { PlatformOrganizationQueries } from '../../../application/admin/queries/organizations.ts';
import { isOrgSlug, ORG_SLUG_MAX_LENGTH } from '../../../domain/organizations.ts';
import { tooManyAttempts } from '../common/password.ts';
import { platformRoute, type AdminGate } from './adminRoute.ts';
import { passwordLinkRefusal } from './passwordLinkWire.ts';
import { pilotCode, pilotName } from './pilotFields.ts';

/**
 * Slug: kształt pilnuje DOMENA (`isOrgSlug`), nie drugi regex w walidatorze trasy.
 *
 * Slug jest adresem kart arkusza i po nadaniu się nie zmienia, więc jego kształt jest
 * regułą produktu, a nie szczegółem tego endpointu - dwie definicje rozjechałyby się
 * przy pierwszej poprawce.
 */
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(ORG_SLUG_MAX_LENGTH)
  .refine((value) => isOrgSlug(value), {
    message: 'adres klubu: małe litery i cyfry rozdzielone myślnikami',
  });

const orgName = z.string().trim().min(2).max(120);

/**
 * Pierwszy administrator jest polem WYMAGANYM - klub bez niego nie ma jak zacząć (§8.1).
 *
 * E-mail też: to on podpina tożsamość Google przy pierwszym logowaniu (bootstrap z §3.8),
 * więc inaczej niż przy zwykłym członku (gdzie adres bywa pusty) nie ma tu wartości
 * „bez e-maila".
 */
const createBody = z.object({
  name: orgName,
  slug,
  admin: z.object({
    name: pilotName,
    email: z.string().trim().email().max(200),
    code: pilotCode,
  }),
});

/** Zmiana nazwy. Sluga i kodu klubu ta trasa nie przyjmuje - patrz port. */
/**
 * Łatka karty klubu. Lotnisko przyjmujemy jako `string | null` - `null` znaczy
 * „wyczyść" (§7.1: brak konfiguracji nie blokuje rezerwacji), a pominięcie pola
 * „nie ruszaj". Kształtu kodu ICAO tu NIE sprawdzamy: rozstrzyga o nim katalog
 * lotnisk w komendzie, a wzorzec czterech liter przepuszczałby `ZZZZ`.
 */
const patchBody = z.object({
  name: orgName.optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  homeIcao: z.string().trim().max(8).nullable().optional(),
});

const activeBody = z.object({ active: z.boolean() });

const listQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  active: z.enum(['true', 'false']).optional(),
});

const idParams = z.object({ id: z.string().min(1).max(100) });

const inviteParams = z.object({
  id: z.string().min(1).max(100),
  pilotId: z.string().min(1).max(100),
});

export function registerPlatformOrganizationRoutes(
  app: FastifyInstance,
  organizations: PlatformOrganizationCommands,
  queries: PlatformOrganizationQueries,
  /** Zaproszenie pierwszego administratora (2.1.0, D8) - ten sam list, co reset hasła. */
  passwordLinks: AdminPasswordLinkCommands,
  gate: AdminGate,
): void {
  /**
   * „Wyślij ponownie" na karcie klubu (mockup `organizacje-klub`; 2.1.0,
   * `docs/logowanie-haslem.md` §5.4, D8): list z linkiem „ustaw hasło" ważnym 72 h do
   * administratora TEGO klubu. Cudzy klub i osoba, która nie jest jego administratorem,
   * to jedno `404`. Odpowiedź niesie adres i termin - nigdy link.
   */
  platformRoute(
    app,
    gate,
    { method: 'POST', url: '/organizations/:id/admins/:pilotId/invite', capability: 'platform.manage' },
    async (req, reply, actor) => {
      const params = inviteParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await passwordLinks.invite(actor, params.data.id, params.data.pilotId);
      if (!outcome.ok) {
        if (outcome.reason === 'rate_limited') return tooManyAttempts(reply, outcome.retryAfterSec);
        return passwordLinkRefusal(reply, outcome.reason);
      }
      return reply.send({ sentTo: outcome.result.sentTo, expiresAt: outcome.result.expiresAt.toISOString() });
    },
  );

  platformRoute(
    app,
    gate,
    { method: 'GET', url: '/organizations', capability: 'platform.manage' },
    async (req, reply) => {
      const query = listQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const q = query.data;
      return reply.send(
        await queries.list({
          search: q.q,
          active: q.active === undefined ? undefined : q.active === 'true',
        }),
      );
    },
  );

  platformRoute(
    app,
    gate,
    { method: 'POST', url: '/organizations', capability: 'platform.manage' },
    async (req, reply, actor) => {
      const body = createBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await organizations.create(actor, body.data);
      if (!outcome.ok) return refusal(reply, outcome);

      // Zaproszenie PIERWSZEGO administratora (2.1.0, D8) - list z linkiem „ustaw hasło"
      // (72 h) idzie razem z założeniem klubu, ale PO nim: klub jest faktem niezależnie
      // od poczty. Gdy list nie wyszedł, karta klubu pokazuje to samo „Wyślij ponownie",
      // co przy wygasłym zaproszeniu - stąd `invite: null` zamiast odmowy.
      const wanted = body.data.admin.email.toLowerCase();
      const admin = outcome.result.admins.find((a) => a.email?.toLowerCase() === wanted);
      const invited = admin == null ? null : await passwordLinks.invite(actor, outcome.result.id, admin.pilotId);

      // Mapper TEN SAM, co na liście: kod klubu w zapisie kanonicznym i stemple jako
      // ISO 8601 składa serwer, więc odpowiedź mutacji ma kształt wiersza, który panel
      // właśnie odświeży. Oddanie tu modelu portu dałoby dwa kształty jednego klubu.
      return reply.code(201).send({
        organization: organizationDetail(outcome.result),
        invite:
          invited?.ok === true
            ? { sentTo: invited.result.sentTo, expiresAt: invited.result.expiresAt.toISOString() }
            : null,
      });
    },
  );

  platformRoute(
    app,
    gate,
    { method: 'GET', url: '/organizations/:id', capability: 'platform.manage' },
    async (req, reply) => {
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const organization = await queries.byId(params.data.id);
      if (organization == null) return reply.code(404).send({ error: 'not_found' });

      return reply.send({ organization });
    },
  );

  platformRoute(
    app,
    gate,
    { method: 'PATCH', url: '/organizations/:id', capability: 'platform.manage' },
    async (req, reply, actor) => {
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = patchBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await organizations.update(actor, params.data.id, body.data);
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.send({ organization: organizationDetail(outcome.result) });
    },
  );

  platformRoute(
    app,
    gate,
    // Wyłączenie klubu i włączenie go z powrotem - jedna trasa, bo jedna decyzja
    // w dwie strony (wzorzec `POST /pilots/:id/active`). Kasowania klubu nie ma:
    // dziennik jest jego dokumentem.
    { method: 'POST', url: '/organizations/:id/active', capability: 'platform.manage' },
    async (req, reply, actor) => {
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = activeBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await organizations.setActive(actor, params.data.id, body.data.active);
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.send({ organization: organizationDetail(outcome.result) });
    },
  );
}

/**
 * Wariant odmowy → status i ciało. 409 `conflict` niesie POLE, bo oba zajęte pola da się
 * poprawić w formularzu: `slug` jest adresem klubu (jedyny na serwerze), `email` wskazuje
 * osobę, która jest już administratorem tego klubu.
 */
function refusal(reply: FastifyReply, outcome: { reason: string; field?: string }): unknown {
  if (outcome.reason === 'not_found') return reply.code(404).send({ error: 'not_found' });
  if (outcome.reason === 'no_changes') return reply.code(400).send({ error: 'no_changes' });
  // Wpis nie do przyjęcia (kod spoza katalogu, nieznana strefa) - 400 z POLEM, żeby
  // odmowa wróciła pod to pole w formularzu, a nie banerem nad całą kartą.
  if (outcome.reason === 'invalid') {
    return reply.code(400).send({ error: 'invalid', field: outcome.field });
  }
  return reply.code(409).send({ error: 'conflict', field: outcome.field });
}
