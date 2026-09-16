/**
 * Ninerdeck - panel: klub z serwera -> WIERSZ TABELI (mockup `organizacje-lista`).
 *
 * Moduł CZYSTY (bez Reacta), bo to są decyzje o treści komórek - a te chcemy mieć pod
 * testem, nie w JSX-ie. Komponent dostaje gotowy wiersz i wyłącznie go rysuje.
 */

import type { OrganizationListItemDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';
import { dateWithYear, NONE } from '../common/values';

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  members: number;
  aircraft: number;
  /** Pierwszy administrator; przy kilku dochodzi `+n`. */
  admin: string;
  adminExtra: string | null;
  /** `true` = ten administrator nigdy się nie zalogował - jedyny stan do zrobienia. */
  adminPending: boolean;
  created: string;
  statusLabel: string;
  statusTone: PillTone;
  /** Wiersz przygaszony - klub wyłączony (`tr.muted`). */
  muted: boolean;
}

/**
 * Stan klubu w JEDNEJ plakietce - i to jest cały powód, dla którego liczy go moduł,
 * a nie tabela.
 *
 * Stany są TRZY, nie dwa: klub wyłączony, klub, do którego pierwszy administrator
 * jeszcze nie wszedł, i klub działający. Środkowy jest jedynym, w którym
 * superadministrator ma coś do zrobienia (przypomnieć się), więc mockup nazywa go
 * wprost zamiast chować pod zielonym „Aktywny".
 *
 * „Aktywny" jest `green`, bo to stan w normie; „Administrator nie wszedł" bursztynem -
 * czekamy, nic się nie zepsuło; wyłączony `dim`, bo to nie jest awaria, tylko decyzja.
 */
function status(organization: OrganizationListItemDto): { label: string; tone: PillTone } {
  if (!organization.active) return { label: 'Wyłączony', tone: 'dim' };
  if (organization.admins.length > 0 && organization.admins.every((a) => !a.signedIn)) {
    return { label: 'Administrator nie wszedł', tone: 'amber' };
  }
  return { label: 'Aktywny', tone: 'green' };
}

export function organizationRow(organization: OrganizationListItemDto): OrganizationRow {
  const [first, ...rest] = organization.admins;
  const state = status(organization);

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    members: organization.members,
    aircraft: organization.aircraft,
    // Klub bez ani jednego administratora nie powinien istnieć (zakładanie wymaga
    // pierwszego), ale wiersz z backfillu 1.x może go nie mieć - i wtedy kreska mówi
    // prawdę, zamiast zostawiać pustą komórkę wyglądającą na usterkę.
    admin: first?.name ?? NONE,
    adminExtra: rest.length === 0 ? null : `+${rest.length}`,
    adminPending: first != null && !first.signedIn,
    created: dateWithYear(organization.createdAt),
    statusLabel: state.label,
    statusTone: state.tone,
    muted: !organization.active,
  };
}
