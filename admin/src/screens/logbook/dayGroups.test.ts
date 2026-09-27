import { describe, expect, it } from 'vitest';

import type { SessionDayDto } from '../../api/dto';
import { dayGroups, daySums } from './dayGroups';
import type { SessionRow } from './sessionRows';

const DAY = Date.UTC(2026, 8, 6);
const MIN = 60_000;

const row = (uuid: string, claimedAt: number | null): SessionRow => ({
  sessionUuid: uuid,
  signature: null,
  claimedAt,
  dayKey: claimedAt == null ? null : new Date(claimedAt).toISOString().slice(0, 10),
  manual: false,
  voided: false,
  flags: [],
  warn: { fuel: null, moto: null },
  engine: { from: '08:00', to: '10:00', note: null },
  block: '2:00',
  flight: { from: '08:10', to: '09:50', note: null },
  flights: '1',
  reg: 'SP-AXA',
  aircraftType: 'Cessna 182',
  picId: 'p-1',
  dualId: null,
  pic: 'A. Kowalski',
  dual: null,
  operation: 'Skoki',
  fuel: { from: '100 L', to: '80 L', note: null },
  moto: { from: '1:00', to: '3:00', note: null },
  oil: '9,0 L',
  oilNote: null,
});

const day = (over: Partial<SessionDayDto> = {}): SessionDayDto => ({
  day: '2026-09-06',
  operations: 1,
  flights: 6,
  blockMs: 142 * MIN,
  flightMs: 117 * MIN,
  inProgress: 0,
  dual: null,
  ...over,
});

describe('sumy doby', () => {
  it('cztery sumy nalotu w STAŁEJ kolejności, wartość mocna', () => {
    expect(daySums(day()).map((s) => `${s.value} ${s.label}`)).toEqual([
      '1 operacja',
      '6 lotów',
      '2:22 blok',
      '1:57 lot',
    ]);
    expect(daySums(day()).every((s) => s.strong && !s.aside)).toBe(true);
  });

  it('operacje w toku i prawy fotel stoją PO separatorze - „w toku" bez wartości mocnej', () => {
    const sums = daySums(day({ inProgress: 1, dual: { operations: 1, blockMs: 132 * MIN } }));
    expect(sums.slice(4)).toEqual([
      { value: '1', label: 'w toku', aside: true, strong: false },
      { value: '2:12', label: 'drugi pilot', aside: true, strong: true },
    ]);
  });

  it('doba bez zamkniętej operacji NIE dostaje czwórki zer', () => {
    expect(daySums(day({ operations: 0, flights: 0, blockMs: 0, flightMs: 0, inProgress: 1 }))).toEqual([
      { value: '1', label: 'w toku', aside: true, strong: false },
    ]);
    expect(daySums(undefined)).toEqual([]);
  });
});

describe('grupowanie dobami', () => {
  it('doba jest nagłówkiem: data zdaniowo, dzień tygodnia, sumy Z SERWERA po kluczu', () => {
    const groups = dayGroups(
      [row('a', DAY + 8 * 60 * MIN), row('b', DAY + 13 * 60 * MIN), row('c', DAY - 5 * 60 * MIN)],
      [day(), day({ day: '2026-09-05', operations: 2 })],
    );
    expect(groups.map((g) => [g.key, g.date, g.weekday, g.rows.length])).toEqual([
      ['2026-09-06', '6 września', 'niedziela', 2],
      ['2026-09-05', '5 września', 'sobota', 1],
    ]);
    expect(groups[1]?.sums[0]).toMatchObject({ value: '2', label: 'operacje' });
  });

  it('doba bez sum z serwera dostaje samą datę - zer nie zmyślamy', () => {
    const groups = dayGroups([row('a', DAY)], []);
    expect(groups[0]?.sums).toEqual([]);
  });

  it('zapis bez przejęcia ląduje pod „Bez daty"', () => {
    const groups = dayGroups([row('a', DAY), row('b', null)], [day()]);
    expect(groups.map((g) => g.date)).toEqual(['6 września', 'Bez daty']);
  });
});
