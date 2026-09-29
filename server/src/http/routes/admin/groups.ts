/**
 * Ninerdeck (serwer) - GRUPY KLUBU w panelu (4.0.0, issue #245; `docs/zlecenia.md`
 * §6.1, §9, §13; makieta `piloci-grupy`).
 *
 * Odczyt: „Podgląd klubu" ALBO „Zlecanie lotów" - dwie różne potrzeby (kto jest w grupie;
 * do kogo wysłać zlecenie), jedna lista. Brama zna jedną zdolność, więc trasa odczytu
 * stoi na `null` i rozstrzyga w handlerze - wzorzec decyzji z 3.1.0.
 *
 * Zapis: wyłącznie „Zarządzanie kontami" (pkt 22) - grupa rozdaje dostęp do treści
 * zleceń, więc zmiana jej składu idzie przez `AuditedWrite` do dziennika akcji.
 */

import type { FastifyInstance } from 'fastify';

import type { MemberGroupCommands, MemberGroupRefusal } from '../../../application/admin/commands/memberGroups.ts';
import type { MemberGroupQueries } from '../../../application/common/queries/memberGroups.ts';
import { can } from '../../../domain/roles.ts';
import { groupCreateBody, groupPatchBody, groupWire } from '../common/groupWire.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

const STATUS: Readonly<Record<MemberGroupRefusal, number>> = {
  name_taken: 409,
  member_not_in_org: 400,
};

export function registerAdminGroupRoutes(
  app: FastifyInstance,
  commands: MemberGroupCommands,
  queries: MemberGroupQueries,
  gate: AdminGate,
): void {
  adminRoute(app, gate, { method: 'GET', url: '/groups', capability: null }, async (_req, reply, actor) => {
    if (!can(actor.capabilities, 'panel.access') && !can(actor.capabilities, 'orders.create')) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    return reply.send({ groups: (await queries.list(actor.orgId)).map(groupWire) });
  });

  adminRoute(app, gate, { method: 'POST', url: '/groups', capability: 'accounts.manage' }, async (req, reply, actor) => {
    const parsed = groupCreateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const result = await commands.create(actor, parsed.data);
    if (!result.ok) return reply.code(STATUS[result.reason]).send({ error: result.reason });
    // Powtórzony zapis wraca `200` z tą samą grupą - `201` kłamałoby, że coś powstało.
    return reply.code(result.created ? 201 : 200).send(groupWire(result.group));
  });

  adminRoute(
    app,
    gate,
    { method: 'PATCH', url: '/groups/:id', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const parsed = groupPatchBody.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
      const result = await commands.update(actor, (req.params as { id: string }).id, parsed.data);
      if (result == null) return reply.code(404).send({ error: 'not_found' });
      if (!result.ok) return reply.code(STATUS[result.reason]).send({ error: result.reason });
      return reply.send(groupWire(result.group));
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'DELETE', url: '/groups/:id', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const removed = await commands.remove(actor, (req.params as { id: string }).id);
      return removed ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' });
    },
  );
}
