import { describe, expect, it } from 'vitest';

import type { PilotListItemDto } from '../../api/dto';
import { accountRow, roleLabel, roleNote, ROLE_ORDER } from './accountRows';

const pilot: PilotListItemDto = {
  id: 'p-1',
  code: 'TMK',
  name: 'Tomasz Małkiewicz',
  email: 't.malkiewicz@uzaero.pl',
  active: true,
  role: 'pilot',
};

describe('komórki', () => {
  it('brak e-maila to kreska - normalny stan, nie brak danych', () => {
    expect(accountRow({ ...pilot, email: null }).email).toBe('—');
  });

  it('rola mówi po polsku, nie kodem kontraktu', () => {
    expect(roleLabel('admin')).toBe('Administrator');
  });

  it('konto wyłączone przygasza wiersz', () => {
    const row = accountRow({ ...pilot, active: false });
    expect(row.statusLabel).toBe('Nieaktywny');
    expect(row.muted).toBe(true);
  });
});

describe('wybór roli w formularzu', () => {
  it('zaczyna się od najmniejszych uprawnień', () => {
    // Kolejność jest domyślną odpowiedzią: nowe konto to pilot, a nie administrator.
    expect(ROLE_ORDER[0]).toBe('pilot');
    expect(ROLE_ORDER).toHaveLength(2);
  });

  it('każda rola ma JEDNO zdanie o tym, co otwiera', () => {
    for (const role of ROLE_ORDER) {
      const note = roleNote(role);
      expect(note.length).toBeGreaterThan(10);
      // Jedno zdanie, nie akapit - opis roli w karcie wyboru ma się zmieścić w linii.
      expect(note.split('.').filter((part) => part.trim() !== '')).toHaveLength(1);
    }
  });
});
