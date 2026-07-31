/**
 * UZ Aero (serwer) — trasa `POST /events` (§4.3–4.5).
 *
 * Koperta zdarzenia (§5.1) waliduje to, co chroni BAZĘ (typy kolumn, limity długości),
 * nie semantykę lotu — serwer przyjmuje i flaguje, nie odrzuca (§4.5). Payload idzie
 * jako JSON: jego znaczenie zna wspólna domena, a `schemaVersion` w każdym zdarzeniu
 * pozwala starszym klientom żyć obok nowszych.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EVENT_TYPES, type Event } from '@uzaero/domain';

import type { IngestCommands } from '../../../application/mobile/commands/ingest.ts';
import type { TokenService } from '../../../application/common/ports.ts';
import { authorize } from '../../authorize.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';
import { payloadValid } from './eventPayloads.ts';

/** Eksportowana dla testu kontraktowego zod ↔ typ domenowy. */
export const eventEnvelope = z.object({
  uuid: z.string().min(8).max(100),
  sessionUuid: z.string().min(1).max(100),
  aircraftId: z.string().min(1).max(50),
  picId: z.string().min(1).max(50),
  dualId: z.string().min(1).max(50).nullable(),
  type: z.enum(EVENT_TYPES as [string, ...string[]]),
  deviceTime: z.number().int().nonnegative(),
  gpsTime: z.number().int().nonnegative().nullable(),
  payload: z.record(z.unknown()),
  schemaVersion: z.number().int().positive(),
});

const eventsBody = z.object({
  events: z.array(eventEnvelope).min(1).max(500),
  sourceDevice: z.string().max(100).optional(),
});

export function registerEventsRoutes(
  app: FastifyInstance,
  ingest: IngestCommands,
  tokens: TokenService,
): void {
  app.post('/events', async (req, reply) => {
    const who = authorize(tokens, tokenFromRequest(req));
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = eventsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    // Payload per typ (audyt): zepsuty payload dawałby 500 w transakcji i wieczny
    // retry telefonu albo NaN na stałe w projekcji. 400 mówi klientowi „nie ponawiaj".
    if (parsed.data.events.some((e) => !payloadValid(e.type, e.payload))) {
      return reply.code(400).send({ error: 'bad_payload' });
    }

    const outcome = await ingest.ingest(
      who.pilotId,
      parsed.data.events as unknown as Event[],
      parsed.data.sourceDevice ?? null,
    );
    if (!outcome.ok) {
      // Single-writer (§4.4): zdarzenia sesji wysyła wyłącznie telefon jej PIC-a.
      return reply.code(403).send({ error: outcome.reason });
    }
    return reply.send(outcome.result);
  });
}
