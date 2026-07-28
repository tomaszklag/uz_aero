/**
 * UZ Aero (serwer) — warstwa HTTP (Fastify).
 *
 * Trasy są CIENKIE: walidacja zod → wywołanie komendy/zapytania → mapowanie wyniku
 * na status HTTP. Zero logiki — logika mieszka w `application/`, a `buildServer`
 * dostaje ją gotową (composition root w `index.ts`; testy składają własną z PGlite).
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuthCommands } from '../application/commands/auth.ts';
import type { ReferenceQueries } from '../application/queries/reference.ts';
import type { TokenService } from '../application/ports.ts';

export interface ServerDeps {
  auth: AuthCommands;
  reference: ReferenceQueries;
  tokens: TokenService;
}

const loginBody = z.object({
  login: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

const refreshBody = z.object({ refreshToken: z.string().min(1).max(500) });

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  // ── auth ──────────────────────────────────────────────────────────────────────

  app.post('/auth/login', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const result = await deps.auth.login(parsed.data.login, parsed.data.password);
    if (!result.ok) {
      // 401 dla obu powodów — treść odpowiedzi nie zdradza, czy konto istnieje.
      return reply.code(401).send({ error: result.reason });
    }
    return reply.send(result.tokens);
  });

  app.post('/auth/refresh', async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const tokens = await deps.auth.refresh(parsed.data.refreshToken);
    if (tokens == null) return reply.code(401).send({ error: 'invalid_refresh' });
    return reply.send(tokens);
  });

  // ── dane referencyjne (wymagają JWT) ──────────────────────────────────────────

  app.get('/reference', async (req, reply) => {
    if (authorize(deps.tokens, req.headers.authorization) == null) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const view = await deps.reference.get();
    // Telefon przysyła ETag poprzedniej odpowiedzi; zgodność = nic się nie zmieniło.
    if (req.headers['if-none-match'] === view.etag) {
      return reply.code(304).header('etag', view.etag).send();
    }
    return reply
      .header('etag', view.etag)
      .send({
        aircraft: view.snapshot.aircraft,
        pilots: view.snapshot.pilots,
        updatedAt: view.snapshot.updatedAt?.toISOString() ?? null,
      });
  });

  app.get('/health', async () => ({ ok: true }));

  return app;
}

/** `Authorization: Bearer <jwt>` → claims albo `null`. */
export function authorize(
  tokens: TokenService,
  header: string | undefined,
): { pilotId: string; code: string } | null {
  if (header == null || !header.startsWith('Bearer ')) return null;
  return tokens.verify(header.slice('Bearer '.length));
}
