/**
 * UZ Aero (serwer) — trasy preferencji pilota: `GET /me/prefs` i `PUT /me/prefs`
 * (decyzja 2026-07-29: motyw wędruje za pilotem między urządzeniami).
 *
 * Cienkie jak reszta: zod → komenda → status. Tożsamość WYŁĄCZNIE z tokenu (`/me`),
 * nigdy z body — jeden pilot nie ma jak pisać w cudzym profilu. Odpowiedź PUT jest
 * ZAWSZE stanem autorytatywnym po operacji (LWW rozstrzyga komenda + SQL) — starszy
 * stempel dostaje 200 ze zwycięzcą w treści, nie błąd: przegrana w LWW to normalny
 * wynik uzgadniania, a nie wina żądania.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { PrefsCommands } from '../../application/commands/prefs.ts';
import type { PilotPrefs, TokenService } from '../../application/ports.ts';
import { authorize } from '../authorize.ts';

/**
 * Serwer nie zna listy motywów (tokeny UI aplikacji) — pilnuje tylko, żeby nazwa
 * była niepustym, krótkim tekstem, a stempel poprawnym ISO (UTC, jak `toISOString`).
 */
const putBody = z.object({
  theme: z.string().min(1).max(40),
  themeUpdatedAt: z.string().datetime(),
});

const toWire = (p: PilotPrefs) => ({
  theme: p.theme,
  themeUpdatedAt: p.themeUpdatedAt?.toISOString() ?? null,
});

export function registerPrefsRoutes(
  app: FastifyInstance,
  prefs: PrefsCommands,
  tokens: TokenService,
): void {
  app.get('/me/prefs', async (req, reply) => {
    const claims = authorize(tokens, req.headers.authorization);
    if (claims == null) return reply.code(401).send({ error: 'unauthorized' });

    const current = await prefs.get(claims.pilotId);
    if (current == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send(toWire(current));
  });

  app.put('/me/prefs', async (req, reply) => {
    const claims = authorize(tokens, req.headers.authorization);
    if (claims == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = putBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const after = await prefs.put(
      claims.pilotId,
      parsed.data.theme,
      new Date(parsed.data.themeUpdatedAt),
    );
    if (after == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send(toWire(after));
  });
}
