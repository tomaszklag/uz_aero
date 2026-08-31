/**
 * UZ Aero (serwer) - ŚLAD GPS w obie strony: `POST /traces` (wysyłka nagrania, faza 5)
 * i `GET /me/sessions/:uuid/track` (ślad sesji do narysowania, issue #47).
 *
 * Obie trasy w jednym pliku, bo to JEDEN materiał z dwoma kierunkami - dokładnie jak
 * `POST /events` i `GET /me/events` w `events.ts`. Rozdzielenie ich sugerowałoby dwa
 * niezależne zasoby, a od issue #47 są ściśle sprzężone: telefon oddaje nagranie
 * WŁAŚNIE PO TO, żeby móc je potem pobrać z powrotem i narysować.
 *
 * `POST /traces` - niskopriorytetowy zrzut z telefonów: koperta luźna z premedytacją,
 * bo to materiał badawczy, nie rejestr; przyszły wpis barometru (nowy `kind`) nie może
 * wymagać zmiany serwera. Walidujemy tylko ramy: tablica obiektów, limit wielkości
 * paczki. Tożsamość z JWT dopisuje się do każdego wiersza (czyj telefon nagrał).
 *
 * `GET /me/sessions/:uuid/track` - gotowa geometria po kompresji (RDP na linii
 * i na profilu, próbka logu, liczby przycięte do rozdzielczości): telefon nie dostaje
 * ani jednego surowego fixa, bo nie ma z nim co zrobić. Uprawnienie sprawdza
 * `MySessionTrackQueries` na PIC-u sesji, nie ta trasa - to reguła o danych, nie o HTTP.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { MySessionTrackQueries } from '../../../application/mobile/queries/sessionTrack.ts';
import type { TokenService, TraceSinkPort } from '../../../application/common/ports.ts';
import { authorize } from '../../authorize.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

const envelope = z.object({
  entries: z.array(z.record(z.unknown())).min(1).max(5000),
});

const trackParams = z.object({
  uuid: z.string().min(1).max(100),
});

export function registerTracesRoutes(
  app: FastifyInstance,
  traces: TraceSinkPort,
  sessionTrack: MySessionTrackQueries,
  tokens: TokenService,
): void {
  app.get('/me/sessions/:uuid/track', async (req, reply) => {
    const identity = authorize(tokens, tokenFromRequest(req));
    if (identity == null) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = trackParams.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request' });
    }

    const outcome = await sessionTrack.bySession(identity.pilotId, parsed.data.uuid);
    if (!outcome.ok) {
      // Cudza sesja dostaje 404, nie 403: potwierdzenie „istnieje, ale nie twoja"
      // byłoby odpowiedzią na pytanie, którego pytający nie ma prawa zadać.
      return reply.code(404).send({ error: outcome.reason === 'not_yours' ? 'no_session' : outcome.reason });
    }

    return reply.send(outcome.track);
  });

  app.post('/traces', async (req, reply) => {
    const identity = authorize(tokens, tokenFromRequest(req));
    if (identity == null) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = envelope.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_envelope' });
    }

    await traces.append(identity.pilotId, parsed.data.entries);
    return reply.send({ accepted: parsed.data.entries.length });
  });
}
