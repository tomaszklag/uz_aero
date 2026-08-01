/**
 * UZ Aero — panel: DTO kont → wiersze tabeli `A06`.
 */

import { describe, expect, it } from 'vitest';

import type { PilotListItemDto } from '../../api/dto';
import { hasPanelRole, pilociEmpty, pilotRows, roleBadge } from './pilociRows';

const dto = (over: Partial<PilotListItemDto> = {}): PilotListItemDto => ({
  id: 'id-1',
  code: 'KZA',
  name: 'Katarzyna Zawadzka',
  email: 'k.zawadzka@uzaero.pl',
  active: true,
  role: 'pilot',
  updatedAt: '2026-07-31T06:41:00.000Z',
  flyingDays: 6,
  ...over,
});

describe('wiersz konta', () => {
  it('przepisuje tożsamość i opisuje status plakietką z kropką', () => {
    const [row] = pilotRows([dto()]);
    expect(row).toMatchObject({
      code: 'KZA',
      name: 'Katarzyna Zawadzka',
      email: 'k.zawadzka@uzaero.pl',
      status: { text: 'Aktywny', tone: 'green', dot: true },
      flyingDays: '6',
      dim: false,
    });
  });

  it('konto nieaktywne: plakietka bez kropki i CAŁY wiersz przygaszony', () => {
    // Mockup A06 rysuje nieaktywne konta wyszarzone, a nie ukryte — deaktywacja
    // odbiera dostęp, nie kasuje człowieka z historii klubu.
    const [row] = pilotRows([dto({ active: false })]);
    expect(row?.status).toEqual({ text: 'Nieaktywny', tone: 'dim', dot: false });
    expect(row?.dim).toBe(true);
  });

  it('zero dni lotnych to „—", nie „0"', () => {
    // Zero w kolumnie liczbowej czyta się jak wynik pomiaru; tu znaczy „w tym oknie
    // ani jednego dnia".
    expect(pilotRows([dto({ flyingDays: 0 })])[0]?.flyingDays).toBe('—');
  });

  it('brak e-maila to „—" — loginem bywa sam kod pilota', () => {
    expect(pilotRows([dto({ email: null })])[0]?.email).toBe('—');
  });

  it('nieczytelny stempel daje „—", a nie „Invalid Date"', () => {
    expect(pilotRows([dto({ updatedAt: 'to-nie-jest-data' })])[0]?.changed).toBe('—');
  });

  it('czytelny stempel skraca się do dnia UTC', () => {
    expect(pilotRows([dto()])[0]?.changed).toBe('31 JUL 2026');
  });
});

describe('plakietka roli', () => {
  it('role panelowe są niebieskie, pilot przygaszony', () => {
    expect(roleBadge('admin')).toEqual({ text: 'Administrator', tone: 'blue' });
    expect(roleBadge('training_lead')).toEqual({ text: 'Szef wyszkolenia', tone: 'blue' });
    expect(roleBadge('pilot')).toEqual({ text: 'Pilot', tone: 'dim' });
  });

  it('wejście do panelu ma każda rola poza pilotem', () => {
    expect(hasPanelRole('admin')).toBe(true);
    expect(hasPanelRole('training_lead')).toBe(true);
    expect(hasPanelRole('pilot')).toBe(false);
  });
});

describe('pusta lista', () => {
  it('mówi CO INNEGO przy zawężeniu niż bez niego', () => {
    expect(pilociEmpty(true).title).not.toBe(pilociEmpty(false).title);
    expect(pilociEmpty(true).note).toContain('zawężenie');
    expect(pilociEmpty(false).note).toContain('rejestracji');
  });
});
