/**
 * UZ Aero — panel: słowniki filtrów listy dni (`A02`).
 *
 * Chip niesie IDENTYFIKATOR do trasy — panel nie odsiewa wierszy sam. Test pilnuje
 * dwóch rzeczy, które łatwo zgubić: że jednostki wyłączone i konta nieaktywne ZOSTAJĄ
 * w słowniku (ich historia jest najczęstszym powodem szukania), oraz że wybór spoza
 * słownika nadal widać.
 */

import { describe, expect, it } from 'vitest';

import type { AircraftListItemDto, PilotListItemDto } from '../../api/dto';
import { aircraftChips, pickerLabel, pilotChips } from './dniPickers';

const aircraft = (over: Partial<AircraftListItemDto> = {}): AircraftListItemDto => ({
  id: 'ac-1',
  reg: 'SP-AXA',
  type: 'Cessna 182',
  year: 2019,
  capacityL: 330,
  fuelToleranceL: 16.5,
  mhFormat: 'hhmm',
  dualRequired: false,
  serviceStatus: 'active',
  updatedAt: '2026-07-30T18:41:00.000Z',
  claim: null,
  reading: null,
  lastEventAt: null,
  openSessions: 0,
  openFlags: 0,
  ...over,
});

const pilot = (over: Partial<PilotListItemDto> = {}): PilotListItemDto => ({
  id: 'p-1',
  code: 'TMK',
  name: 'Tomasz Małkiewicz',
  email: null,
  active: true,
  role: 'admin',
  updatedAt: '2026-07-30T18:41:00.000Z',
  flyingDays: 4,
  ...over,
});

describe('chipy samolotów', () => {
  it('pierwszy chip ZDEJMUJE zawężenie', () => {
    const [first] = aircraftChips([]);
    expect(first).toMatchObject({ id: null, label: 'Wszystkie samoloty' });
  });

  it('etykietą jest rejestracja, a typ idzie do podpowiedzi', () => {
    const [, chip] = aircraftChips([aircraft()]);
    expect(chip).toMatchObject({ id: 'ac-1', label: 'SP-AXA' });
    expect(chip!.title).toContain('Cessna 182');
  });

  it('jednostki WYŁĄCZONE zostają — ich dni nadal są w rejestrze', () => {
    const chips = aircraftChips([aircraft({ id: 'ac-2', reg: 'SP-KWA', serviceStatus: 'disabled' })]);
    expect(chips.map((c) => c.id)).toEqual([null, 'ac-2']);
    expect(chips[1]!.title).toContain('historia zostaje');
  });

  it('kolejność bierzemy z serwera, bez własnego sortowania', () => {
    const chips = aircraftChips([
      aircraft({ id: 'b', reg: 'SP-ZZZ' }),
      aircraft({ id: 'a', reg: 'SP-AAA' }),
    ]);
    expect(chips.map((c) => c.label)).toEqual(['Wszystkie samoloty', 'SP-ZZZ', 'SP-AAA']);
  });
});

describe('chipy pilotów', () => {
  it('etykietą jest KOD — nazwisko idzie do podpowiedzi', () => {
    const [, chip] = pilotChips([pilot()]);
    expect(chip).toMatchObject({ id: 'p-1', label: 'TMK' });
    expect(chip!.title).toContain('Tomasz Małkiewicz');
  });

  it('podpowiedź mówi, że filtr dopasowuje PIC-a ALBO Duala', () => {
    const [, chip] = pilotChips([pilot()]);
    expect(chip!.title).toContain('Duala');
  });

  it('konta NIEAKTYWNE zostają i są oznaczone', () => {
    const [, chip] = pilotChips([pilot({ active: false })]);
    expect(chip!.title).toContain('nieaktywne');
  });
});

describe('wybór spoza słownika', () => {
  it('pokazuje SUROWY identyfikator, zamiast udawać, że filtra nie ma', () => {
    const chips = aircraftChips([aircraft()]);
    expect(pickerLabel(chips, 'ac-nieznany')).toBe('ac-nieznany');
  });

  it('znany identyfikator dostaje swoją etykietę', () => {
    expect(pickerLabel(aircraftChips([aircraft()]), 'ac-1')).toBe('SP-AXA');
  });
});
