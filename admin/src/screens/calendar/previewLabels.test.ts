import { describe, expect, it } from 'vitest';

import type { AircraftPreviewDto, PilotPreviewDto } from '../../api/dto';
import type { Person } from './bookingLabels';
import { aircraftPreview, daysAgoLabel, pilotPreview, termLabel } from './previewLabels';

const TZ = 'Europe/Warsaw';
// Czwartek 24 września 2026, 10:00 czasu klubu.
const TERAZ = Date.UTC(2026, 8, 24, 8, 0);
const DAY = 86_400_000;
const H = 3_600_000;
const iso = (t: number): string => new Date(t).toISOString();

const OSOBY: Record<string, Person> = {
  jwr: { name: 'Jakub Wrona', code: 'JWR' },
  mzi: { name: 'Marta Zięba', code: 'MZI' },
};
const opts = {
  person: (id: string): Person | null => OSOBY[id] ?? null,
  reg: (id: string): string => (id === 'a1' ? 'SP-AXA' : 'SP-BKL'),
  now: TERAZ,
};

const day = (at: number) => ({
  date: '2026-09-26',
  startsAt: iso(at - 9 * H),
  endsAt: iso(at + 15 * H),
});

function pilotDto(over: Partial<PilotPreviewDto> = {}): PilotPreviewDto {
  return {
    timezone: TZ,
    bookingId: 'b1',
    pilot: { id: 'jwr', code: 'JWR', name: 'Jakub Wrona', memberSince: iso(Date.UTC(2024, 2, 12)) },
    lastFlightAt: iso(TERAZ - 6 * DAY),
    onAircraft: {
      aircraftId: 'a1',
      operations: 23,
      lastAt: iso(TERAZ - 6 * DAY),
      flights: 48,
      blockMs: (31 * 60 + 20) * 60_000,
      flightMs: 25 * H,
    },
    flying: {
      last30: { flights: 9, blockMs: (6 * 60 + 45) * 60_000, flightMs: (5 * 60 + 10) * 60_000 },
      last90: { flights: 24, blockMs: (18 * 60 + 5) * 60_000, flightMs: (14 * 60 + 20) * 60_000 },
      total: { flights: 186, blockMs: (142 * 60 + 30) * 60_000, flightMs: 100 * H },
    },
    recent: [
      {
        sessionUuid: 's1',
        at: iso(Date.UTC(2026, 8, 20, 9)),
        aircraftId: 'a1',
        pilotId: 'jwr',
        dualId: null,
        operation: 'ferry',
        blockMs: 100 * 60_000,
        flights: 1,
      },
    ],
    upcoming: [
      {
        id: 'b1',
        aircraftId: 'a1',
        kind: 'flight',
        status: 'pending',
        startsAt: iso(Date.UTC(2026, 8, 26, 7)),
        endsAt: iso(Date.UTC(2026, 8, 26, 10)),
        pilotId: 'jwr',
        blockReason: null,
        thisCase: true,
        overlaps: false,
        day: day(Date.UTC(2026, 8, 26, 7)),
      },
      {
        id: 'b2',
        aircraftId: 'a2',
        kind: 'flight',
        status: 'confirmed',
        startsAt: iso(Date.UTC(2026, 8, 26, 9, 30)),
        endsAt: iso(Date.UTC(2026, 8, 26, 11)),
        pilotId: 'jwr',
        blockReason: null,
        thisCase: false,
        overlaps: true,
        day: day(Date.UTC(2026, 8, 26, 9, 30)),
      },
    ],
    ...over,
  };
}

function aircraftDto(over: Partial<AircraftPreviewDto> = {}): AircraftPreviewDto {
  return {
    timezone: TZ,
    bookingId: 'b1',
    aircraft: {
      id: 'a1',
      reg: 'SP-AXA',
      type: 'Cessna 172',
      serviceStatus: 'active',
      capacityL: 180,
      mhFormat: 'hhmm',
      oilMinL: 6,
    },
    lastFlightAt: iso(Date.UTC(2026, 8, 20, 9)),
    counters: {
      mh: 1236.5,
      fuelL: 112,
      oilL: 8.2,
      at: iso(Date.UTC(2026, 8, 20, 14, 40)),
      source: 'handover',
      byPilotId: 'jwr',
      enteredBy: null,
    },
    last30: { daysWithFlights: 11, takeoffs: 38, blockMs: (26 * 60 + 15) * 60_000, flightMs: (21 * 60 + 40) * 60_000 },
    recent: [],
    upcoming: [
      {
        id: 'blk',
        aircraftId: 'a1',
        kind: 'block',
        status: 'confirmed',
        startsAt: iso(Date.UTC(2026, 8, 29, 6)),
        endsAt: iso(Date.UTC(2026, 9, 2, 16)),
        pilotId: null,
        blockReason: 'maintenance',
        thisCase: false,
        overlaps: false,
        day: day(Date.UTC(2026, 8, 29, 6)),
      },
    ],
    ...over,
  };
}

describe('napisy pomocnicze', () => {
  it('„ile dni temu" liczy się dobą klubu', () => {
    expect(daysAgoLabel(TERAZ - H, TERAZ, TZ)).toBe('dziś');
    expect(daysAgoLabel(TERAZ - DAY, TERAZ, TZ)).toBe('wczoraj');
    expect(daysAgoLabel(TERAZ - 6 * DAY, TERAZ, TZ)).toBe('6 dni temu');
  });

  it('termin w jednej dobie ma godziny, przez kilka dób - dwa stemple', () => {
    expect(termLabel(Date.UTC(2026, 8, 26, 7), Date.UTC(2026, 8, 26, 10), TZ)).toBe('26 wrz 09:00-12:00');
    expect(termLabel(Date.UTC(2026, 8, 29, 6), Date.UTC(2026, 9, 2, 16), TZ)).toBe(
      '29 wrz, 08:00 - 2 paź, 18:00',
    );
  });
});

describe('podgląd pilota', () => {
  it('nagłówek: kod, od kiedy w klubie, ostatni lot', () => {
    const view = pilotPreview(pilotDto(), opts);
    expect(view.heading).toEqual({
      title: 'Jakub Wrona',
      sub: 'JWR · w klubie od 12 mar 2024 · ostatni lot 6 dni temu',
    });
  });

  it('doświadczenie na egzemplarzu stoi PRZED nalotem ogólnym', () => {
    const view = pilotPreview(pilotDto(), opts);
    expect(view.cards.map((c) => c.title)).toEqual(['Na SP-AXA', 'Nalot']);
    expect(view.cards[0]!.rows).toEqual([
      { label: 'Operacji', value: '23', sub: '· ostatnia 6 dni temu' },
      { label: 'Nalot na tym egzemplarzu', value: '31:20', mono: true, sub: '· 48 lotów' },
    ]);
    expect(view.cards[1]!.rows.map((r) => r.value)).toEqual([
      '9 lotów · 6:45 blok · 5:10 w powietrzu',
      '24 loty · 18:05 blok · 14:20 w powietrzu',
      '186 lotów · 142:30 blok',
    ]);
  });

  it('pierwszy raz na tej maszynie mówi to wprost, zamiast pokazywać puste zera', () => {
    const view = pilotPreview(
      pilotDto({ onAircraft: { aircraftId: 'a1', operations: 0, lastAt: null, flights: 0, blockMs: 0, flightMs: 0 } }),
      opts,
    );
    expect(view.cards[0]!.rows).toEqual([
      { label: 'Operacji', value: '0', sub: '· pierwszy raz na tej maszynie' },
    ]);
  });

  it('ostatnie loty datą rejestru, terminy dobą klubu, nachodzenie bursztynem', () => {
    const view = pilotPreview(pilotDto(), opts);
    expect(view.recent.whoHeader).toBe('Samolot');
    expect(view.recent.rows).toEqual([
      { key: 's1', when: '20 WRZ', who: 'SP-AXA', whoMono: true, task: 'Przelot', block: '1:40' },
    ]);
    expect(view.upcoming.rows).toEqual([
      { label: '26 wrz 09:00-12:00', value: 'SP-AXA', sub: '· ta sprawa' },
      {
        label: '26 wrz 11:30-13:00',
        value: 'SP-BKL',
        sub: '· nachodzi na rozpatrywany termin',
        tone: 'amber',
      },
    ]);
  });

  it('osoba bez lotu: zdanie zamiast pustej tabeli', () => {
    const view = pilotPreview(pilotDto({ recent: [], lastFlightAt: null }), opts);
    expect(view.heading.sub).toBe('JWR · w klubie od 12 mar 2024 · jeszcze bez lotu');
    expect(view.recent.rows).toEqual([]);
    expect(view.recent.empty).toContain('ani jednego lotu');
  });
});

describe('podgląd samolotu', () => {
  it('nagłówek i liczniki ze źródłem odczytu', () => {
    const view = aircraftPreview(aircraftDto(), opts);
    expect(view.heading).toEqual({ title: 'SP-AXA', sub: 'Cessna 172 · w użytku · ostatni lot 20 WRZ' });
    expect(view.cards[0]!.rows).toEqual([
      { label: 'Motogodziny', value: '1236:30', mono: true },
      { label: 'Paliwo', value: '112 L', sub: '· zbiornik 180 L' },
      { label: 'Olej', value: '8,2 L', sub: '· minimum 6,0 L' },
      { label: 'Odczyt z', value: '20 wrz, 16:40', sub: '· zdanie samolotu, Jakub Wrona' },
    ]);
  });

  it('bez odczytu liczniki stoją kreską, nie zerem', () => {
    const view = aircraftPreview(aircraftDto({ counters: null }), opts);
    expect(view.cards[0]!.rows.map((r) => r.value)).toEqual(['—', '—', '—', '—']);
  });

  it('ostatnie 30 dni i wyłączenie z użytku na liście terminów', () => {
    const view = aircraftPreview(aircraftDto(), opts);
    expect(view.cards[1]!.rows).toEqual([
      { label: 'Dni z lotami', value: '11' },
      { label: 'Starty', value: '38' },
      { label: 'Silnik', value: '26:15', mono: true, sub: '· w powietrzu 21:40' },
    ]);
    expect(view.upcoming.rows).toEqual([
      {
        label: '29 wrz, 08:00 - 2 paź, 18:00',
        value: 'Wyłączona z użytku',
        sub: '· przegląd',
        tone: 'amber',
      },
    ]);
  });
});
