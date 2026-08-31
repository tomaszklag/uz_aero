/**
 * UZ Aero (serwer) - ślad sesji w panelu (`GET /admin/api/sessions/:uuid/track`).
 *
 * ══ DLACZEGO SESJA, A NIE LOT ══
 * Do panelu 2.0 stała tu trasa `/sessions/:uuid/track/:flight` - ślad JEDNEGO lotu,
 * wycinany z nagrania oknem start→lądowanie. Pochodziła sprzed issue #38, kiedy tak
 * właśnie rozumieliśmy ślad. Dziś wiadomo, że zapis GPS powstaje w jednym ciągu od
 * uruchomienia do wyłączenia silnika, więc należy do SESJI, a loty są jego odcinkami:
 * kołowanie między nimi to ten sam bieg i ten sam materiał. Trasa per lot kazała
 * administratorowi oglądać dzień w kawałkach i gubiła wszystko, co działo się na ziemi.
 *
 * Adres zostaje zagnieżdżony pod sesją (nie osobny `/tracks/:id`), bo ślad nie ma własnej
 * tożsamości: istnieje wyłącznie jako geometria zapisu sesji. Identyfikator, którego nie
 * ma w danych, trzeba by wymyślić - a każdy wymyślony klucz to kolejna rzecz do utrzymania
 * w zgodzie z rzeczywistością.
 *
 * Zdolność `panel.access`, jak przy dzienniku: ślad jest ODCZYTEM tej samej sesji,
 * pokazanym inaczej. Gdyby kiedyś zapadła decyzja, że trasy pilotów widzi węższy krąg niż
 * reszta dziennika, to jest jedno miejsce, w którym się ją zapisuje.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { SessionTrackQueries } from '../../../application/common/queries/sessionTrack.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

const params = z.object({
  uuid: z.string().min(1).max(100),
});

export function registerAdminTrackRoutes(
  app: FastifyInstance,
  tracks: SessionTrackQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/sessions/:uuid/track', capability: 'panel.access' },
    async (req, reply) => {
      const parsed = params.safeParse(req.params);
      if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await tracks.bySession(parsed.data.uuid);
      if (!outcome.ok) return reply.code(404).send({ error: outcome.reason });

      // `picId` zostaje po stronie serwera: panel wie, kto latał, z karty sesji
      // (`GET /admin/api/sessions/:uuid`), a koperta śladu niesie WYŁĄCZNIE geometrię.
      // Dołożenie tu nazwiska stworzyłoby drugą odpowiedź na to samo pytanie.
      return reply.send(outcome.track);
    },
  );
}
