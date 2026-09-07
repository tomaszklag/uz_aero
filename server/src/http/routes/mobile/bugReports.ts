/**
 * UZ Aero (serwer) - trasa zgłoszeń błędów z telefonu: `POST /me/bug-reports`
 * (issue #87, kanał zwrotny na czas testów z pilotami).
 *
 * Cienka jak reszta: zod → komenda → status. Tożsamość WYŁĄCZNIE z tokenu (`/me`),
 * nigdy z ciała - jeden pilot nie zgłasza w cudzym imieniu.
 *
 * ══ CO WALIDUJEMY, A CZEGO ŚWIADOMIE NIE ══
 * Sprawdzamy ROZMIARY i katalogi, czyli to, co chroni bazę i ekran panelu. NIE
 * sprawdzamy kształtu `context`: telefon dokłada tam nowe pola z każdym tygodniem
 * testów, a schemat po tej stronie znaczyłby wdrożenie serwera przy każdej takiej
 * zmianie - i zgłoszenie odbite `400` dokładnie wtedy, gdy niesie najwięcej nowego.
 * Sufit na całej kopercie zostawia Fastify (domyślnie 1 MB), a `passthrough` na
 * obiekcie kontekstu jest deklaracją tej decyzji, nie luką.
 *
 * ══ ODPOWIEDŹ MÓWI, ILE PRZYJĘTO I ILE JUŻ BYŁO ══
 * Kształt `PushResult` z ingestu, bo pytanie telefonu jest to samo: „czy mogę zdjąć
 * to z kolejki". Duplikat jest sukcesem, nie błędem - to normalny skutek ponowienia
 * po zerwanym połączeniu.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { BugReportCommands } from '../../../application/mobile/commands/bugReports.ts';
import type { TokenService } from '../../../application/common/ports.ts';
import { BUG_SEVERITIES } from '../../../domain/bugReports.ts';
import { authorize } from '../../authorize.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

/**
 * Sufit opisu. 4000 znaków to około dwie strony maszynopisu - więcej niż ktokolwiek
 * napisze kciukiem na pasie startowym, a mniej niż wklejony przypadkiem log.
 */
const DESCRIPTION_MAX = 4000;

/** Sufit paczki. Kolejka dłuższa niż to znaczy awarię, nie dzień lotny. */
const BATCH_MAX = 50;

const report = z.object({
  uuid: z.string().min(1).max(100),
  /** ISO UTC z zegara TELEFONU (`toISOString`) - chwila, w której pilot to widział. */
  createdAt: z.string().datetime(),
  severity: z.enum(BUG_SEVERITIES).nullable().optional(),
  description: z.string().trim().min(1).max(DESCRIPTION_MAX),
  screen: z.string().trim().min(1).max(200),
  appVersion: z.string().max(60).nullable().optional(),
  sessionUuid: z.string().max(100).nullable().optional(),
  // `passthrough`, a nie `record(z.unknown())` z listą pól - patrz nagłówek pliku.
  context: z.object({}).passthrough(),
});

const body = z.object({ reports: z.array(report).min(1).max(BATCH_MAX) });

export function registerBugReportRoutes(
  app: FastifyInstance,
  bugReports: BugReportCommands,
  tokens: TokenService,
): void {
  app.post('/me/bug-reports', async (req, reply) => {
    const claims = authorize(tokens, tokenFromRequest(req));
    if (claims == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const intake = await bugReports.submit(
      claims.pilotId,
      parsed.data.reports.map((r) => ({
        uuid: r.uuid,
        createdAt: new Date(r.createdAt),
        severity: r.severity ?? null,
        description: r.description,
        screen: r.screen,
        appVersion: r.appVersion ?? null,
        sessionUuid: r.sessionUuid ?? null,
        context: r.context as Record<string, unknown>,
      })),
    );

    return reply.send(intake);
  });
}
