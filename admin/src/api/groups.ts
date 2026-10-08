/**
 * Ninerdeck - panel: GRUPY KLUBU (`/admin/api/groups*`; 4.0.0, epik Z-D #248;
 * `docs/zlecenia.md` §6.1, §13).
 *
 * Odczyt dla „Podglądu klubu" albo „Zlecania lotów" (lista grup do wyboru adresatów),
 * zapis wyłącznie dla „Kont pilotów" - serwer wpisuje każdą zmianę do dziennika akcji,
 * bo grupa rozdaje dostęp do treści zleceń. Identyfikator nowej grupy nadaje PANEL
 * (uuid = idempotencja zapisu): ponowione żądanie wraca tą samą grupą, nie drugą.
 */

import type { GroupDto, GroupListDto } from './dto';
import { apiDelete, apiGet, apiPatch, apiPost } from './httpClient';

export function getGroups(): Promise<GroupListDto> {
  return apiGet<GroupListDto>('/groups');
}

export interface NewGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export function createGroup(body: NewGroup): Promise<GroupDto> {
  return apiPost<GroupDto>('/groups', body);
}

/** Zmiana niesie nazwę i komplet obsady - pole pominięte zostaje bez zmian. */
export interface GroupPatch {
  name?: string;
  memberIds?: string[];
}

export function updateGroup(id: string, patch: GroupPatch): Promise<GroupDto> {
  return apiPatch<GroupDto>(`/groups/${encodeURIComponent(id)}`, patch);
}

export function deleteGroup(id: string): Promise<void> {
  return apiDelete(`/groups/${encodeURIComponent(id)}`);
}
