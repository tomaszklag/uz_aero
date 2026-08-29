/**
 * UZ Aero (serwer) - trasy kont pilotów (`/admin/api/pilots*`, mockupy `A06`, `A06a`).
 *
 * Cienkie jak reszta repo: zod → komenda → status. Trasa nie zna ani transakcji, ani
 * audytu, ani reguły „kto nie może odciąć kogo" - to wszystko jest w komendzie
 * i w `domain/accountGuards.ts`.
 *
 * ══ ZDOLNOŚĆ JEST TU ROZSZCZEPIONA I TO JEST TREŚĆ EKRANU ══
 * `GET` wymaga `panel.access`, każda mutacja - `accounts.manage`. Mockup A06 mówi to
 * wprost: „Szef wyszkolenia widzi tę listę, ale bez przycisków - potrzebuje jej do
 * statystyk i flag, nie do zarządzania dostępem". Przyciski w panelu są wtedy WIDOCZNE
 * i zablokowane z powodem, a nie ukryte; serwer i tak odmawia, bo ukrycie przycisku
 * nigdy nie było zabezpieczeniem.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminPilotCommands } from '../../../application/admin/commands/pilots.ts';
import type { AdminPilotQueries } from '../../../application/admin/queries/pilots.ts';
import { PAGE_LIMIT_MAX, type AdminPilotAccount } from '../../../application/admin/ports.ts';
import type { AdminPilotListItem } from '../../../application/admin/contracts/pilots.ts';
import { PILOT_ROLES } from '../../../domain/roles.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { dayParam, endOfDay } from './dayRange.ts';

/**
 * Kod pilota: WERSALIKI, bez spacji, 2–10 znaków.
 *
 * Wielkość liter normalizujemy, a nie odrzucamy: „kza" i „KZA" to w intencji
 * administratora ten sam kod, a logowanie i tak dopasowuje bez rozróżniania wielkości
 * (`PgPilotsRepo.findByLogin`). Kod jedzie do kart arkusza i do logu dnia, więc krótki
 * i mono - dłuższy rozjechałby kolumnę w dokumencie klubu.
 */
const code = z
  .string()
  .trim()
  .min(2)
  .max(10)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9]+$/.test(value), {
    message: 'kod pilota: wyłącznie litery i cyfry',
  });

const name = z.string().trim().min(2).max(100);

/**
 * E-mail jest OPCJONALNY, bo kolumna `pilots.email` jest `NULL`-owalna od schematu bazowego,
 * a loginem bywa sam kod pilota. Pusty napis znaczy „bez e-maila" (`null`), a nie
 * „e-mail o zerowej długości" - inaczej wyczyszczone pole w formularzu wjechałoby do
 * bazy jako wartość i zajęło unikalny indeks.
 */
const email = z
  .union([z.string().trim().email().max(200), z.literal('')])
  .transform((value) => (value === '' ? null : value));

const role = z.enum(PILOT_ROLES);

/**
 * Parametr POWTARZALNY (`?role=admin&role=training_lead`), bo chip „Z rolą panelu"
 * z mockupu A06 to DWIE role naraz. Fastify oddaje powtórzony parametr tablicą,
 * pojedynczy - napisem; unia obsługuje oba i oddaje zawsze tablicę, żeby dalsza część
 * kodu nie znała tej różnicy. Wzorzec z `?action=` w dzienniku audytu.
 */
const roles = z
  .union([role, z.array(role)])
  .transform((value) => (Array.isArray(value) ? value : [value]));

const listQuery = z.object({
  active: z.enum(['true', 'false']).optional(),
  role: roles.optional(),
  /** Fragment kodu, nazwiska albo e-maila - dopasowanie zawierające, nie dokładne. */
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().positive().max(PAGE_LIMIT_MAX).default(200),
  /** Okno kolumny „dni lotne”; brak = bieżący miesiąc UTC (liczy zapytanie). */
  from: dayParam.optional(),
  to: dayParam.optional(),
});

const createBody = z.object({ code, name, email: email.optional(), role: role.default('pilot') });

/**
 * Wszystkie pola opcjonalne, bo `PATCH` opisuje ZMIANĘ, nie stan docelowy. Pusty obiekt
 * przejdzie walidację i odbije się o `no_changes` w komendzie - i tak ma być: to jest
 * pytanie o świat („czy coś się zmienia"), a nie o kształt żądania.
 */
const patchBody = z.object({
  code: code.optional(),
  name: name.optional(),
  email: email.optional(),
  role: role.optional(),
});

const activeBody = z.object({ active: z.boolean() });

const idParams = z.object({ id: z.string().min(1).max(100) });

/**
 * Konto → wiersz kontraktu w odpowiedzi MUTACJI.
 *
 * `flyingDays: 0` i `updatedAt` z chwili odpowiedzi są tu ŚWIADOMYM uproszczeniem:
 * mutacja oddaje tożsamość i status konta, którego dotyczyła, a nie jego statystyki.
 * Panel i tak unieważnia listę po każdej zmianie (`queries/usePilotCommands.ts`), więc
 * liczba dni lotnych przychodzi z odświeżonej listy, gdzie jest policzona w oknie.
 * Dokładanie tu drugiego zapytania po agregat byłoby kosztem bez odbiorcy.
 */
const accountToWire = (account: AdminPilotAccount, at: Date): AdminPilotListItem => ({
  id: account.id,
  code: account.code,
  name: account.name,
  email: account.email,
  active: account.active,
  role: account.role,
  updatedAt: at.toISOString(),
  flyingDays: 0,
});

export function registerAdminPilotRoutes(
  app: FastifyInstance,
  pilots: AdminPilotCommands,
  queries: AdminPilotQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    // `panel.access`, nie `accounts.manage`: listę CZYTA każdy, kto ma wejście do
    // panelu. Ta sama trasa jest słownikiem pilotów dla filtrów innych ekranów (`A02`).
    { method: 'GET', url: '/pilots', capability: 'panel.access' },
    async (req, reply) => {
      const query = listQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const q = query.data;
      return reply.send(
        await queries.list({
          active: q.active === undefined ? undefined : q.active === 'true',
          roles: q.role,
          search: q.q,
          direction: q.sort,
          limit: q.limit,
          fromMs: q.from,
          toMs: endOfDay(q.to),
        }),
      );
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/pilots', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const body = createBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await pilots.create(actor, {
        code: body.data.code,
        name: body.data.name,
        email: body.data.email ?? null,
        role: body.data.role,
      });
      if (!outcome.ok) return refusal(reply, outcome);

      // 201 i hasło W CIELE odpowiedzi - jedyny raz. Nie w nagłówku `Location`, nie
      // w URL-u, nie w logu: adresy i nagłówki bywają zapisywane po drodze.
      return reply.code(201).send({
        pilot: accountToWire(outcome.result.account, new Date()),
        password: outcome.result.password,
        revokedSessions: outcome.result.revokedSessions,
      });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'PATCH', url: '/pilots/:id', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = patchBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await pilots.update(actor, params.data.id, body.data);
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.send({
        pilot: accountToWire(outcome.result.account, new Date()),
        revokedSessions: outcome.result.revokedSessions,
      });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/pilots/:id/active', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = activeBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await pilots.setActive(actor, params.data.id, body.data.active);
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.send({
        pilot: accountToWire(outcome.result.account, new Date()),
        revokedSessions: outcome.result.revokedSessions,
      });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/pilots/:id/password-reset', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = idParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await pilots.resetPassword(actor, params.data.id);
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.send({
        pilot: accountToWire(outcome.result.account, new Date()),
        password: outcome.result.password,
        revokedSessions: outcome.result.revokedSessions,
      });
    },
  );
}

/**
 * Wariant odmowy → status i ciało. Jedno miejsce, bo cztery trasy odmawiają tak samo,
 * a odmowa z innym polem w innej trasie to dokładnie ten rozjazd, przed którym broni
 * `authorize.ts`.
 *
 * **409 `refused` niesie POWÓD.** „Nie można" bez wyjaśnienia przy przycisku
 * „Deaktywuj" kazałoby administratorowi zgadywać, czy to awaria, czy zasada -
 * a to jest dokładnie ta chwila, w której człowiek sięga po `UPDATE` w psql.
 */
function refusal(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  outcome: { reason: string; field?: 'code' | 'email'; refusal?: string },
): unknown {
  if (outcome.reason === 'not_found') return reply.code(404).send({ error: 'not_found' });
  if (outcome.reason === 'no_changes') return reply.code(400).send({ error: 'no_changes' });
  if (outcome.reason === 'conflict') {
    return reply.code(409).send({ error: 'conflict', field: outcome.field });
  }
  return reply.code(409).send({ error: 'refused', reason: outcome.refusal });
}
