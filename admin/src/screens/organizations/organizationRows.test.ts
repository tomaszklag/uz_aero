import { describe, expect, it } from 'vitest';

import type { OrganizationAdminDto, OrganizationListItemDto } from '../../api/dto';
import { organizationRow } from './organizationRows';

const admin = (name: string, signedIn: boolean): OrganizationAdminDto => ({
  pilotId: name,
  name,
  email: `${name}@gmail.com`,
  code: name.slice(0, 3).toUpperCase(),
  signedIn,
});

const organization = (over: Partial<OrganizationListItemDto> = {}): OrganizationListItemDto => ({
  id: 'org-a',
  name: 'Aeroklub Zielonogórski',
  slug: 'aeroklub-zielonogorski',
  active: true,
  createdAt: '2026-08-26T09:00:00.000Z',
  members: 14,
  aircraft: 4,
  admins: [admin('Tomasz', true)],
  ...over,
});

describe('wiersz listy klubów', () => {
  it('składa liczby, administratora i datę założenia z rokiem', () => {
    expect(organizationRow(organization())).toMatchObject({
      name: 'Aeroklub Zielonogórski',
      slug: 'aeroklub-zielonogorski',
      members: 14,
      aircraft: 4,
      admin: 'Tomasz',
      adminExtra: null,
      created: '26 SIE 2026',
      statusLabel: 'Aktywny',
      statusTone: 'green',
      muted: false,
    });
  });

  it('kilku administratorów: pierwszy z nazwiska, reszta jako `+n`', () => {
    const row = organizationRow(
      organization({ admins: [admin('Tomasz', true), admin('Ewa', true)] }),
    );

    expect(row.admin).toBe('Tomasz');
    expect(row.adminExtra).toBe('+1');
  });

  it('KLUB, DO KTÓREGO NIKT JESZCZE NIE WSZEDŁ, ma własną plakietkę', () => {
    // To jedyny stan, w którym superadministrator ma co zrobić - przypomnieć się.
    // Pod zielonym „Aktywny" byłby nie do odróżnienia od klubu, który po prostu działa.
    const row = organizationRow(organization({ admins: [admin('Piotr', false)], members: 0 }));

    expect(row.statusLabel).toBe('Administrator nie wszedł');
    expect(row.statusTone).toBe('amber');
    expect(row.adminPending).toBe(true);
  });

  it('jeden zalogowany administrator wystarczy, żeby klub był po prostu aktywny', () => {
    const row = organizationRow(
      organization({ admins: [admin('Piotr', false), admin('Ewa', true)] }),
    );

    expect(row.statusLabel).toBe('Aktywny');
  });

  it('klub WYŁĄCZONY przygasza wiersz i nie udaje awarii', () => {
    const row = organizationRow(organization({ active: false, admins: [admin('Piotr', false)] }));

    expect(row.statusLabel).toBe('Wyłączony');
    expect(row.statusTone).toBe('dim');
    expect(row.muted).toBe(true);
  });

  it('klub bez administratora (wiersz z backfillu) dostaje KRESKĘ, nie pustą komórkę', () => {
    const row = organizationRow(organization({ admins: [] }));

    expect(row.admin).toBe('—');
    expect(row.adminPending).toBe(false);
    expect(row.statusLabel).toBe('Aktywny');
  });
});
