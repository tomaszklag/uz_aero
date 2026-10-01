/**
 * Ninerdeck (serwer) - SKRZYNKA POWIADOMIEŃ zalogowanego w panelu (4.0.0, K7
 * `docs/kanal-klubu.md`; epik Z-E #246; makieta `design/panel/powiadomienia.html`).
 *
 * Dzwonek stoi w pasku górnym KAŻDEJ ramy klubu, więc skrzynkę ma każdy aktywny członek -
 * bez zdolności (issue #216: o tym, co kto widzi, rozstrzyga zakres, a wiadomości są
 * adresowane do osoby). Sesja platformowa skrzynki nie ma: `adminRoute` jest trasą klubu.
 *
 * Trasy siedzą pod `/me/`, obok sesji, konta i obserwowanych, bo pytają o OSOBĘ patrzącą.
 * Skrzynka jest TA SAMA, co w telefonie - te same wiersze, ten sam kształt i kursor
 * (`inboxWire.ts`), wspólne „przeczytane": wiadomość otwarta w panelu nie świeci się już
 * przy dzwonku na Pulpicie telefonu. BEZ wpisu w `admin_audit` - przeczytanie własnej
 * wiadomości nie jest decyzją o nikim.
 */

import type { FastifyInstance } from 'fastify';

import type { BookingQueries } from '../../../application/common/queries/bookings.ts';
import type { NotificationQueries } from '../../../application/common/queries/notifications.ts';
import { inboxPageOf, inboxWire } from '../common/inboxWire.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

export function registerAdminMeNotificationRoutes(
  app: FastifyInstance,
  notifications: NotificationQueries,
  calendar: BookingQueries,
  gate: AdminGate,
): void {
  adminRoute(app, gate, { method: 'GET', url: '/me/notifications', capability: null }, async (req, reply, actor) => {
    const page = inboxPageOf(req.query);
    if (page == null) return reply.code(400).send({ error: 'bad_request' });

    const timezone = await calendar.timezone(actor.orgId);
    if (timezone == null) return reply.code(404).send({ error: 'not_found' });

    const view = await notifications.inbox(actor.orgId, actor.pilotId, page);
    return reply.send(inboxWire(view, timezone));
  });

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/me/notifications/:id/read', capability: null },
    async (req, reply, actor) => {
      const { id } = req.params as { id: string };
      const ok = await notifications.markRead(actor.orgId, actor.pilotId, id);
      // Cudza skrzynka i cudzy klub odpowiadają tak samo jak wiersz nieistniejący -
      // `403` potwierdzałoby, że taka wiadomość jest (epik C wielofirmowości).
      if (!ok) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    },
  );
}
