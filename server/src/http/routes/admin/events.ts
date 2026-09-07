/**
 * UZ Aero (serwer) - trasa rejestru zdarzeń (`GET /admin/api/events`, mockup
 * `A04-zdarzenia.html`).
 *
 * ══ ZDOLNOŚĆ: `panel.access`, A NIE NOWA ══
 * Rejestr czytają OBIE role panelu (`design/admin/ANALIZA.md`: „Rejestr zdarzeń -
 * przeglądarka (A04) | admin ✅ | szef wyszkolenia ✅ (odczyt)"), a `panel.access` mają
 * dokładnie te dwie. Osobna zdolność `events.read` nie odrzuciłaby ani jednego żądania,
 * które przechodzi dziś - a mnożenie zdolności bez potrzeby rozmywa odpowiedź na
 * pytanie „kto co może" (`domain/roles.ts`). Zdolność `events.correct` (wyłącznie
 * administrator) dotyczy ZAPISU i tej trasy nie dotyczy w ogóle - ekran pokazuje
 * przycisk korekty zablokowany z powodem, a nie ukryty.
 *
 * Cienka jak reszta repo: zod → zapytanie → status. Trasa nie zna ani SQL-a, ani
 * porządku listy - tłumaczy query string na filtr i wynik na kod HTTP.
 */

import type { FastifyInstance } from 'fastify';
import { EVENT_TYPES, type EventType } from '@uzaero/domain';
import { z } from 'zod';

import type { AdminEventQueries } from '../../../application/admin/queries/events.ts';
import { PAGE_LIMIT_MAX, type EventListFilter } from '../../../application/admin/ports.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { dayParam, endOfDay } from './dayRange.ts';

/**
 * Filtr po typie przepuszcza WYŁĄCZNIE kody z katalogu domeny.
 *
 * ══ DLACZEGO STRAŻNIK NA WEJŚCIU, SKORO ODCZYT PRZEPUSZCZA NIEZNANE TYPY ══
 * To nie jest sprzeczność, tylko dwa różne pytania - ta sama para, co przy dzienniku
 * audytu. Wiersz w bazie może nieść typ spoza katalogu (kolumna `events.type` celowo
 * nie ma `CHECK`-a) i lista pokazuje go dosłownie. Ale FILTR jest pytaniem zadanym
 * przez klienta, a pytanie o typ, którego system nie zna, nie ma poprawnej odpowiedzi:
 * ciche zignorowanie parametru pokazałoby PEŁNY rejestr pod etykietą zawężenia, czyli
 * skłamałoby o tym, na co człowiek patrzy. Stąd 400.
 */
const KNOWN_TYPES = new Set<string>(EVENT_TYPES);

const eventType = z.string().refine((value): value is EventType => KNOWN_TYPES.has(value), {
  message: 'nieznany typ zdarzenia',
});

/**
 * Parametr POWTARZALNY (`?type=takeoff&type=landing`), wzorem `?action=` w audycie:
 * ekran filtruje chipami, a chip bywa grupą typów. Fastify oddaje powtórzony parametr
 * tablicą, pojedynczy - napisem; unia obsługuje oba i oddaje zawsze tablicę, żeby
 * dalsza część kodu nie znała tej różnicy.
 */
const eventTypes = z
  .union([eventType, z.array(eventType)])
  .transform((value) => (Array.isArray(value) ? value : [value]));

const listQuery = z.object({
  type: eventTypes.optional(),
  /** DOKŁADNY uuid zdarzenia - wklejenie go z telefonu to główny scenariusz `A04`. */
  uuid: z.string().min(1).max(200).optional(),
  sessionUuid: z.string().min(1).max(200).optional(),
  aircraftId: z.string().min(1).max(100).optional(),
  /** Dopasowuje PIC-a albo Duala - dzień szkolny należy do obu. */
  pilotId: z.string().min(1).max(100).optional(),
  /** Dokładna wartość `events.source_device`, np. `admin:TMK` albo znacznik telefonu. */
  sourceDevice: z.string().min(1).max(200).optional(),
  /** Zakres po CZASIE PRZYJĘCIA (`received_at`) - tej samej osi, co porządek listy. */
  from: dayParam.optional(),
  to: dayParam.optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().positive().max(PAGE_LIMIT_MAX).default(50),
  cursor: z.string().min(1).max(500).optional(),
});

export function registerAdminEventRoutes(
  app: FastifyInstance,
  events: AdminEventQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/events', capability: 'panel.access' },
    async (req, reply) => {
      const query = listQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const q = query.data;
      const filter: EventListFilter = {
        types: q.type,
        uuid: q.uuid,
        sessionUuid: q.sessionUuid,
        aircraftId: q.aircraftId,
        pilotId: q.pilotId,
        sourceDevice: q.sourceDevice,
        fromMs: q.from,
        toMs: endOfDay(q.to),
        cursor: q.cursor,
        direction: q.sort,
        limit: q.limit,
      };

      const outcome = await events.list(filter);
      // 400, nie 500: kursor przychodzi z zewnątrz. Milczące zaczęcie od pierwszej
      // strony byłoby gorsze - panel pokazałby początek rejestru, sądząc, że przewinął.
      if (!outcome.ok) return reply.code(400).send({ error: 'bad_cursor' });

      return reply.send(outcome.page);
    },
  );
}
