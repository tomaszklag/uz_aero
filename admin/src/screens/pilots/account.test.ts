/**
 * UZ Aero — panel: które konto pokazuje szuflada `A06a`.
 *
 * Własność, dla której ten moduł powstał: **skutku mutacji nie wolno zgubić przez
 * filtr listy**. Jednorazowe hasło i potwierdzenie akcji nieodwracalnej są jedynymi
 * rzeczami w panelu, których nie da się odzyskać ponownym otwarciem ekranu.
 */

import { describe, expect, it } from 'vitest';

import type { PilotListItemDto } from '../../api/dto';
import { drawerAccount, latestEffect } from './account';

const account = (over: Partial<PilotListItemDto> = {}): PilotListItemDto => ({
  id: 'PWI',
  code: 'PWI',
  name: 'Piotr Wiśniewski',
  email: 'piotr@uzaero.pl',
  active: true,
  role: 'pilot',
  updatedAt: '2026-08-01T09:00:00.000Z',
  flyingDays: 4,
  ...over,
});

describe('konto pokazywane w szufladzie', () => {
  it('wiersz listy wygrywa, dopóki na liście jest', () => {
    // Lista wraca świeża po unieważnieniu, a skutek mutacji z czasem się starzeje —
    // więc źródłem prawdy jest lista, nie ostatnia odpowiedź serwera.
    const fromList = account({ name: 'Piotr Wiśniewski-Nowak' });
    const stale = { pilot: account({ name: 'Piotr Wiśniewski' }), at: 10 };
    expect(drawerAccount(fromList, [stale])).toBe(fromList);
  });

  it('gdy wiersz WYPADŁ z zawężenia, szuflada pokazuje skutek mutacji', () => {
    // Ścieżka najczęstsza i najbardziej bolesna: chip „Aktywni" + deaktywacja.
    // Wiersz z definicji znika z listy, a razem z nim znikało potwierdzenie.
    const effect = { pilot: account({ active: false }), at: 20 };
    expect(drawerAccount(null, [effect])).toBe(effect.pilot);
  });

  it('spośród kilku skutków wygrywa NAJŚWIEŻSZY, nie pierwszy z brzegu', () => {
    const renamed = { pilot: account({ name: 'Nowe Nazwisko' }), at: 10 };
    const deactivated = { pilot: account({ active: false }), at: 30 };
    expect(drawerAccount(null, [renamed, deactivated])?.active).toBe(false);
    // Kolejność argumentów nie może rozstrzygać — rozstrzyga znacznik czasu.
    expect(drawerAccount(null, [deactivated, renamed])?.active).toBe(false);
  });

  it('bez wiersza i bez mutacji — nie ma czego pokazać', () => {
    expect(drawerAccount(null, [])).toBeNull();
    expect(drawerAccount(null, [null, null])).toBeNull();
    expect(latestEffect([null])).toBeNull();
  });
});
