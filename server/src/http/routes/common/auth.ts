/**
 * UZ Aero (serwer) - trasy `/auth/*` (§3.0, §4.6).
 *
 * Cienkie jak cała warstwa HTTP: zod → komenda → status. Jedyna „logika" to zasada,
 * że 401 wygląda IDENTYCZNIE dla złego hasła i nieistniejącego konta - enumeracji
 * kont broni komenda (stały koszt weryfikacji), a trasa jej nie psuje treścią błędu.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuthCommands } from '../../../application/common/commands/auth.ts';

const loginBody = z.object({
  login: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

const refreshBody = z.object({ refreshToken: z.string().min(1).max(500) });

export function registerAuthRoutes(app: FastifyInstance, auth: AuthCommands): void {
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const result = await auth.login(parsed.data.login, parsed.data.password);
    if (!result.ok) return reply.code(401).send({ error: result.reason });
    return reply.send(result.tokens);
  });

  app.post('/auth/refresh', async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const tokens = await auth.refresh(parsed.data.refreshToken);
    if (tokens == null) return reply.code(401).send({ error: 'invalid_refresh' });
    return reply.send(tokens);
  });
}
