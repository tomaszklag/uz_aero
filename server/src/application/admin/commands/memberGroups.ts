/**
 * Ninerdeck (serwer) - GRUPY KLUBU układane w panelu (4.0.0, issue #245;
 * `docs/zlecenia.md` §6.1, pkt 22 i 40).
 *
 * Nazwa i lista osób, nic więcej. Zakłada, zmienia i kasuje WYŁĄCZNIE administrator klubu
 * (`accounts.manage`) - grupa rozdaje dostęp do treści zleceń, więc zmiana jej składu jest
 * decyzją o cudzych sprawach i ma ślad w dzienniku akcji.
 *
 * Konstruktor bez `Database`: jedyną drogą zapisu panelu jest `AuditedWrite`, a odczyty
 * idą przez `tx` W ŚRODKU transakcji (odczyt cudzym uchwytem zawiesza PGlite).
 *
 * ══ CZŁONEK WYŁĄCZONY ZOSTAJE NA LIŚCIE (§6.1) ══
 * Konfiguracji nie czyścimy po cichu - ta sama reguła, co obsada kroku ścieżki. Dlatego
 * osoba JUŻ w grupie może mieć członkostwo wyłączone (przygasa w panelu i zleceń nie
 * dostaje), ale DOPISAĆ można wyłącznie aktywnego członka klubu. Osoba spoza klubu nie
 * trafia do grupy nigdy - jedna odmowa na „cudzy" i „nieznany".
 *
 * ══ SKASOWANIE NIE RUSZA WYSŁANYCH ZLECEŃ (§6.2) ══
 * Adresaci są zapisani imiennie przy zleceniu, więc grupa jest tylko skrótem przy
 * wybieraniu. Zlecenie wysłane do skasowanej grupy dalej ma swoich adresatów.
 */

import type {
  ClubMember,
  ClubMembersPort,
  Clock,
  MemberGroupRecord,
  MemberGroupsPort,
} from '../../common/ports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor } from '../ports.ts';

export type MemberGroupRefusal =
  /** Nazwa zajęta w klubie bez względu na wielkość liter. */
  | 'name_taken'
  /** Ktoś z listy nie jest (dopisywany - aktywnym) członkiem TEGO klubu. */
  | 'member_not_in_org';

export type MemberGroupOutcome =
  | { ok: true; group: MemberGroupRecord }
  | { ok: false; reason: MemberGroupRefusal };

class Refused extends Error {
  constructor(readonly reason: MemberGroupRefusal) {
    super(`odmowa: ${reason}`);
  }
}

class NotFound extends Error {}

export class MemberGroupCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly groups: MemberGroupsPort,
    private readonly members: ClubMembersPort,
    private readonly clock: Clock,
  ) {}

  /** Nowa grupa; `id` nadaje klient - powtórzony zapis oddaje tę samą grupę. */
  async create(actor: Actor, input: { id: string; name: string; memberIds: readonly string[] }): Promise<MemberGroupOutcome> {
    return outcomeOf(async () =>
      this.write.run(actor, async (tx) => {
        const memberIds = unique(input.memberIds);
        checkMembers(await this.members.list(tx, actor.orgId), memberIds, new Set());
        const write = await this.groups.insert(
          tx,
          actor.orgId,
          { id: input.id, name: input.name, memberIds, createdBy: actor.pilotId },
          this.clock.now(),
        );
        if (!write.ok) throw new Refused(write.reason);
        return {
          result: write.group,
          audit: {
            action: 'group.create' as const,
            targetType: 'group',
            targetId: write.group.id,
            details: { name: write.group.name, memberIds: write.group.memberIds },
          },
        };
      }),
    );
  }

  /** Zmiana nazwy albo składu (lista zastępuje poprzednią W CAŁOŚCI). `null` = grupy nie ma w tym klubie. */
  async update(
    actor: Actor,
    id: string,
    patch: { name?: string; memberIds?: readonly string[] },
  ): Promise<MemberGroupOutcome | null> {
    try {
      return await outcomeOf(async () =>
        this.write.run(actor, async (tx) => {
          const before = await this.groups.byId(tx, actor.orgId, id);
          if (before == null) throw new NotFound();
          const memberIds = patch.memberIds == null ? undefined : unique(patch.memberIds);
          if (memberIds != null) checkMembers(await this.members.list(tx, actor.orgId), memberIds, new Set(before.memberIds));

          const write = await this.groups.update(
            tx,
            actor.orgId,
            id,
            { ...(patch.name == null ? {} : { name: patch.name }), ...(memberIds == null ? {} : { memberIds }) },
            this.clock.now(),
          );
          if (write == null) throw new NotFound();
          if (!write.ok) throw new Refused(write.reason);
          return {
            result: write.group,
            audit: {
              action: 'group.update' as const,
              targetType: 'group',
              targetId: id,
              details: {
                before: { name: before.name, memberIds: before.memberIds },
                after: { name: write.group.name, memberIds: write.group.memberIds },
              },
            },
          };
        }),
      );
    } catch (err) {
      if (err instanceof NotFound) return null;
      throw err;
    }
  }

  /** Skasowanie; `false` = grupy nie ma w tym klubie. */
  async remove(actor: Actor, id: string): Promise<boolean> {
    try {
      return await this.write.run(actor, async (tx) => {
        const before = await this.groups.byId(tx, actor.orgId, id);
        if (before == null || !(await this.groups.remove(tx, actor.orgId, id))) throw new NotFound();
        return {
          result: true,
          audit: {
            action: 'group.remove' as const,
            targetType: 'group',
            targetId: id,
            details: { name: before.name, memberIds: before.memberIds },
          },
        };
      });
    } catch (err) {
      if (err instanceof NotFound) return false;
      throw err;
    }
  }
}

/**
 * Każdy z listy musi mieć członkostwo w TYM klubie; dopisywany (spoza `already`) -
 * aktywne. Obecny członek z wyłączonym członkostwem zostaje, jak w obsadzie kroku.
 */
function checkMembers(club: readonly ClubMember[], memberIds: readonly string[], already: ReadonlySet<string>): void {
  const byId = new Map(club.map((m) => [m.pilotId, m]));
  for (const pilotId of memberIds) {
    const member = byId.get(pilotId);
    if (member == null || (!member.active && !already.has(pilotId))) throw new Refused('member_not_in_org');
  }
}

async function outcomeOf(run: () => Promise<MemberGroupRecord>): Promise<MemberGroupOutcome> {
  try {
    return { ok: true, group: await run() };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.reason };
    throw err;
  }
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
