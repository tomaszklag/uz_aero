/**
 * UZ Aero (serwer) — trasa dziennika audytu (`GET /admin/api/audit`, mockup
 * `A09-audyt.html`).
 *
 * Zdolność `audit.read` ma WYŁĄCZNIE administrator (`domain/roles.ts`) — szef
 * wyszkolenia rozstrzyga rozbieżności, ale nie czyta cudzych śladów. To nie jest
 * przeoczenie do naprawienia przy okazji: wyjaśnianie rozbieżności i nadzór nad
 * administratorami to dwie różne odpowiedzialności.
 *
 * Cienka jak reszta repo: zod → zapytanie → status. Trasa nie zna ani SQL-a, ani
 * porządku listy — tłumaczy query string na filtr i wynik na kod HTTP.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminAuditQueries } from '../../../application/admin/queries/audit.ts';
import { PAGE_LIMIT_MAX, type AuditListFilter } from '../../../application/admin/ports.ts';
import { isAdminAction, type AdminAction } from '../../../domain/adminActions.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { dayParam, endOfDay } from './dayRange.ts';

/**
 * Filtr po akcji przepuszcza WYŁĄCZNIE kody z katalogu — i po to `isAdminAction`
 * powstał (`domain/adminActions.ts`: „strażnik wejścia z zewnątrz — dla strony ODCZYTU
 * dziennika i filtrów po akcji").
 *
 * ══ DLACZEGO STRAŻNIK NA WEJŚCIU, SKORO ODCZYT PRZEPUSZCZA NIEZNANE KODY ══
 * To nie jest sprzeczność, tylko dwa różne pytania. Wiersz w bazie może nieść kod
 * spoza katalogu (akcja przemianowana, wpis historyczny) i lista pokazuje go dosłownie.
 * Ale FILTR jest pytaniem zadanym przez klienta, a pytanie o akcję, której system nie
 * zna, nie ma poprawnej odpowiedzi — ciche zignorowanie takiego parametru pokazałoby
 * PEŁNĄ listę pod etykietą zawężenia, czyli skłamałoby o tym, na co człowiek patrzy.
 * Stąd 400.
 *
 * `refine` z predykatem typu zwęża wynik do `AdminAction` bez rzutowania.
 */
const action = z
  .string()
  .refine((value): value is AdminAction => isAdminAction(value), {
    message: 'nieznany kod akcji panelu',
  });

/**
 * Parametr POWTARZALNY (`?action=pilot.create&action=pilot.update`), bo ekran filtruje
 * GRUPAMI („Konta", „Flota", „Konserwacja"), a grupa to kilka kodów katalogu. Fastify
 * oddaje powtórzony parametr tablicą, pojedynczy — napisem; unia obsługuje oba i oddaje
 * zawsze tablicę, żeby dalsza część kodu nie znała tej różnicy.
 */
const actions = z
  .union([action, z.array(action)])
  .transform((value) => (Array.isArray(value) ? value : [value]));

const listQuery = z.object({
  action: actions.optional(),
  /** Identyfikator konta działającego — dopasowanie DOKŁADNE, nie po nazwisku. */
  actor: z.string().min(1).max(50).optional(),
  /** `flag` · `event` · `pilot` · `aircraft` … — wolny tekst, bo baza go nie zamyka. */
  targetType: z.string().min(1).max(50).optional(),
  /** Identyfikator obiektu: id flagi, uuid zdarzenia, kod pilota, rejestracja. */
  targetId: z.string().min(1).max(200).optional(),
  from: dayParam.optional(),
  to: dayParam.optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().positive().max(PAGE_LIMIT_MAX).default(50),
  cursor: z.string().min(1).max(500).optional(),
});

export function registerAdminAuditRoutes(
  app: FastifyInstance,
  audit: AdminAuditQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/audit', capability: 'audit.read' },
    async (req, reply) => {
      const query = listQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const q = query.data;
      const filter: AuditListFilter = {
        actions: q.action,
        actorPilotId: q.actor,
        targetType: q.targetType,
        targetId: q.targetId,
        fromMs: q.from,
        toMs: endOfDay(q.to),
        cursor: q.cursor,
        direction: q.sort,
        limit: q.limit,
      };

      const outcome = await audit.list(filter);
      // 400, nie 500: kursor przychodzi z zewnątrz. Milczące zaczęcie od pierwszej
      // strony byłoby gorsze — panel pokazałby początek dziennika, sądząc, że przewinął.
      if (!outcome.ok) return reply.code(400).send({ error: 'bad_cursor' });

      return reply.send(outcome.page);
    },
  );
}
