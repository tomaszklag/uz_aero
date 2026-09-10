/**
 * UZ Aero (serwer) - trasy KODU KLUBU (`/admin/api/club-code*`; mockup
 * `piloci-kod-klubu`; `docs/wielofirmowosc.md` §3.8, §8.3; issue #100, D2).
 *
 * Trzy trasy, bo trzy pytania: jaki kod obowiązuje, nowy kod, koniec dołączania kodem.
 * Wszystkie na `accounts.manage` - kod klubu jest włącznikiem JEDYNEJ drogi do klubu,
 * więc jego zmiana jest tą samą władzą, co decyzja o zgłoszeniu.
 *
 * ══ KLUB BIERZE SIĘ Z SESJI, NIE Z ADRESU ══
 * Dlatego w adresie nie ma identyfikatora klubu: panel klubu prowadzi SWÓJ kod i tylko
 * swój. Kod innego klubu czyta wyłącznie moduł Organizacje (`platform.manage`) - i też
 * tylko do odczytu (§8.1).
 *
 * ══ DLACZEGO `POST`, A NIE `PATCH /club-code` ══
 * Bo rotacja nie przyjmuje WARTOŚCI: kodu nie da się wpisać z ręki, tylko wylosować
 * (inaczej klub dobierałby sobie kody łatwe do zgadnięcia, a dwa kluby zderzałyby się
 * o ten sam napis). Żądanie nie ma więc ciała, a trasa jest czynnością, nie zmianą pola.
 */

import type { FastifyInstance } from 'fastify';

import type { AdminClubCodeCommands } from '../../../application/admin/commands/clubCode.ts';
import { clubCodeView, type AdminClubCodeQueries } from '../../../application/admin/queries/clubCode.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

export function registerAdminClubCodeRoutes(
  app: FastifyInstance,
  clubCode: AdminClubCodeCommands,
  queries: AdminClubCodeQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/club-code', capability: 'accounts.manage' },
    async (_req, reply, actor) => reply.send(await queries.state(actor.orgId)),
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/club-code/rotate', capability: 'accounts.manage' },
    async (_req, reply, actor) => {
      const outcome = await clubCode.rotate(actor);
      // Rotacja nie ma wariantu odmowy: wylosowanie kodu jest zawsze możliwe, a brak
      // poprzedniego (dołączanie było wyłączone) jest stanem, nie przeszkodą.
      if (!outcome.ok) return reply.code(400).send({ error: outcome.reason });

      return reply.send(clubCodeView(outcome.result));
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/club-code/disable', capability: 'accounts.manage' },
    async (_req, reply, actor) => {
      const outcome = await clubCode.disable(actor);
      // `no_changes` = kod już był wyłączony. 400 z nazwanym powodem, jak przy koncie
      // bez zmian: to nie awaria, tylko żądanie, które nie ma czego zmienić.
      if (!outcome.ok) return reply.code(400).send({ error: outcome.reason });

      return reply.send(clubCodeView(outcome.result));
    },
  );
}
