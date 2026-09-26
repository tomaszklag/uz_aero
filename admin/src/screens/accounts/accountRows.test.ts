import { describe, expect, it } from 'vitest';

import type { PilotListItemDto } from '../../api/dto';
import { accountRow } from './accountRows';

const pilot: PilotListItemDto = {
  id: 'p-1',
  code: 'AKO',
  name: 'Adam Kowalski',
  email: 'a.kowalski@ninerdeck.pl',
  active: true,
  capabilities: [],
  lastSeenAt: null,
  loginMethods: ['google'],
};

describe('komórki', () => {
  it('brak e-maila to kreska - normalny stan, nie brak danych', () => {
    expect(accountRow({ ...pilot, email: null }).email).toBe('—');
  });

  it('zakres mówi po polsku, nie kodem kontraktu', () => {
    expect(accountRow({ ...pilot, capabilities: ['reservations.approve', 'fleet.watch'] }).scopeLabel).toBe(
      'Akceptujący',
    );
  });

  it('konto wyłączone przygasza wiersz', () => {
    const row = accountRow({ ...pilot, active: false });
    expect(row.statusLabel).toBe('Nieaktywny');
    expect(row.muted).toBe(true);
  });
});

describe('zakres w wierszu', () => {

  // Przypadek o zdaniu opisującym rolę przeszedł do `scope.test.ts` razem z katalogiem
  // zdolności (epik #197): rola przestała istnieć, a opis należy dziś do ZDOLNOŚCI.
  it('zakres nazywa się ZE ZBIORU - wiersz nie przechowuje nazwy', () => {
    expect(accountRow(pilot).scopeLabel).toBe('Pilot');
    expect(accountRow({ ...pilot, capabilities: ['panel.access', 'fleet.manage', 'fleet.watch'] }).scopeLabel).toBe(
      'Technik',
    );
  });
});
