/**
 * UZ Aero (serwer) - `OrganizationSummary`/`OrganizationDetail` → kontrakt modułu
 * Organizacje (mockupy `organizacje-lista`, `organizacje-klub`; issue #100, D3).
 *
 * Czysta funkcja, jak `pilotListItem.ts`: stemple na ISO 8601 i zapis kanoniczny kodu
 * klubu (`XXX-XXXX`) składa SERWER, nie panel - ta sama reguła, przez którą nazwę karty
 * arkusza liczy wyłącznie serwer.
 */

import { formatClubCode } from '../../../domain/clubCode.ts';
import type {
  AdminOrganizationAdmin,
  AdminOrganizationDetail,
  AdminOrganizationListItem,
} from '../contracts/organizations.ts';
import type { OrganizationAdmin, OrganizationDetail, OrganizationSummary } from '../ports.ts';

const admin = (row: OrganizationAdmin): AdminOrganizationAdmin => ({
  pilotId: row.pilotId,
  name: row.name,
  email: row.email,
  code: row.code,
  signedIn: row.signedIn,
});

export function organizationListItem(org: OrganizationSummary): AdminOrganizationListItem {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    active: org.active,
    createdAt: org.createdAt.toISOString(),
    members: org.members,
    aircraft: org.aircraft,
    admins: org.admins.map(admin),
  };
}

export function organizationDetail(org: OrganizationDetail): AdminOrganizationDetail {
  return {
    ...organizationListItem(org),
    joinCode: org.joinCode,
    joinCodeFormatted: org.joinCode == null ? null : formatClubCode(org.joinCode),
    joinCodeSince: org.joinCodeSince?.toISOString() ?? null,
  };
}
