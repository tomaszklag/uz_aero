/**
 * Ninerdeck (serwer) - SKRZYNKA POWIADOMIEŃ i TOKEN PUSH (milestone 3.1.0, issue #164;
 * `docs/rezerwacje.md` §12).
 *
 * Skrzynka jest ŹRÓDŁEM PRAWDY, push tylko budzikiem - stąd kompletna lista z historią
 * i kursorem, dokładnie jak `GET /me/events`.
 *
 * ══ CAŁY TEN MODUŁ WYMAGA SIECI ══
 * (decyzja właściciela 2026-09-22, §12.1). Cache'u powiadomień w telefonie NIE MA i nie
 * wolno go dorobić po cichu: zgoda jest umową między ludźmi, a nie pomiarem z kabiny.
 * Reguła §4.1 („brak sieci nigdy nie blokuje pilota") broni PRACY W LOCIE i tego nie
 * rusza - bez zasięgu pilot lata jak dotąd, tylko nie zobaczy skrzynki.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { BookingQueries } from '../../../application/common/queries/bookings.ts';
import type { NotificationQueries } from '../../../application/common/queries/notifications.ts';
import { can } from '../../../domain/roles.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';
import { inboxPageOf, inboxWire } from '../common/inboxWire.ts';

/**
 * Token urządzenia z Expo. Bez własnego wzorca na kształt napisu: format należy do
 * DOSTAWCY i zmienia się razem z nim, a token, którego on nie uzna, po prostu nie
 * zadzwoni - odrzucanie go u nas kosztowałoby wdrożenie serwera przy każdej takiej
 * zmianie (ta sama zasada, co przy kontekście zgłoszenia błędu, issue #87).
 */
const token = z.object({ token: z.string().trim().min(1).max(500) });

export function registerNotificationRoutes(
  app: FastifyInstance,
  notifications: NotificationQueries,
  calendar: BookingQueries,
  gate: MemberGate,
): void {
  app.get('/me/notifications', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const page = inboxPageOf(req.query);
    if (page == null) return reply.code(400).send({ error: 'bad_request' });

    const timezone = await calendar.timezone(who.orgId);
    if (timezone == null) return reply.code(404).send({ error: 'not_found' });

    const view = await notifications.inbox(who.orgId, who.pilotId, page);
    return reply.send({
      // Ten sam kształt, co skrzynka panelu i ramka `notification` (`inboxWire.ts`).
      ...inboxWire(view, timezone),
      // Czy ta osoba ROZSTRZYGA cudze terminy (3.1.0, epik R-J): telefon pyta o to
      // przy wejściu na Pulpit, bo akceptującego prosi o zgodę na powiadomienia
      // od razu, a pozostałych dopiero przy rezerwacji, która czeka (§12.5).
      // Jedzie tu, a nie osobną trasą - Pulpit i tak czyta skrzynkę przy każdym
      // wejściu, a druga trasa byłaby drugim żądaniem o jeden bit. Panel go nie
      // dostaje: o zgodę na powiadomienia pyta wyłącznie telefon.
      approver: can(who.capabilities, 'reservations.approve'),
    });
  });

  app.post<{ Params: { id: string } }>('/me/notifications/:id/read', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const ok = await notifications.markRead(who.orgId, who.pilotId, req.params.id);
    // Cudza skrzynka i cudzy klub odpowiadają tak samo jak wiersz nieistniejący -
    // `403` potwierdzałoby, że taka wiadomość jest (epik C wielofirmowości).
    if (!ok) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });

  /**
   * Rejestracja urządzenia. Token przypina się do SESJI LOGOWANIA, więc gaśnie razem
   * z nią (§12.2) - a sesję bierzemy z tokenu żądania, nie z ciała: telefon nie ma jak
   * wiedzieć, którą sesję serwer widzi, a podana w ciele byłaby cudzą do podstawienia.
   */
  app.post('/me/push-token', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = token.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    // Poświadczenie sprzed 2.1.0 nie ma sesji, a token bez niej nie miałby czego
    // przeżyć ani z czym zgasnąć. Odmowa zamiast wiersza-sieroty; telefon dostanie
    // sesję przy pierwszym odświeżeniu pary tokenów.
    if (who.sessionId == null) return reply.code(409).send({ error: 'session_required' });

    await notifications.registerPushToken(who.pilotId, who.sessionId, parsed.data.token);
    return reply.code(204).send();
  });
}
