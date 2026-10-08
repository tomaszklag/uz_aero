/**
 * Ninerdeck - panel: hooki GRUP KLUBU (4.0.0, epik Z-D #248).
 *
 * Zapis unieważnia listę - odpowiedź zapisu niesie wprawdzie jedną grupę, ale lista ma
 * być odczytem serwera, a nie sklejką z cache'u: nazwa, której serwer odmówił u innego
 * administratora minutę temu, nie ma prawa stać na liście jako zapisana.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { GroupListDto } from '../api/dto';
import { createGroup, deleteGroup, getGroups, updateGroup, type GroupPatch, type NewGroup } from '../api/groups';
import { keys } from './keys';

/** `enabled: false` = osoba bez prawa odczytu grup; pytanie odbiłoby się 403. */
export function useGroups(enabled = true) {
  return useQuery<GroupListDto>({ queryKey: keys.groups, queryFn: getGroups, enabled });
}

function useGroupMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.groups });
    },
  });
}

export function useCreateGroup() {
  return useGroupMutation((body: NewGroup) => createGroup(body));
}

export function useUpdateGroup() {
  return useGroupMutation(({ id, patch }: { id: string; patch: GroupPatch }) => updateGroup(id, patch));
}

export function useDeleteGroup() {
  return useGroupMutation((id: string) => deleteGroup(id));
}
