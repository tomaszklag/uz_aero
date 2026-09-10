/**
 * Ninerdeck (serwer) - ŚLAD GPS w obie strony: `POST /traces` (wysyłka nagrania, faza 5)
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
 * Od epiku C (issue #99) sesja z paczki, jeśli serwer ją zna, musi należeć do klubu
 * i pilota z tokenu - rozstrzyga `TraceCommands`, nie ta trasa.
 *
 * `GET /me/sessions/:uuid/track` - gotowa geometria po kompresji (RDP na linii
 * i na profilu, próbka logu, liczby przycięte do rozdzielczości): telefon nie dostaje
 * ani jednego surowego fixa, bo nie ma z nim co zrobić. Uprawnienie sprawdza
 * `MySessionTrackQueries` na PIC-u sesji, nie ta trasa - to reguła o danych, nie o HTTP.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { TraceCommands } from '../../../application/mobile/commands/traces.ts';
import type { MySessionTrackQueries } from '../../../application/mobile/queries/sessionTrack.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';

const envelope = z.object({
  entries: z.array(z.record(z.unknown())).min(1).max(5000),
});

const trackParams = z.object({
  uuid: z.string().min(1).max(100),
});

export function registerTracesRoutes(
  app: FastifyInstance,
  traces: TraceCommands,
  sessionTrack: MySessionTrackQueries,
  gate: MemberGate,
): void {
  app.get('/me/sessions/:uuid/track', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = trackParams.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request' });
    }

    const outcome = await sessionTrack.bySession(who.orgId, who.pilotId, parsed.data.uuid);
    if (!outcome.ok) {
      // Cudza sesja dostaje 404, nie 403: potwierdzenie „istnieje, ale nie twoja"
      // byłoby odpowiedzią na pytanie, którego pytający nie ma prawa zadać.
      return reply.code(404).send({ error: outcome.reason === 'not_yours' ? 'no_session' : outcome.reason });
    }

    return reply.send(outcome.track);
  });

  app.post('/traces', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = envelope.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_envelope' });
    }

    const outcome = await traces.append(
      { pilotId: who.pilotId, orgId: who.orgId },
      parsed.data.entries,
    );
    // Cała paczka albo nic - ślad nie ma księgowości per wpis (patrz `TraceCommands`).
    if (!outcome.ok) return reply.code(403).send({ error: outcome.reason });
    return reply.send({ accepted: outcome.accepted });
  });
}
