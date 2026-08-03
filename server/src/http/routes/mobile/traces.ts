/**
 * UZ Aero (serwer) — trasa `POST /traces` (ślad kalibracyjny GPS, faza 5).
 *
 * Niskopriorytetowy zrzut z telefonów: koperta luźna z premedytacją — to materiał
 * badawczy, nie rejestr; przyszły wpis barometru (nowy `kind`) nie może wymagać
 * zmiany serwera. Walidujemy tylko ramy: tablica obiektów, limit wielkości paczki.
 * Tożsamość z JWT dopisuje się do każdego wiersza (czyj telefon nagrał).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { TokenService, TraceSinkPort } from '../../../application/common/ports.ts';
import { authorize } from '../../authorize.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

const envelope = z.object({
  entries: z.array(z.record(z.unknown())).min(1).max(5000),
});

export function registerTracesRoutes(
  app: FastifyInstance,
  traces: TraceSinkPort,
  tokens: TokenService,
): void {
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
