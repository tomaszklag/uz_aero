/**
 * UZ Aero (serwer) — trasa śladu lotu w panelu (`GET /admin/api/sessions/:uuid/track/:flight`,
 * mockup `A02c-slad.html`).
 *
 * Adres jest zagnieżdżony pod sesją, a nie osobny (`/tracks/:id`), bo ślad nie ma
 * własnej tożsamości: istnieje wyłącznie jako wycinek zapisu sesji wyznaczony przez
 * lot z rejestru. Identyfikator, którego nie ma w danych, trzeba by wymyślić — a każdy
 * wymyślony klucz to kolejna rzecz do utrzymania w zgodzie z rzeczywistością.
 *
 * Zdolność `panel.access`, jak przy karcie dnia: ślad jest ODCZYTEM tego samego dnia,
 * pokazanym inaczej. Gdyby kiedyś zapadła decyzja, że trasy pilotów widzi wąższy krąg
 * niż reszta karty dnia, to jest jedno miejsce, w którym się ją zapisuje.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminFlightTrackQueries } from '../../../application/admin/queries/flightTrack.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

const params = z.object({
  uuid: z.string().min(1).max(100),
  // Numer lotu w dniu. Górna granica jest hojna z premedytacją — dzień skokowy potrafi
  // mieć kilkadziesiąt wzlotów, a limit ma chronić przed absurdem, nie przed rekordem.
  flight: z.coerce.number().int().positive().max(500),
});

export function registerAdminTrackRoutes(
  app: FastifyInstance,
  tracks: AdminFlightTrackQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/sessions/:uuid/track/:flight', capability: 'panel.access' },
    async (req, reply) => {
      const parsed = params.safeParse(req.params);
      if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await tracks.byFlight(parsed.data.uuid, parsed.data.flight);
      if (!outcome.ok) return reply.code(404).send({ error: outcome.reason });

      return reply.send(outcome.track);
    },
  );
}
