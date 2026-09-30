/**
 * Ninerdeck (serwer) - WEJŚCIE KANAŁU KLUBU dla panelu: `GET /admin/api/live` (4.0.0,
 * `docs/kanal-klubu.md` §3.1, §5; epik Z-E #246).
 *
 * Sesja z ciasteczka przy NAWIĄZANIU i ŚCISŁE sprawdzenie `Origin` z `PUBLIC_BASE_URL`.
 * Strażnik CSRF panelu pilnuje metod zapisu, a nawiązanie połączenia jest GET-em - bez
 * `Origin` obca strona otworzyłaby kanał ciasteczkiem zalogowanego administratora
 * (Cross-Site WebSocket Hijacking). Wyjątku dla trybu deweloperskiego tu NIE MA: lokalny
 * panel na Vite przedstawia się adresem serwera przez własne proxy.
 *
 * Odmowa pada PRZED przejściem na WebSocket, zwykłą odpowiedzią HTTP (403 za `Origin`,
 * 401 za sesję). Brama `authorizeOrg` bez zdolności - kanał ma każdy członek klubu,
 * a odbiorców ramek wyznacza serwer (§2). Sesja platformowa kanału nie ma (K3): jej token
 * nie przechodzi bramy klubu.
 *
 * Trasa rejestruje się `app.get(…, { websocket: true })`, a nie przez `adminRoute` -
 * imienny wyjątek w `test/architecture.test.ts`: `adminRoute` odpowiada JEDNĄ odpowiedzią
 * HTTP, a tu po bramie zostaje otwarte połączenie.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { Clock, LivePort, MembershipAuthSnapshot } from '../../../application/common/ports.ts';
import { authorizeOrg } from '../../authorize.ts';
import { touchSession } from '../../sessionTouch.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';
import { CLOSE_POLICY, serveLive, type LiveTiming } from '../common/liveConnection.ts';
import type { AdminGate } from './adminRoute.ts';

export function registerAdminLiveRoute(
  app: FastifyInstance,
  live: LivePort,
  gate: AdminGate,
  allowedOrigin: string,
  timing: LiveTiming,
  clock: Clock,
): void {
  // Konto z bramy przechodzi do obsługi połączenia przez żądanie - bramą jest hook przed
  // przejściem na WebSocket, a połączenie dostaje już tylko jego wynik.
  const accounts = new WeakMap<FastifyRequest, MembershipAuthSnapshot>();

  app.get(
    '/admin/api/live',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        if (req.headers.origin !== allowedOrigin) {
          return reply.code(403).send({ error: 'origin_forbidden' });
        }
        const outcome = await authorizeOrg(gate.tokens, gate.accounts, tokenFromRequest(req), null);
        if (!outcome.ok) return reply.code(outcome.status).send(outcome.body);
        accounts.set(req, outcome.account);
        await touchSession(gate, req, outcome.account.sessionId);
      },
    },
    (socket, req) => {
      const account = accounts.get(req);
      if (account == null) {
        socket.close(CLOSE_POLICY, 'unauthorized');
        return;
      }
      serveLive(
        socket,
        live,
        {
          orgId: account.orgId,
          pilotId: account.pilotId,
          sessionId: account.sessionId,
          surface: 'panel',
          capabilities: account.capabilities,
        },
        timing,
        clock,
      );
    },
  );
}
