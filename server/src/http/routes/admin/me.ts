/**
 * Ninerdeck (serwer) - `GET /admin/api/me`: kto jest zalogowany w panelu.
 *
 * Istnieje wyłącznie dlatego, że ciasteczko sesji jest `HttpOnly`: po odświeżeniu
 * karty panel nie ma jak odczytać własnej tożsamości i musi o nią zapytać.
 *
 * ══ ODPOWIADA OBU RODZAJOM SESJI (wielofirmowość, issue #101, E1) ══
 * Do epiku E trasa stała na `adminRoute`, czyli na bramie KLUBU - a superadministrator
 * ma sesję PLATFORMOWĄ. Po odświeżeniu karty dostawał więc 401 i lądował na ekranie
 * logowania, z którego przed chwilą wszedł. Pytanie „kim jestem" zadają obie sesje
 * i obie mają prawo dostać odpowiedź, więc trasa idzie przez `sessionRoute`.
 *
 * Zdolność sprawdza brama: `panel.access` dla klubu, `platform.manage` dla platformy.
 * Konto, które straciło rolę, dostanie 401 albo 403 z podanym powodem i panel pokaże
 * ekran logowania zamiast pustej ramy.
 */

import type { FastifyInstance } from 'fastify';

import type { AuthCommands } from '../../../application/common/commands/auth.ts';
import type { AdminMeQueries } from '../../../application/admin/queries/me.ts';
import { sessionRoute, type AdminGate } from './adminRoute.ts';
import { panelSessionToWire, platformSessionToWire } from './auth.ts';

export function registerAdminMeRoutes(
  app: FastifyInstance,
  me: AdminMeQueries,
  auth: AuthCommands,
  gate: AdminGate,
): void {
  sessionRoute(app, gate, { method: 'GET', url: '/me' }, {
    org: async (_req, reply, actor) => {
      const pilot = await me.get(actor.pilotId, actor.orgId);
      // Token ważny, konto skasowane albo wyłączone → 401, nie 404: pytanie brzmi
      // „kim jestem", a odpowiedź „nikim" znaczy dla panelu dokładnie „zaloguj się".
      if (pilot == null) return reply.code(401).send({ error: 'unauthorized' });

      return reply.send(
        panelSessionToWire(pilot, actor.capabilities, await auth.panelScopes(actor.pilotId)),
      );
    },

    platform: async (_req, reply, actor) => {
      const person = await me.platform(actor.pilotId);
      if (person == null) return reply.code(401).send({ error: 'unauthorized' });

      return reply.send(
        platformSessionToWire(
          { id: person.id, name: person.name, platformRole: actor.platformRole },
          await auth.panelScopes(actor.pilotId),
        ),
      );
    },
  });

  /**
   * `GET /admin/api/me/account` - adres i metody logowania zalogowanego (2.1.0,
   * issue #134 D6; mockup `konto`, karta „Logowanie").
   *
   * Osobno od `/me` z powodu opisanego przy `AdminMeQueries.account`. Obie odmiany
   * sesji, bo hasło i metody ma każdy zalogowany - superadministrator tak samo jak
   * administrator klubu.
   */
  sessionRoute(app, gate, { method: 'GET', url: '/me/account' }, {
    org: async (_req, reply, actor) => {
      const account = await me.account(actor.pilotId);
      if (account == null) return reply.code(401).send({ error: 'unauthorized' });
      return reply.send(account);
    },
    platform: async (_req, reply, actor) => {
      const account = await me.account(actor.pilotId);
      if (account == null) return reply.code(401).send({ error: 'unauthorized' });
      return reply.send(account);
    },
  });
}
