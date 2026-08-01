/**
 * UZ Aero (serwer) — trasy monitora eksportu (`/admin/api/exports*`, mockup `A05`).
 *
 * Cienkie jak reszta repo: zod → zapytanie/komenda → status. Trasa nie zna ani stanu
 * karty, ani bramek eksportera — jedno mieszka w mapperze, drugie w `DayExporter`.
 *
 * ══ ZDOLNOŚĆ JEST TU ROZSZCZEPIONA ══
 * `GET` wymaga `panel.access` — monitor jest ODCZYTEM i szef wyszkolenia ogląda go
 * w całości (`ANALIZA` A07: „Kto ma dostęp: oboje (ponowienie: admin)"). Ponowienie
 * wymaga `fleet.manage`, czyli zdolności, którą ma wyłącznie administrator.
 *
 * **Wybór `fleet.manage` jest DECYZJĄ DO POTWIERDZENIA.** Katalog zdolności
 * (`domain/roles.ts`) nie ma pozycji o eksporcie, a reguła projektu brzmi „nie mnożymy
 * zdolności bez potrzeby". `fleet.manage` jest tu najbliższa merytorycznie: to ona już
 * dziś rozstrzyga, JAK WYGLĄDA każda przyszła karta tego samolotu (`mh_format`
 * i pojemność jadą wprost do treści arkusza), więc „kto steruje dokumentem klubu" ma
 * dalej jedną odpowiedź w jednym pliku. Gdyby ponowienie miało trafić do szefa
 * wyszkolenia, właściwym ruchem jest osobna zdolność `exports.retry`, a nie
 * rozszerzenie `fleet.manage` — bo tamta niesie też edycję floty.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminExportCommands } from '../../../application/admin/commands/exports.ts';
import type { AdminExportQueries } from '../../../application/admin/queries/exports.ts';
import { EXPORT_STATES, PAGE_LIMIT_MAX } from '../../../application/admin/ports.ts';
import type { ExportState } from '../../../application/admin/contracts/exports.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { dayParam, endOfDay } from './dayRange.ts';

/**
 * Stany karty jako ENUM, nie wolny tekst: filtr jest PYTANIEM klienta, a pytanie
 * o stan, którego system nie zna, nie ma poprawnej odpowiedzi — ciche zignorowanie
 * takiego parametru pokazałoby PEŁNĄ listę pod etykietą zawężenia. Ta sama decyzja,
 * co przy `?action=` w dzienniku audytu.
 *
 * Lista jedzie z JEDNEGO katalogu (`EXPORT_STATES`), a nie z literałów przepisanych tu
 * po raz trzeci: rozjazd między zodem, `CASE` adaptera i mapperem dawałby stan, którego
 * trasa nie przepuszcza, choć reszta systemu go zna.
 */
const state = z.enum(EXPORT_STATES as [ExportState, ...ExportState[]]);

const listQuery = z.object({
  from: dayParam.optional(),
  to: dayParam.optional(),
  aircraftId: z.string().min(1).max(100).optional(),
  /** Fragment rejestracji, identyfikatora samolotu albo uuid-a sesji. */
  q: z.string().trim().min(1).max(100).optional(),
  state: state.optional(),
  limit: z.coerce.number().int().positive().max(PAGE_LIMIT_MAX).default(200),
});

const uuidParams = z.object({ sessionUuid: z.string().min(1).max(100) });

export function registerAdminExportRoutes(
  app: FastifyInstance,
  queries: AdminExportQueries,
  commands: AdminExportCommands,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/exports', capability: 'panel.access' },
    async (req, reply) => {
      const query = listQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const q = query.data;
      return reply.send(
        await queries.list({
          fromMs: q.from,
          // Zakres obustronnie DOMKNIĘTY: `do=2026-07-31` obejmuje cały 31 lipca.
          // Inaczej „od 25 do 31" gubiłoby ostatni dzień — czyli zwykle ten, o który
          // się pyta.
          toMs: endOfDay(q.to),
          aircraftId: q.aircraftId,
          search: q.q,
          // Zawężenie jedzie do SQL-a, a nie do `.filter()` po obcięciu: inaczej chip
          // „Bez karty" nie umiałby znaleźć dnia starszego niż `limit` najnowszych.
          state: q.state,
          limit: q.limit,
        }),
      );
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/exports/:sessionUuid', capability: 'panel.access' },
    async (req, reply) => {
      const params = uuidParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const history = await queries.history(params.data.sessionUuid);
      if (history == null) return reply.code(404).send({ error: 'not_found' });

      return reply.send(history);
    },
  );

  /**
   * Podgląd treści karty — istnieje OBOK `GET /sheets/:tab`, nie zamiast niej.
   *
   * Tamta trasa jest celem linków `export_log.sheet_url` czytanych z TELEFONU (ekran 11,
   * nagłówek `Bearer`) i zostaje nietknięta. Panel loguje się ciasteczkiem
   * `uzaero_admin` o `Path=/admin`, które do `/sheets/*` po prostu NIE JEDZIE —
   * poszerzenie ścieżki ciasteczka posłałoby sesję panelu razem z każdym żądaniem
   * telefonu, więc byłoby odwrotnością tego, co ma osiągnąć.
   */
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/exports/:sessionUuid/sheet', capability: 'panel.access' },
    async (req, reply) => {
      const params = uuidParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const sheet = await queries.sheet(params.data.sessionUuid);
      // 404 obejmuje trzy przypadki naraz (nie ma sesji / nie da się nazwać karty /
      // karta nigdy nie powstała) i to jest właściwe: z punktu widzenia czytelnika
      // wszystkie znaczą „tej karty nie ma". Który to przypadek, mówi wiersz listy.
      if (sheet == null) return reply.code(404).send({ error: 'not_found' });

      return reply.send(sheet);
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/exports/:sessionUuid/retry', capability: 'fleet.manage' },
    async (req, reply, actor) => {
      const params = uuidParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const sessionUuid = params.data.sessionUuid;
      // 404 PRZED dotknięciem eksportera: nieznany uuid odbiłby się o niego jako
      // `no_events`, czyli zdanie o świecie („ta sesja nie ma zdarzeń") zamiast
      // o adresie („nie ma takiej sesji"). Panel pokazuje powód dosłownie, więc
      // sklejenie tych dwóch odpowiedzi kazałoby administratorowi szukać zdarzeń
      // sesji, której nigdy nie było.
      if ((await queries.item(sessionUuid)) == null) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const result = await commands.retry(actor, sessionUuid);

      // 200 także przy odmowie — i to jest treść tej trasy, nie ustępstwo. Odmowa
      // eksportera („dzień jeszcze otwarty", „flaga trzyma kartę") jest poprawną
      // odpowiedzią o stanie świata; 500 kazałoby administratorowi zgadywać, czy to
      // awaria, czy zasada — czyli dokładnie w tej chwili sięgnąć po `psql`.
      return reply.send({ retry: result, row: await queries.item(sessionUuid) });
    },
  );
}
