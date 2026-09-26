/**
 * Ninerdeck - panel: siatka kalendarza (issue #160, D2).
 *
 * Pod obserwacją jest jedna rzecz, którą łatwo zrobić źle i nie zauważyć: zajętość
 * dłuższa niż doba MUSI stać w każdej kolumnie, której dotyka. Wyłączenie z użytku na
 * trzy dni pokazane tylko w pierwszej z nich zostawia środę wyglądającą na wolną, choć
 * maszyna stoi w serwisie - a to jest dokładnie pytanie, po które administrator tu wchodzi.
 */

import { describe, expect, it } from 'vitest';

import type { BookingDto, CalendarDayDto } from '../../api/dto';
import type { Person } from './bookingLabels';
import { buildCalendarGrid, hasAnyItem, type CalendarAircraft } from './calendarGrid';

const dzien = (date: string, startsAt: string, endsAt: string): CalendarDayDto => ({
  date,
  startsAt,
  endsAt,
});

/** Trzy doby czasu klubu (UTC+2): 15, 16 i 17 września. */
const DNI: CalendarDayDto[] = [
  dzien('2026-09-15', '2026-09-14T22:00:00Z', '2026-09-15T22:00:00Z'),
  dzien('2026-09-16', '2026-09-15T22:00:00Z', '2026-09-16T22:00:00Z'),
  dzien('2026-09-17', '2026-09-16T22:00:00Z', '2026-09-17T22:00:00Z'),
];

const FLOTA: CalendarAircraft[] = [
  { id: 'a1', reg: 'SP-AXA', type: 'C172', inService: true },
  { id: 'a2', reg: 'SP-KWA', type: 'C152', inService: false },
];

const OSOBY: Record<string, Person> = {
  p1: { name: 'Adam Kowalski', code: 'AKO' },
  p2: { name: 'Barbara Nowak', code: 'BNO' },
};
const osoba = (id: string): Person | null => OSOBY[id] ?? null;

function booking(over: Partial<BookingDto> = {}): BookingDto {
  return {
    id: 'b1',
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: '2026-09-15T07:00:00Z',
    endsAt: '2026-09-15T09:00:00Z',
    pilotId: 'p1',
    dualId: null,
    operation: 'ferry',
    fromIcao: null,
    toIcao: null,
    plannedAirMin: null,
    plannedFuelL: null,
    sessionUuid: null,
    blockReason: null,
    note: null,
    createdBy: 'p1',
    createdAt: '2026-09-14T18:00:00Z',
    closedAt: null,
    closeReason: null,
    ...over,
  };
}

const grid = (bookings: BookingDto[]) =>
  buildCalendarGrid({ days: DNI, aircraft: FLOTA, bookings, person: osoba });

describe('siatka kalendarza', () => {
  it('wiersz na KAŻDĄ maszynę, także tę bez ani jednej rezerwacji', () => {
    const rows = grid([]);
    expect(rows.map((r) => r.aircraft.reg)).toEqual(['SP-AXA', 'SP-KWA']);
    expect(rows.every((r) => r.cells.length === 3)).toBe(true);
    expect(hasAnyItem(rows)).toBe(false);
  });

  it('MASZYNA WYŁĄCZONA ZE SŁUŻBY zostaje w siatce - tu się szuka odpowiedzi „czemu nie ma czym latać"', () => {
    const rows = grid([]);
    expect(rows[1]!.aircraft.inService).toBe(false);
  });

  it('WYŁĄCZENIE Z UŻYTKU stoi w KAŻDEJ dobie, której dotyka', () => {
    const rows = grid([
      booking({
        id: 'blk',
        kind: 'block',
        pilotId: null,
        operation: null,
        blockReason: 'maintenance',
        startsAt: '2026-09-15T04:00:00Z',
        endsAt: '2026-09-17T19:00:00Z',
      }),
    ]);
    const cells = rows[0]!.cells;
    expect(cells.map((c) => c.items.length)).toEqual([1, 1, 1]);
    expect(cells.every((c) => c.items[0]!.id === 'blk')).toBe(true);
    // Pierwsza doba to POCZĄTEK, dwie kolejne - ciąg dalszy. Bez tego rozróżnienia
    // pasek w środę wyglądałby jak nowe wyłączenie z użytku.
    expect(cells.map((c) => c.items[0]!.continues)).toEqual([false, true, true]);
  });

  it('ZETKNIĘCIE Z PÓŁNOCĄ nie dubluje paska w dwóch dobach', () => {
    const rows = grid([
      booking({ startsAt: '2026-09-15T19:00:00Z', endsAt: '2026-09-15T22:00:00Z' }),
    ]);
    expect(rows[0]!.cells.map((c) => c.items.length)).toEqual([1, 0, 0]);
  });

  it('dwie rezerwacje w jednej dobie idą PORZĄDKIEM CZASU, nie kolejnością odpowiedzi', () => {
    const rows = grid([
      booking({ id: 'pozna', startsAt: '2026-09-15T12:00:00Z', endsAt: '2026-09-15T14:00:00Z', pilotId: 'p2' }),
      booking({ id: 'wczesna', startsAt: '2026-09-15T06:00:00Z', endsAt: '2026-09-15T08:00:00Z', pilotId: 'p1' }),
    ]);
    expect(rows[0]!.cells[0]!.items.map((i) => i.id)).toEqual(['wczesna', 'pozna']);
  });

  it('zajętość CUDZEJ maszyny nie wchodzi do wiersza', () => {
    const rows = grid([booking({ aircraftId: 'a2' })]);
    expect(rows[0]!.cells[0]!.items).toHaveLength(0);
    expect(rows[1]!.cells[0]!.items).toHaveLength(1);
  });

  it('zajętość SPOZA zakresu nie pokazuje się nigdzie', () => {
    const rows = grid([
      booking({ startsAt: '2026-09-20T06:00:00Z', endsAt: '2026-09-20T08:00:00Z' }),
    ]);
    expect(hasAnyItem(rows)).toBe(false);
  });
});
