/**
 * Ninerdeck - panel: moduł ORGANIZACJE (`/admin/api/organizations*`).
 *
 * Jedyny zasób panelu na sesji PLATFORMOWEJ: administrator klubu tych tras nie otwiera
 * i nie dostaje 403, tylko 401 - jego sesja jest sesją klubu, a to nie jest ten rodzaj
 * tokenu. Ta sama asymetria, co przy zgłoszeniach błędów (issue #99, C6).
 *
 * ══ CZTERY RZECZY I ANI JEDNA WIECEJ ══
 * Lista, założenie klubu razem z pierwszym administratorem, zmiana NAZWY i wyłączenie
 * klubu. Czego tu NIE MA: kasowania klubu (dziennik jest jego dokumentem), zmiany
 * adresu (slug nadawany raz - stoi w adresach kart arkusza), rotacji kodu klubu (to
 * panel KLUBU) i jakiegokolwiek wejścia w dane klubu (`docs/wielofirmowosc.md` §3.3).
 */

import type {
  OrganizationChangeDto,
  OrganizationDetailDto,
  OrganizationDraftBody,
  OrganizationPageDto,
} from './dto';
import { apiGet, apiPatch, apiPost } from './httpClient';

export interface OrganizationListQuery {
  /** Fragment nazwy, adresu albo administratora - dopasowanie zawierające. */
  q?: string;
  /** `'true'`/`'false'` jako NAPIS: query string nie ma typu logicznego. */
  active?: 'true' | 'false';
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Pola nieustawione POMIJAMY zamiast wysyłać puste: `?q=` to dla zoda po drugiej
    // stronie napis pusty, czyli 400, a nie „bez filtra".
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function listOrganizations(query: OrganizationListQuery): Promise<OrganizationPageDto> {
  return apiGet<OrganizationPageDto>(`/organizations?${queryString(query)}`);
}

/**
 * Karta klubu - osobne żądanie, bo niesie KOD KLUBU, którego wiersz listy nie ma.
 * Kod jest konfiguracją klubu i superadministrator czyta go po to, żeby przekazać go
 * pierwszemu administratorowi razem z dostępem.
 */
export function getOrganization(id: string): Promise<{ organization: OrganizationDetailDto }> {
  return apiGet<{ organization: OrganizationDetailDto }>(
    `/organizations/${encodeURIComponent(id)}`,
  );
}

export function createOrganization(body: OrganizationDraftBody): Promise<OrganizationChangeDto> {
  return apiPost<OrganizationChangeDto>('/organizations', body);
}

/** `PATCH` opisuje ZMIANĘ - dziś jest nią wyłącznie nazwa. Adresu się nie zmienia. */
export function updateOrganization(
  id: string,
  body: { name: string },
): Promise<OrganizationChangeDto> {
  return apiPatch<OrganizationChangeDto>(`/organizations/${encodeURIComponent(id)}`, body);
}

/**
 * Wyłączenie klubu i włączenie go z powrotem - JEDNA trasa, bo jedna decyzja w dwie
 * strony (wzorzec `POST /pilots/:id/active`). Dane zostają: dziennik jest dokumentem klubu.
 */
export function setOrganizationActive(
  id: string,
  active: boolean,
): Promise<OrganizationChangeDto> {
  return apiPost<OrganizationChangeDto>(`/organizations/${encodeURIComponent(id)}/active`, {
    active,
  });
}
