/**
 * UZ Aero (serwer) - trasy `/auth/*` (§3.0, §4.6).
 *
 * Cienkie jak cała warstwa HTTP: zod → komenda → status. Jedyna „logika" to mapowanie
 * wyniku komendy na kod odpowiedzi, a i ono jest w całości wypisane w tabeli
 * `docs/logowanie-google.md` §7.
 *
 * ══ DLACZEGO ZGŁOSZENIE DOSTAJE 202, A NIE 403 ══
 * Bo to nie jest odmowa, tylko „przyjęte, czekaj". Aplikacja ma na ten stan OSOBNY
 * ekran (`00c`) i musi go odróżnić od odrzucenia (`00d`) oraz od złego tokenu -
 * trzy różne wiadomości pod jednym kodem zmusiłyby telefon do czytania treści błędu.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuthCommands } from '../../../application/common/commands/auth.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

/**
 * Token tożsamości od dostawcy. Górna granica jest hojna, bo tokeny Google z paroma
 * zakresami bywają długie - ale musi istnieć: bez niej trasa przyjmuje megabajt
 * do parsowania od kogokolwiek.
 */
const googleBody = z.object({ idToken: z.string().min(1).max(4096) });

const refreshBody = z.object({ refreshToken: z.string().min(1).max(500) });

export function registerAuthRoutes(app: FastifyInstance, auth: AuthCommands): void {
  app.post('/auth/google', async (req, reply) => {
    const parsed = googleBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const result = await auth.loginWithProvider(parsed.data.idToken);
    if (result.ok) return reply.send(result.tokens);

    if (result.reason === 'pending') {
      return reply.code(202).send({
        status: 'pending',
        registration: result.registration,
        registrationToken: result.registrationToken,
      });
    }
    if (result.reason === 'rejected') {
      return reply
        .code(403)
        .send({ error: 'registration_rejected', registration: result.registration });
    }
    return reply.code(401).send({ error: result.reason });
  });

  /**
   * Stan zgłoszenia dla ekranu `00c` - JEDYNA trasa otwierana tokenem rejestracyjnym.
   *
   * Token bierzemy przez `tokenFromRequest`, bo to jedyne miejsce, które wie, skąd
   * pochodzi poświadczenie (test architektury pilnuje, że nikt nie czyta nagłówka sam).
   * Weryfikuje go `verifyRegistration`, czyli droga ROZŁĄCZNA z tożsamością pilota:
   * token pilota tutaj nie działa, a rejestracyjny nie działa nigdzie indziej.
   */
  app.get('/auth/registration', async (req, reply) => {
    const raw = tokenFromRequest(req);
    const identity = raw == null ? null : auth.verifyRegistrationToken(raw);
    if (identity == null) return reply.code(401).send({ error: 'unauthorized' });

    const status = await auth.registrationStatus(identity.provider, identity.subject);
    if (status.kind === 'unknown') return reply.code(404).send({ error: 'not_found' });
    if (status.kind === 'approved') {
      // Zatwierdzono w międzyczasie - pilot wchodzi do aplikacji BEZ ponownego
      // przechodzenia przez Google. To jest cała wartość tej trasy.
      return reply.send({ status: 'approved', tokens: status.tokens });
    }
    return reply.send({ status: status.kind, registration: status.registration });
  });

  app.post('/auth/refresh', async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const tokens = await auth.refresh(parsed.data.refreshToken);
    if (tokens == null) return reply.code(401).send({ error: 'invalid_refresh' });
    return reply.send(tokens);
  });
}
