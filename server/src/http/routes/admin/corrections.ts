/**
 * UZ Aero (serwer) - trasa korekty administracyjnej (`/admin/api/sessions/:uuid/corrections`,
 * mockup `A02b-korekta.html`).
 *
 * Cienka jak reszta repo: zod → komenda → status. Trasa nie zna ani transakcji, ani
 * audytu, ani reguły „czym stemplujemy zdarzenie" - to wszystko jest w komendzie.
 *
 * **`POST`, nie `PATCH`, i na kolekcji `corrections`, nie na zdarzeniu.** Adres mówi
 * prawdę o operacji: powstaje NOWY zasób w sesji, a zdarzenie wskazane przez `targetUuid`
 * nie jest zmieniane. `PATCH /events/:uuid` opisywałby edycję, której w rejestrze
 * append-only nie ma i nigdy nie będzie.
 *
 * Zdolność `events.correct` ma administrator; szef wyszkolenia NIE (`domain/roles.ts`):
 * wyjaśnianie rozbieżności to inna odpowiedzialność niż pisanie w cudzym rejestrze.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { EventCorrectionPayload } from '@uzaero/domain';

import type {
  AdminCorrectionCommands,
  CorrectionResult,
} from '../../../application/admin/commands/corrections.ts';
import type { AdminCorrectionQueries } from '../../../application/admin/queries/corrections.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

const correctionParams = z.object({ uuid: z.string().min(1).max(100) });

/**
 * Pola wspólne obu akcji. `reason` jest WYMAGANY, a `.trim()` przed `.min(1)` znaczy,
 * że spacje nie liczą się za uzasadnienie (A02b: „Bez powodu przycisk zapisu jest
 * nieaktywny"). Za rok to jedyna rzecz, która wyjaśni, dlaczego liczby dnia różnią się
 * od tego, co zapisał telefon - pusty ślad byłby wtedy gorszy niż brak przycisku.
 */
const correctionBase = z.object({
  targetUuid: z.string().min(1).max(100),
  reason: z.string().trim().min(1).max(2000),
});

/**
 * Sam KSZTAŁT korekty, bez uzasadnienia. Wydzielony, bo podgląd („co się stanie")
 * i zapis („zrób to") pytają o dokładnie tę samą rzecz - a druga definicja tej unii
 * byłaby pierwszym miejscem, w którym podgląd zaczyna opisywać inną operację niż ta,
 * którą panel za chwilę wyśle.
 */
/** Pola dopuszczone przez `amend` (issue #43); białą listę per typ celu egzekwuje domena. */
const amendFields = z.object({
  fuelL: z.number().finite().optional(),
  mh: z.number().finite().optional(),
  jumpers: z
    .object({
      tandem: z.number().int().nonnegative(),
      aff: z.number().int().nonnegative(),
      solo: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
  dualId: z.string().max(50).nullable().optional(),
});

const correctionShape = z.discriminatedUnion('action', [
  z.object({
    targetUuid: z.string().min(1).max(100),
    action: z.literal('retime'),
    newTime: z.number().int().nonnegative(),
  }),
  z.object({ targetUuid: z.string().min(1).max(100), action: z.literal('void') }),
  z.object({
    targetUuid: z.string().min(1).max(100),
    action: z.literal('amend'),
    fields: amendFields,
  }),
]);

/** Trzy akcje - te same, które zna domena i pokazuje mockup (`amend` od issue #43). */
const correctionBody = z.discriminatedUnion('action', [
  correctionBase.extend({
    action: z.literal('retime'),
    newTime: z.number().int().nonnegative(),
  }),
  correctionBase.extend({ action: z.literal('void') }),
  correctionBase.extend({ action: z.literal('amend'), fields: amendFields }),
]);

/**
 * Kształt zoda → payload domenowy. Jedno miejsce dla obu tras.
 *
 * `reason` wchodzi do payloadu od issue #43 - i jest to ODWRÓCENIE wcześniejszej reguły
 * („powód należy wyłącznie do audytu"). Powód tej zmiany: pilot widzi teraz historię
 * zmian swojego logu (`design/10i`) razem z korektami administratora, które wracają na
 * telefon (§4.9). Uzasadnienie wyłącznie w audycie znaczyłoby, że na ekranie pilota
 * cudza poprawka stoi jako „bez powodu" - mimo że powód istnieje i jest wymagany.
 * Kopia w audycie zostaje: tam odpowiada na pytanie „kto i dlaczego", tu na „dlaczego".
 */
function payloadOf(
  data: z.infer<typeof correctionShape>,
  reason?: string,
): EventCorrectionPayload {
  // Składamy JAWNIE zamiast rozsypywać resztę pól: `...rest` na unii to konstrukcja,
  // w której następne pole formularza wchodzi do rejestru samo, po cichu.
  const base = { targetUuid: data.targetUuid, ...(reason != null ? { reason } : {}) };
  if (data.action === 'retime') return { ...base, action: 'retime', newTime: data.newTime };
  if (data.action === 'amend') return { ...base, action: 'amend', fields: data.fields };
  return { ...base, action: 'void' };
}

const resultToWire = (result: CorrectionResult) => ({
  sessionUuid: result.sessionUuid,
  correctionUuid: result.correctionUuid,
  targetUuid: result.targetUuid,
  action: result.action,
  recordedAt: result.recordedAt.toISOString(),
  // `SessionState` jest bytem DOMENOWYM, więc jedzie bez własnego DTO (reguła granicy
  // typów, `docs/architektura-panelu-serwer.md` §1.2). Panel formatuje i nic nie liczy.
  state: result.state,
  // Kolizje z pilotem jadą w odpowiedzi POZYTYWNEJ: korekta jest zapisana, a panel ma
  // powiedzieć, w co administrator wszedł. Do 2026-08-07 była tu zamiast tego odmowa
  // `400 day_open` - patrz komenda.
  warnings: result.warnings,
  // Wynik re-eksportu w odpowiedzi, żeby panel powiedział „arkusz · rewizja 3",
  // a nie samo „zapisano" - i uczciwie pokazał `null`, gdy eksport padł.
  reexport: result.reexport,
});

export function registerAdminCorrectionRoutes(
  app: FastifyInstance,
  corrections: AdminCorrectionCommands,
  preview: AdminCorrectionQueries,
  gate: AdminGate,
): void {
  /**
   * PODGLĄD - `POST`, ale ZAPYTANIE: zero zapisów, zero wpisów w audycie, zero
   * re-eksportu. Ciało nie ma `reason`, bo podgląd musi działać, ZANIM administrator
   * napisze uzasadnienie; kolejność „najpierw zobacz skutek, potem wytłumacz decyzję"
   * jest tu celowa.
   *
   * Zdolność ta sama, co przy zapisie (`events.correct`): podgląd pokazuje pełny stan
   * dnia po hipotetycznej zmianie, więc nie jest „lżejszy" od odczytu karty dnia -
   * jest narzędziem tej samej operacji.
   */
  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/sessions/:uuid/corrections/preview', capability: 'events.correct' },
    async (req, reply) => {
      const params = correctionParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = correctionShape.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await preview.preview({
        sessionUuid: params.data.uuid,
        correction: payloadOf(body.data),
      });

      // Jedyna odmowa podglądu. `400 day_open` ZNIKŁO 2026-08-07 razem z bramką
      // w zapytaniu: sesja bez `day_close` jest dziś stanem normalnym, a kolizja
      // z pilotem jedzie w `preview.warnings`.
      if (!outcome.ok) return reply.code(404).send({ error: 'not_found' });

      // Naruszenia jadą W CIELE 200, a nie jako 422. Podgląd ODPOWIEDZIAŁ na pytanie
      // „co się stanie": odpowiedź brzmi „nic, bo tego nie wolno" i jest kompletna
      // razem z liczbami `before`. Kod błędu odebrałby panelowi całą treść karty.
      return reply.send(outcome.preview);
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/sessions/:uuid/corrections', capability: 'events.correct' },
    async (req, reply, actor) => {
      const params = correctionParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = correctionBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const data = body.data;
      const outcome = await corrections.correct(actor, {
        sessionUuid: params.data.uuid,
        correction: payloadOf(data, data.reason),
        reason: data.reason,
      });

      if (!outcome.ok) {
        if (outcome.reason === 'session_not_found') {
          return reply.code(404).send({ error: 'not_found' });
        }
        // 422, a nie 400: żądanie jest poprawnie zbudowane, to DOMENA odmawia (cel
        // spoza sesji, cel niekorygowalny, czas z przyszłości). Panel ma pokazać
        // konkretny powód z listy naruszeń, a nie „popraw formularz".
        return reply.code(422).send({ error: 'rule_violation', violations: outcome.violations });
      }

      return reply.send(resultToWire(outcome.result));
    },
  );
}
