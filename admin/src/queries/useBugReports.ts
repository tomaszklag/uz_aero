/**
 * UZ Aero - panel 2.0: zgłoszenia błędów - lista i zmiana statusu (issue #87).
 *
 * Mutacja deklaruje SWOJE unieważnienia tutaj, nie na ekranie: przestawienie statusu
 * zmienia i skład listy (filtr), i liczniki nad nią, więc unieważnia CAŁY korzeń
 * zasobu. Pod tym prefiksem nie żyje nic o innej naturze - inaczej niż przy flocie,
 * gdzie próg paliwa musiał zostać poza zasięgiem unieważnień.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BugReportPageDto, BugStatusDto } from '../api/dto';
import { listBugReports, setBugStatus, type BugListQuery } from '../api/bugReports';
import { keys } from './keys';

export function useBugReports(query: BugListQuery) {
  return useQuery<BugReportPageDto>({
    queryKey: keys.bugs.list(query),
    queryFn: () => listBugReports(query),
  });
}

export function useSetBugStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      uuid,
      status,
      note,
    }: {
      uuid: string;
      status: BugStatusDto;
      note: string | null;
    }) => setBugStatus(uuid, status, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bugs.all }),
  });
}
