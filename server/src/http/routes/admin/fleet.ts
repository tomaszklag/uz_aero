/**
 * UZ Aero (serwer) - trasy floty (`/admin/api/fleet*`, mockupy `A07` i `A07a`).
 *
 * Cienkie jak reszta repo: zod → komenda/zapytanie → status. Trasa nie zna ani
 * transakcji, ani audytu, ani reguły „czego nie wolno wyłączyć" - to wszystko jest
 * w komendzie i w `domain/fleetGuards.ts`.
 *
 * ══ ZDOLNOŚĆ JEST TU ROZSZCZEPIONA I TO JEST TREŚĆ EKRANU ══
 * `GET` wymaga `panel.access`, każda mutacja - `fleet.manage`. Mockup A07 mówi to
 * wprost: „Szef wyszkolenia czyta tę tabelę (potrzebuje jej do flag i statystyk), ale
 * bez przycisków edycji". Przyciski w panelu są wtedy WIDOCZNE i zablokowane z powodem,
 * a nie ukryte; serwer i tak odmawia, bo ukrycie przycisku nigdy nie było
 * zabezpieczeniem.
 *
 * ══ DLACZEGO `GET /fleet/tolerance` W OGÓLE ISTNIEJE ══
 * Bo tolerancja `FUEL_MISMATCH` nie jest stałą, tylko `max(10 L, 5% pojemności)` -
 * a panelowi wolno importować z `@uzaero/domain` wyłącznie typy
 * (`docs/architektura-panelu-frontend.md` §5.1). Bez tej trasy karta „Skutki zmiany"
 * z `A07a` musiałaby albo pominąć wiersz „Próg `FUEL_MISMATCH`: ±62.9 → ±55.0 L"
 * (tak było przez cztery przekroje), albo policzyć go własną arytmetyką - czyli zacząć
 * trzymać drugą kopię reguły §4.5 po stronie przeglądarki.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminFleetCommands } from '../../../application/admin/commands/fleet.ts';
import type { AdminFleetQueries } from '../../../application/admin/queries/fleet.ts';
import { refuseCapacity } from '../../../domain/fleetGuards.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

/**
 * Znaki na kadłubie: WERSALIKI, litery, cyfry i myślnik, 3–10 znaków.
 *
 * Wielkość liter normalizujemy, a nie odrzucamy - „sp-klm" i „SP-KLM" to w intencji
 * administratora ta sama maszyna, a indeks `UNIQUE` jest wrażliwy na wielkość, więc
 * bez normalizacji dałoby się założyć drugi wiersz tego samego samolotu. Rejestracja
 * jedzie do nazwy karty arkusza (`2026-07-30_SP-KLM`), do logu dnia i do każdej flagi,
 * więc krótka i bez spacji.
 */
const reg = z
  .string()
  .trim()
  .min(3)
  .max(10)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9-]+$/.test(value), {
    message: 'rejestracja: wyłącznie litery, cyfry i myślnik',
  });

const type = z.string().trim().min(2).max(60);

/**
 * Rok produkcji jest OPCJONALNY, bo kolumna `aircraft.year` jest `NULL`-owalna od
 * schematu bazowego - szybowiec z tabliczki bez daty to realny przypadek. Pusty napis znaczy
 * „nie wiadomo" (`null`), a nie „rok zerowy".
 */
const year = z
  .union([z.coerce.number().int().min(1900).max(2100), z.literal('')])
  .transform((value) => (value === '' ? null : value));

/**
 * Pojemność bez `.positive()` W ZODZIE i to jest świadome: warunek „większa od zera"
 * jest REGUŁĄ (`domain/fleetGuards.ts`), bo od niej zależy próg flagi, a nie kształtem
 * żądania. Odrzucenie go tutaj jako 400 `bad_request` dałoby administratorowi
 * komunikat „popraw formularz" zamiast zdania o skutku, i zostawiłoby regułę w domenie
 * jako gałąź nieosiągalną przez HTTP - czyli nietestowalną tam, gdzie działa.
 */
const capacityL = z.coerce.number().finite().min(-1_000_000).max(1_000_000);

const mhFormat = z.enum(['decimal', 'hhmm']);
const serviceStatus = z.enum(['active', 'disabled']);

/**
 * Konfiguracja oleju (issue #60): `null` = nieskonfigurowane (moduł dla jednostki
 * milczy) i jest to WARTOŚĆ, nie brak pola. Bez `.positive()` - jak przy pojemności:
 * „większe od zera" i „minimum ≤ zbiornik" są REGUŁAMI (`fleetGuards.refuseOil`),
 * nie kształtem żądania.
 */
const oilValue = z.coerce.number().finite().min(-1_000_000).max(1_000_000).nullable();

const listQuery = z.object({
  status: serviceStatus.optional(),
  // `z.coerce.boolean()` jest tu pułapką: uznaje KAŻDY niepusty napis za `true`, więc
  // `?claimed=false` filtrowałoby jednostki Z claimem. Enum mówi to wprost - ta sama
  // decyzja, co przy `?flagged=` na liście dni.
  claimed: z.enum(['true', 'false']).optional(),
  /** Fragment rejestracji albo typu - dopasowanie zawierające, nie dokładne. */
  q: z.string().trim().min(1).max(100).optional(),
});

/**
 * Tolerancja: ALBO pojemność wpisywana w formularzu, ALBO samolot z rejestru.
 *
 * Dwa wejścia, bo to dwa różne ekrany zadające to samo pytanie: `A07a` zna liczbę
 * i nie zna samolotu (jednostka może jeszcze nie istnieć), `A02a`/`A02b` znają samolot
 * i nie znają pojemności. Brak obu = tolerancja dla „pojemności nieznanej", czyli
 * próg z podłogi - i tak też jest opisana w kontrakcie (`capacityL: null`).
 */
const toleranceQuery = z.object({
  // TA SAMA definicja pojemności, co przy zapisie (`capacityL` wyżej) - dosłownie ten
  // sam schemat, a nie jego luźniejszy kuzyn. Do 2026-08-01 trasa odpowiadała progiem
  // na `-500`, `0`, pusty parametr i `1e300`, mimo że zapis tych samych wartości kończył
  // się `409 capacity_not_positive`: dwie trasy jednego zasobu miały dwie definicje
  // dopuszczalnej pojemności, więc karta „Skutki zmiany" potrafiła pokazać wiarygodny
  // próg dla liczby, której serwer nigdy by nie zapisał. Reguła „większa od zera" jest
  // egzekwowana niżej, przez `refuseCapacity` - tak jak przy zapisie, bo to REGUŁA,
  // nie kształt żądania.
  capacityL: capacityL.optional(),
  aircraftId: z.string().min(1).max(100).optional(),
});

const createBody = z.object({
  reg,
  type,
  year: year.optional(),
  capacityL,
  mhFormat,
  dualRequired: z.boolean().default(false),
  serviceStatus: serviceStatus.default('active'),
  oilMinL: oilValue.default(null),
  oilCapacityL: oilValue.default(null),
  oilNormLPerH: oilValue.default(null),
});

/**
 * Wszystkie pola opcjonalne, bo `PATCH` opisuje ZMIANĘ, nie stan docelowy. Pusty obiekt
 * przejdzie walidację i odbije się o `no_changes` w komendzie - i tak ma być: to jest
 * pytanie o świat („czy coś się zmienia"), a nie o kształt żądania.
 */
const patchBody = z.object({
  reg: reg.optional(),
  type: type.optional(),
  year: year.optional(),
  capacityL: capacityL.optional(),
  mhFormat: mhFormat.optional(),
  dualRequired: z.boolean().optional(),
  serviceStatus: serviceStatus.optional(),
  oilMinL: oilValue.optional(),
  oilCapacityL: oilValue.optional(),
  oilNormLPerH: oilValue.optional(),
});

const idParams = z.object({ id: z.string().min(1).max(100) });

export function registerAdminFleetRoutes(
  app: FastifyInstance,
  fleet: AdminFleetCommands,
  queries: AdminFleetQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    // `panel.access`, nie `fleet.manage`: listę CZYTA każdy, kto ma wejście do panelu.
    // Ta sama trasa jest słownikiem samolotów dla filtrów listy dni (`A02`).
    { method: 'GET', url: '/fleet', capability: 'panel.access' },
    async (req, reply) => {
      const query = listQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      return reply.send(
        await queries.list({
          serviceStatus: query.data.status,
          claimed: query.data.claimed === undefined ? undefined : query.data.claimed === 'true',
          search: query.data.q,
        }),
      );
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/fleet/tolerance', capability: 'panel.access' },
    async (req, reply) => {
      const query = toleranceQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      // Ta sama reguła i ta sama odmowa, co przy `POST`/`PATCH` - inaczej panel
      // dostawałby próg dla pojemności, której zapisać się nie da. `?capacityL=`
      // (pusty parametr) koercja zamienia w `0` i to jest właśnie ten przypadek.
      const refusal = refuseCapacity(query.data.capacityL ?? null);
      if (refusal != null) return reply.code(409).send({ error: 'refused', reason: refusal });

      const tolerance = await queries.tolerance(query.data);
      // 404 dotyczy WYŁĄCZNIE wariantu z `aircraftId`: pytanie o próg dla samolotu,
      // którego nie ma, nie ma odpowiedzi. Wariant z samą liczbą odpowiada zawsze.
      if (tolerance == null) return reply.code(404).send({ error: 'not_found' });

      return reply.send(tolerance);
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/fleet', capability: 'fleet.manage' },
    async (req, reply, actor) => {
      const body = createBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await fleet.create(actor, {
        reg: body.data.reg,
        type: body.data.type,
        year: body.data.year ?? null,
        capacityL: body.data.capacityL,
        mhFormat: body.data.mhFormat,
        dualRequired: body.data.dualRequired,
        serviceStatus: body.data.serviceStatus,
        oilMinL: body.data.oilMinL,
        oilCapacityL: body.data.oilCapacityL,
        oilNormLPerH: body.data.oilNormLPerH,
      });
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.code(201).send({ aircraft: await queries.item(outcome.result.id) });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'PATCH', url: '/fleet/:id', capability: 'fleet.manage' },
    async (req, reply, actor) => {
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = patchBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await fleet.update(actor, params.data.id, body.data);
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.send({ aircraft: await queries.item(outcome.result.id) });
    },
  );

  adminRoute(
    app,
    gate,
    // `DELETE`, nie `POST /fleet/:id/delete` - patrz bliźniacza trasa kont.
    { method: 'DELETE', url: '/fleet/:id', capability: 'fleet.manage' },
    async (req, reply, actor) => {
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await fleet.remove(actor, params.data.id);
      if (!outcome.ok) return refusal(reply, outcome);

      // 204, nie 200 z wierszem: wiersza już nie ma, więc nie ma czego oddać.
      return reply.code(204).send();
    },
  );
}

/**
 * Wariant odmowy → status i ciało. Jedno miejsce, bo dwie trasy odmawiają tak samo,
 * a odmowa z innym polem w innej trasie to dokładnie ten rozjazd, przed którym broni
 * `authorize.ts`.
 *
 * **409 `refused` niesie POWÓD.** „Nie można" bez wyjaśnienia przy przycisku „Zapisz
 * zmiany" kazałoby administratorowi zgadywać, czy to awaria, czy zasada - a to jest
 * dokładnie ta chwila, w której człowiek sięga po `UPDATE` w psql.
 */
function refusal(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  outcome: { reason: string; field?: 'reg'; refusal?: string },
): unknown {
  if (outcome.reason === 'not_found') return reply.code(404).send({ error: 'not_found' });
  if (outcome.reason === 'no_changes') return reply.code(400).send({ error: 'no_changes' });
  if (outcome.reason === 'conflict') {
    return reply.code(409).send({ error: 'conflict', field: outcome.field });
  }
  return reply.code(409).send({ error: 'refused', reason: outcome.refusal });
}
