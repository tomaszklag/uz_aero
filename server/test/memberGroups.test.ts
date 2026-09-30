/**
 * Ninerdeck (serwer) - grupy klubu układane w panelu (#245, `docs/zlecenia.md` §6.1,
 * pkt 22 i 40).
 *
 * Najważniejsze własności: każda zmiana grupy zostawia ślad w dzienniku akcji (grupa
 * rozdaje dostęp do treści zleceń), dopisać można wyłącznie AKTYWNEGO członka klubu,
 * a członek wyłączony, który już w grupie jest, zostaje na liście.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ORG_A, ORG_B } from './testWorld.ts';
import { adminActor, orderWorld, type OrderWorld } from './orderWorld.ts';

let w: OrderWorld;

beforeEach(async () => {
  w = await orderWorld();
});

async function audit(action: string): Promise<Array<{ target_id: string; details: Record<string, unknown> }>> {
  const { rows } = await w.db.query<{ target_id: string; details: Record<string, unknown> | string }>(
    `SELECT target_id, details FROM admin_audit WHERE action = $1 ORDER BY id`,
    [action],
  );
  return rows.map((r) => ({ target_id: r.target_id, details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details }));
}

describe('grupy klubu', () => {
  it('założenie zostawia ślad w dzienniku akcji; nazwa jedyna bez względu na wielkość liter', async () => {
    const created = await w.groups.create(adminActor, { id: 'g-1', name: 'Instruktorzy', memberIds: ['JSE', 'PWI', 'JSE'] });
    expect(created).toMatchObject({ ok: true, group: { name: 'Instruktorzy', memberIds: ['JSE', 'PWI'] } });
    expect(await audit('group.create')).toEqual([{ target_id: 'g-1', details: { name: 'Instruktorzy', memberIds: ['JSE', 'PWI'] } }]);

    expect(await w.groups.create(adminActor, { id: 'g-2', name: 'INSTRUKTORZY', memberIds: [] })).toEqual({
      ok: false,
      reason: 'name_taken',
    });
    expect(await audit('group.create')).toHaveLength(1);
  });

  it('powtórzony zapis tym samym uuidem oddaje tę samą grupę BEZ drugiego wpisu w dzienniku', async () => {
    expect(await w.groups.create(adminActor, { id: 'g-1', name: 'Piloci', memberIds: ['PWI'] })).toMatchObject({
      ok: true,
      created: true,
    });
    // Ponowione żądanie (słabe łącze) - nawet z inną treścią grupa zostaje taka, jaka jest.
    const again = await w.groups.create(adminActor, { id: 'g-1', name: 'Piloci', memberIds: ['PWI', 'KRZ'] });
    expect(again).toMatchObject({ ok: true, created: false, group: { name: 'Piloci', memberIds: ['PWI'] } });
    expect(await audit('group.create')).toHaveLength(1);
    // Uuid zajęty w INNYM klubie: dla tego klubu grupy nie ma - odmowa, bez jej treści.
    expect(
      await w.groups.create({ ...adminActor, orgId: ORG_B, pilotId: 'BAD' }, { id: 'g-1', name: 'Beta', memberIds: [] }),
    ).toEqual({ ok: false, reason: 'name_taken' });
  });

  it('osoba spoza klubu i dopisywany członek wyłączony - odmowa', async () => {
    expect(await w.groups.create(adminActor, { id: 'g-1', name: 'G', memberIds: ['BPI'] })).toEqual({
      ok: false,
      reason: 'member_not_in_org',
    });
    await w.db.query(`UPDATE memberships SET status = 'disabled' WHERE org_id = $1 AND pilot_id = 'EWA'`, [ORG_A]);
    expect(await w.groups.create(adminActor, { id: 'g-1', name: 'G', memberIds: ['EWA'] })).toEqual({
      ok: false,
      reason: 'member_not_in_org',
    });
  });

  it('członek wyłączony, który już jest w grupie, zostaje przy zmianie; dziennik ma „przed" i „po"', async () => {
    await w.groups.create(adminActor, { id: 'g-1', name: 'Piloci', memberIds: ['EWA', 'PWI'] });
    await w.db.query(`UPDATE memberships SET status = 'disabled' WHERE org_id = $1 AND pilot_id = 'EWA'`, [ORG_A]);
    const updated = await w.groups.update(adminActor, 'g-1', { name: 'Piloci An-2', memberIds: ['EWA', 'PWI', 'KRZ'] });
    expect(updated).toMatchObject({ ok: true, group: { name: 'Piloci An-2', memberIds: ['EWA', 'KRZ', 'PWI'] } });
    expect((await audit('group.update'))[0]?.details).toEqual({
      before: { name: 'Piloci', memberIds: ['EWA', 'PWI'] },
      after: { name: 'Piloci An-2', memberIds: ['EWA', 'KRZ', 'PWI'] },
    });
  });

  it('skasowanie z dziennikiem; cudza albo nieznana grupa nie istnieje', async () => {
    await w.groups.create(adminActor, { id: 'g-1', name: 'G', memberIds: [] });
    expect(await w.groups.update({ ...adminActor, orgId: ORG_B, pilotId: 'BAD' }, 'g-1', { name: 'X' })).toBeNull();
    expect(await w.groups.remove({ ...adminActor, orgId: ORG_B, pilotId: 'BAD' }, 'g-1')).toBe(false);
    expect(await w.groups.remove(adminActor, 'g-1')).toBe(true);
    expect(await audit('group.remove')).toEqual([{ target_id: 'g-1', details: { name: 'G', memberIds: [] } }]);
    expect(await w.groups.remove(adminActor, 'g-1')).toBe(false);
    expect(await w.groupQueries.list(ORG_A)).toEqual([]);
  });
});
