/**
 * UZ Aero - panel: kluby na serwerze (moduł PLATFORMY, issue #101, E1).
 *
 * Warstwa `queries/` zna sieć i cache, ale nie zna ekranu.
 *
 * ══ KARTA PYTA OSOBNO, INACZEJ NIZ PRZY KONTACH ══
 * Przy kontach karta otwiera wiersz, który już jest na liście, więc `detail` nie istnieje.
 * Tu karta niesie KOD KLUBU, którego wiersz listy nie ma - a bez niego superadministrator
 * nie ma czego przekazać pierwszemu administratorowi razem z dostępem. Drugie żądanie
 * jest więc pytaniem o coś nowego, a nie o to samo drugi raz.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type {
  OrganizationChangeDto,
  OrganizationDetailDto,
  OrganizationDraftBody,
  OrganizationPageDto,
} from '../api/dto';
import {
  createOrganization,
  getOrganization,
  listOrganizations,
  setOrganizationActive,
  updateOrganization,
  type OrganizationListQuery,
} from '../api/organizations';
import { keys } from './keys';

export function useOrganizations(query: OrganizationListQuery) {
  return useQuery<OrganizationPageDto>({
    queryKey: keys.organizations.list(query),
    queryFn: () => listOrganizations(query),
  });
}

/**
 * Karta klubu. `id === 'nowy'` NIE jest identyfikatorem, tylko trybem formularza -
 * pytanie o klub o takiej nazwie wróciłoby 404 i zapaliło baner nad pustym formularzem.
 */
export function useOrganization(id: string | null) {
  return useQuery<{ organization: OrganizationDetailDto }>({
    queryKey: keys.organizations.detail(id ?? ''),
    queryFn: () => getOrganization(id!),
    enabled: id != null,
  });
}

/**
 * Unieważnienie po zapisie: LISTA zawsze, a karta - punktowo tym, co wróciło.
 *
 * Wiersz z odpowiedzi nie idzie do tabeli (ta sama zasada, co przy kontach: prawda
 * przychodzi z odświeżonej listy), ale KARTA dostaje go wprost - to pełny kształt
 * `AdminOrganizationDetail`, ten sam, który oddaje `GET /organizations/:id`.
 */
function applyChange(qc: QueryClient, change: OrganizationChangeDto): void {
  qc.setQueryData(keys.organizations.detail(change.organization.id), change);
  void qc.invalidateQueries({ queryKey: keys.organizations.all });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OrganizationDraftBody) => createOrganization(body),
    onSuccess: (change) => applyChange(qc, change),
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateOrganization(id, { name }),
    onSuccess: (change) => applyChange(qc, change),
  });
}

/**
 * Wyłączenie klubu i włączenie z powrotem. Osobna mutacja, nie parametr zmiany nazwy:
 * to osobna trasa i osobna decyzja - panel i aplikacja przestają wpuszczać jego członków
 * od razu, a poprawienie napisu takiego skutku nie ma.
 */
export function useSetOrganizationActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setOrganizationActive(id, active),
    onSuccess: (change) => applyChange(qc, change),
  });
}
