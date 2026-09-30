/**
 * Ninerdeck (serwer) - WEJŚCIE KANAŁU KLUBU dla telefonu: `GET /live` (4.0.0,
 * `docs/kanal-klubu.md` §3.1, §5; epik Z-E #246).
 *
 * Token klubu przychodzi w PIERWSZEJ RAMCE (`auth`), nigdy w adresie - adres ląduje
 * w dziennikach żądań hostingu. Bez `auth` w 5 s połączenie się zamyka. Brama jest TA SAMA,
 * co w REST (`authorizeMember`: aktywne członkostwo, sesja nieunieważniona), więc kanał nie
 * ma ani jednej reguły dostępu, której nie miałby REST.
 *
 * Token, który bramy nie przechodzi, dostaje `bye token_expired`: klient robi to, co przy
 * 401 z REST - odświeża parę tokenów i łączy się ponownie. Unieważnioną sesję rozpozna
 * wtedy samo odświeżenie (`session_revoked`), jak dziś.
 */

import type { FastifyInstance } from 'fastify';

import type { Clock, LivePort } from '../../../application/common/ports.ts';
import { authorizeMember } from '../../authorize.ts';
import type { MemberGate } from '../../memberGate.ts';
import { touchSession } from '../../sessionTouch.ts';
import { CLOSE_POLICY, parseClientFrame, sayBye, serveLive, type LiveTiming } from '../common/liveConnection.ts';

export function registerLiveRoute(
  app: FastifyInstance,
  live: LivePort,
  gate: MemberGate,
  timing: LiveTiming,
  clock: Clock,
): void {
  app.get('/live', { websocket: true }, (socket, req) => {
    const timeout = setTimeout(() => socket.close(CLOSE_POLICY, 'auth_timeout'), timing.authTimeoutMs);
    socket.once('close', () => clearTimeout(timeout));

    socket.once('message', (data, isBinary) => {
      clearTimeout(timeout);
      void (async () => {
        const frame = parseClientFrame(data, isBinary);
        if (frame == null || frame.type !== 'auth' || typeof frame.token !== 'string') {
          socket.close(CLOSE_POLICY, 'auth_required');
          return;
        }
        const account = await authorizeMember(gate.tokens, gate.accounts, frame.token);
        // Klient zdążył odejść w trakcie sprawdzania - nie ma kogo witać.
        if (socket.readyState !== socket.OPEN) return;
        if (account == null) {
          sayBye(socket, 'token_expired');
          return;
        }
        await touchSession(gate, req, account.sessionId);
        serveLive(
          socket,
          live,
          {
            orgId: account.orgId,
            pilotId: account.pilotId,
            sessionId: account.sessionId,
            surface: 'mobile',
            capabilities: account.capabilities,
          },
          timing,
          clock,
        );
      })();
    });
  });
}
