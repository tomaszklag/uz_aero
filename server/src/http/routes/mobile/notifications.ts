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
import type { NotificationQueries } from '../../../application/mobile/queries/notifications.ts';
import { clubDays } from '../../../domain/clubTime.ts';
import { can } from '../../../domain/roles.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';

/**
 * Strona skrzynki. Kursor jest PARĄ (stempel + identyfikator): powiadomienia jednej
 * decyzji rodzą się w tej samej transakcji, więc sam stempel nie porządkuje ich
 * jednoznacznie i strona potrafiłaby zgubić wiersz.
 */
const page = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  beforeAt: z.string().datetime().optional(),
  beforeId: z.string().min(1).max(100).optional(),
});

/**
 * Token urządzenia z Expo. Bez własnego wzorca na kształt napisu: format należy do
 * DOSTAWCY i zmienia się razem z nim, a token, którego on nie uzna, po prostu nie
 * zadzwoni - odrzucanie go u nas kosztowałoby wdrożenie serwera przy każdej takiej
 * zmianie (ta sama zasada, co przy kontekście zgłoszenia błędu, issue #87).
 */
const token = z.object({ token: z.string().trim().min(1).max(500) });

const DEFAULT_LIMIT = 30;

/**
 * DOBA KLUBU terminu, o którym mówi wiadomość (3.1.0, epik R-I). Telefon nie zna stref
 * i liczy godziny odejmowaniem od granic doby (§6.1) - bez nich „sob 26 wrz 09:00-12:00"
 * w skrzynce musiałby iść w UTC, czyli inną godziną niż na osi kalendarza obok.
 * `null`, gdy wiadomość nie mówi o terminie albo stempel nie daje się przeczytać.
 */
function termDayOf(
  timezone: string,
  payload: Record<string, unknown>,
): { date: string; startsAt: string; endsAt: string } | null {
  const startsAt = typeof payload.startsAt === 'string' ? Date.parse(payload.startsAt) : NaN;
  if (!Number.isFinite(startsAt)) return null;
  const day = clubDays(timezone, startsAt, startsAt + 1, 1)[0];
  if (day == null) return null;
  return {
    date: day.date,
    startsAt: new Date(day.startsAt).toISOString(),
    endsAt: new Date(day.endsAt).toISOString(),
  };
}

export function registerNotificationRoutes(
  app: FastifyInstance,
  notifications: NotificationQueries,
  calendar: BookingQueries,
  gate: MemberGate,
): void {
  app.get('/me/notifications', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = page.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const q = parsed.data;

    // Kursor niepełny jest BŁĘDEM ŻĄDANIA, a nie cichym „od początku": strona od
    // początku wygląda jak strona z wynikami, więc telefon pętliłby się po pierwszej
    // stronie i nikt by tego nie zauważył.
    if ((q.beforeAt == null) !== (q.beforeId == null)) {
      return reply.code(400).send({ error: 'bad_request' });
    }

    const timezone = await calendar.timezone(who.orgId);
    if (timezone == null) return reply.code(404).send({ error: 'not_found' });

    const view = await notifications.inbox(who.orgId, who.pilotId, {
      limit: q.limit ?? DEFAULT_LIMIT,
      before:
        q.beforeAt == null || q.beforeId == null
          ? undefined
          : { createdAt: Date.parse(q.beforeAt), id: q.beforeId },
    });

    return reply.send({
      timezone,
      unread: view.unread,
      // Czy ta osoba ROZSTRZYGA cudze terminy (3.1.0, epik R-J): telefon pyta o to
      // przy wejściu na Pulpit, bo akceptującego prosi o zgodę na powiadomienia
      // od razu, a pozostałych dopiero przy rezerwacji, która czeka (§12.5).
      // Jedzie tu, a nie osobną trasą - Pulpit i tak czyta skrzynkę przy każdym
      // wejściu, a druga trasa byłaby drugim żądaniem o jeden bit.
      approver: can(who.capabilities, 'reservations.approve'),
      items: view.items.map((n) => ({
        id: n.id,
        kind: n.kind,
        payload: n.payload,
        createdAt: new Date(n.createdAt).toISOString(),
        readAt: n.readAt == null ? null : new Date(n.readAt).toISOString(),
        day: termDayOf(timezone, n.payload),
      })),
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
