/**
 * UZ Aero (serwer) — trasy rejestru zdarzeń telefonu: `POST /events` (§4.3–4.5)
 * i `GET /me/events` (§4.9, issue #32).
 *
 * Koperta zdarzenia (§5.1) waliduje to, co chroni BAZĘ (typy kolumn, limity długości),
 * nie semantykę lotu — serwer przyjmuje i flaguje, nie odrzuca (§4.5). Payload idzie
 * jako JSON: jego znaczenie zna wspólna domena, a `schemaVersion` w każdym zdarzeniu
 * pozwala starszym klientom żyć obok nowszych.
 *
 * Obie trasy w jednym pliku, bo to JEDEN zasób z dwoma kierunkami: wysyłka outboxa
 * i odtworzenie rejestru na urządzeniu, które go straciło. Ta sama koperta w obie
 * strony — dlatego jest tu jedna definicja, a nie dwie żyjące osobno.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EVENT_TYPES, type Event } from '@uzaero/domain';

import type { IngestCommands } from '../../../application/mobile/commands/ingest.ts';
import {
  MY_EVENTS_MAX_LIMIT,
  MY_EVENTS_PAGE_LIMIT,
  type MyEventQueries,
} from '../../../application/mobile/queries/myEvents.ts';
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

/**
 * Zapytanie o stronę własnego rejestru. Bez filtrów po dacie, typie czy samolocie —
 * to nie jest przeglądarka rejestru (od tego jest `A04` w panelu), tylko odtworzenie
 * strumienia. Filtr znaczyłby tu „odbuduj niepełną historię", czyli dokładnie ten stan,
 * z którego telefon próbuje wyjść.
 */
const myEventsQuery = z.object({
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().positive().max(MY_EVENTS_MAX_LIMIT).default(MY_EVENTS_PAGE_LIMIT),
});

export function registerEventsRoutes(
  app: FastifyInstance,
  ingest: IngestCommands,
  myEvents: MyEventQueries,
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

  /**
   * Odtworzenie rejestru na urządzeniu (§4.9, issue #32). Tożsamość WYŁĄCZNIE z tokenu,
   * jak w całym `/me/*`: gdyby pilot mógł podać `picId` w zapytaniu, endpoint
   * odbudowujący własny strumień stałby się czytnikiem cudzych dni.
   *
   * Pusty rejestr to `{ events: [], nextCursor: null }` ze statusem 200, nie 404 —
   * pilot bez ani jednej sesji jest stanem normalnym (pierwszy dzień w klubie).
   */
  app.get('/me/events', async (req, reply) => {
    const who = authorize(tokens, tokenFromRequest(req));
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const query = myEventsQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'bad_request' });

    const outcome = await myEvents.page(
      who.pilotId,
      query.data.cursor ?? null,
      query.data.limit,
    );
    // 400, nie 500: kursor przychodzi z zewnątrz. Ciche zaczęcie od pierwszej strony
    // byłoby gorsze — telefon dopisałby do rejestru drugą kopię tego, co już ma
    // (dedup po uuid by ją zjadł), sądząc jednocześnie, że posunął się naprzód.
    if (!outcome.ok) return reply.code(400).send({ error: outcome.reason });

    return reply.send(outcome.page);
  });
}
