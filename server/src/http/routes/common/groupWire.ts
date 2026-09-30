/**
 * Ninerdeck (serwer) - GRUPA KLUBU na drucie: ciała żądań panelu i kształt odpowiedzi
 * (4.0.0, issue #245; `docs/zlecenia.md` §6.1, §13).
 *
 * Czytają ją dwie powierzchnie - panel („kto jest w której grupie") i telefon zlecającego
 * (adresaci zlecenia) - więc kształt jest jeden. Lista osób jedzie z WYŁĄCZONYMI, bo grupa
 * ich trzyma (§6.1); przygasić je jest sprawą ekranu, który zna stan członkostwa.
 */

import { z } from 'zod';

import type { MemberGroupRecord } from '../../../application/common/ports.ts';

const ID = z.string().min(1).max(100);
const NAME = z.string().trim().min(1).max(60);

export const groupCreateBody = z.object({
  id: ID,
  name: NAME,
  memberIds: z.array(ID).max(200).default([]),
});

export const groupPatchBody = z.object({ name: NAME, memberIds: z.array(ID).max(200) }).partial();

export function groupWire(group: MemberGroupRecord): Record<string, unknown> {
  return {
    id: group.id,
    name: group.name,
    memberIds: group.memberIds,
    createdAt: new Date(group.createdAt).toISOString(),
    updatedAt: new Date(group.updatedAt).toISOString(),
  };
}
