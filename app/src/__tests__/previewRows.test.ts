import type {
  RemoteAircraftPreview,
  RemotePilotPreview,
  RemotePreviewUpcoming,
} from '../application';
import {
  aircraftPreviewVm,
  daysAgoLabel,
  memberSinceLabel,
  pilotPreviewVm,
  upcomingTermLabel,
} from '../ui/screens/logic/previewRows';

const H = 3_600_000;
const DAY = 86_400_000;
// Czwartek 24 września 2026, 10:00 czasu klubu (Europe/Warsaw, UTC+2).
const NOW = Date.UTC(2026, 8, 24, 8, 0);
const iso = (t: number): string => new Date(t).toISOString();

const dayOf = (utcMidnightMinus2h: number) => ({
  date: new Date(utcMidnightMinus2h + 2 * H).toISOString().slice(0, 10),
  startsAt: iso(utcMidnightMinus2h),
  endsAt: iso(utcMidnightMinus2h + DAY),
});
// Sobota 26 września: doba klubu zaczyna się 25.09 22:00Z.
const SOB = Date.parse('2026-09-25T22:00:00Z');

const OSOBY: Record<string, { name: string; code: string }> = {
  jwr: { name: 'Jakub Wrona', code: 'JWR' },
  mzi: { name: 'Marta Zięba', code: 'MZI' },
};
const opts = {
  now: NOW,
  regOf: (id: string): string | null => (id === 'a1' ? 'SP-AXA' : id === 'a2' ? 'SP-BKL' : null),
  personOf: (id: string) => OSOBY[id] ?? null,
};

function upcoming(over: Partial<RemotePreviewUpcoming> = {}): RemotePreviewUpcoming {
  return {
    id: 'b1',
    aircraftId: 'a1',
    kind: 'flight',
    status: 'pending',
    startsAt: iso(SOB + 9 * H),
    endsAt: iso(SOB + 12 * H),
    pilotId: 'jwr',
    blockReason: null,
    thisCase: true,
    overlaps: false,
    day: dayOf(SOB),
    ...over,
  };
}

function pilotWire(over: Partial<RemotePilotPreview> = {}): RemotePilotPreview {
  return {
    timezone: 'Europe/Warsaw',
    bookingId: 'b1',
    pilot: { id: 'jwr', code: 'JWR', name: 'Jakub Wrona', memberSince: iso(Date.UTC(2024, 2, 12)) },
    lastFlightAt: iso(NOW - 6 * DAY),
    onAircraft: {
      aircraftId: 'a1',
      operations: 23,
      lastAt: iso(NOW - 6 * DAY),
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
      {
        sessionUuid: 's2',
        at: iso(Date.UTC(2026, 8, 7, 9)),
        aircraftId: 'a2',
        pilotId: 'jwr',
        dualId: null,
        operation: 'skoki',
        blockMs: 130 * 60_000,
        flights: 4,
      },
    ],
    upcoming: [
      upcoming(),
      upcoming({
        id: 'b2',
        aircraftId: 'a2',
        status: 'confirmed',
        startsAt: iso(SOB + 11.5 * H),
        endsAt: iso(SOB + 13 * H),
        thisCase: false,
        overlaps: true,
      }),
    ],
    ...over,
  };
}

function aircraftWire(over: Partial<RemoteAircraftPreview> = {}): RemoteAircraftPreview {
  return {
    timezone: 'Europe/Warsaw',
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
      at: iso(Date.UTC(2026, 8, 20, 16, 40)),
      source: 'handover',
      byPilotId: 'jwr',
      enteredBy: null,
    },
    last30: {
      daysWithFlights: 11,
      takeoffs: 38,
      blockMs: (26 * 60 + 15) * 60_000,
      flightMs: (21 * 60 + 40) * 60_000,
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
      upcoming({ pilotId: 'jwr' }),
      upcoming({
        id: 'blk',
        kind: 'block',
        status: 'confirmed',
        pilotId: null,
        blockReason: 'maintenance',
        thisCase: false,
        // Wtorek 29 września 08:00 - piątek 2 października 18:00 czasu klubu.
        startsAt: iso(SOB + 3 * DAY + 8 * H),
        endsAt: iso(SOB + 6 * DAY + 18 * H),
        day: dayOf(SOB + 3 * DAY),
      }),
    ],
    ...over,
  };
}

describe('napisy pomocnicze', () => {
  it('„ile dni temu" liczy się dobami, nie godzinami', () => {
    expect(daysAgoLabel(NOW - H, NOW)).toBe('dziś');
    expect(daysAgoLabel(NOW - DAY, NOW)).toBe('wczoraj');
    expect(daysAgoLabel(NOW - 6 * DAY, NOW)).toBe('6 dni temu');
  });

  it('data przyjęcia do klubu niesie rok', () => {
    expect(memberSinceLabel(iso(Date.UTC(2024, 2, 12)))).toBe('12 MAR 2024');
    expect(memberSinceLabel('nie-data')).toBeNull();
  });

  it('termin w jednej dobie klubu ma godziny, przez kilka dób - dwie daty', () => {
    expect(upcomingTermLabel(upcoming())).toBe('sob 26 WRZ 09:00-12:00');
    expect(
      upcomingTermLabel(
        upcoming({
          startsAt: iso(SOB + 3 * DAY + 8 * H),
          endsAt: iso(SOB + 6 * DAY + 18 * H),
          day: dayOf(SOB + 3 * DAY),
        }),
      ),
    ).toBe('29 WRZ - 02 PAŹ');
  });
});

describe('podgląd pilota (26A)', () => {
  it('tytuł wersalikami, podtytuł: kod, od kiedy w klubie, ostatni lot', () => {
    const vm = pilotPreviewVm(pilotWire(), opts);
    expect(vm.title).toBe('JAKUB WRONA');
    expect(vm.sub).toBe('JWR · w klubie od 12 MAR 2024 · ostatni lot 6 dni temu');
  });

  it('doświadczenie na egzemplarzu sprawy stoi PRZED nalotem ogólnym', () => {
    const vm = pilotPreviewVm(pilotWire(), opts);
    expect(vm.groups.map((g) => g.label)).toEqual(['Na SP-AXA', 'Nalot']);
    expect(vm.groups[0]!.rows).toEqual([
      { label: 'Operacji', value: '23', sub: '· ostatnia 6 dni temu' },
      { label: 'Nalot', value: '31:20', sub: '· 48 lotów' },
    ]);
    expect(vm.groups[1]!.rows).toEqual([
      { label: '30 dni', value: '9 lotów', sub: '· 6:45 blok · 5:10 w powietrzu' },
      { label: '90 dni', value: '24 loty', sub: '· 18:05 blok · 14:20 w powietrzu' },
      { label: 'W klubie', value: '186 lotów', sub: '· 142:30 blok' },
    ]);
  });

  it('pierwszy raz na tej maszynie mówi to wprost', () => {
    const vm = pilotPreviewVm(
      pilotWire({ onAircraft: { aircraftId: 'a1', operations: 0, lastAt: null, flights: 0, blockMs: 0, flightMs: 0 } }),
      opts,
    );
    expect(vm.groups[0]!.rows).toEqual([
      { label: 'Operacji', value: '0', sub: 'pierwszy raz na tej maszynie' },
    ]);
  });

  it('ostatnie loty datą rejestru, znak z cache floty - nigdy surowy identyfikator', () => {
    const vm = pilotPreviewVm(pilotWire(), opts);
    expect(vm.recent.columns).toEqual(['Kiedy', 'Samolot', 'Zadanie', 'Blok']);
    expect(vm.recent.rows).toEqual([
      { id: 's1', cells: ['20 WRZ', 'SP-AXA', 'Przelot', '1:40'] },
      { id: 's2', cells: ['07 WRZ', 'SP-BKL', 'Skoki', '2:10'] },
    ]);
    const obcy = pilotPreviewVm(pilotWire({ recent: [{ ...pilotWire().recent[0]!, aircraftId: 'nieznany' }] }), opts);
    expect(obcy.recent.rows[0]!.cells[1]).toBe('—');
  });

  it('najbliższe rezerwacje: ta sprawa i nachodzenie bursztynem', () => {
    const vm = pilotPreviewVm(pilotWire(), opts);
    expect(vm.upcoming.label).toBe('Najbliższe rezerwacje');
    expect(vm.upcoming.rows).toEqual([
      { label: 'sob 26 WRZ 09:00-12:00', value: 'SP-AXA', sub: '· ta sprawa' },
      {
        label: 'sob 26 WRZ 11:30-13:00',
        value: 'SP-BKL',
        sub: 'nachodzi na rozpatrywany termin',
        tone: 'amber',
      },
    ]);
  });

  it('osoba bez lotu: podtytuł mówi to wprost, tabela ma zdanie zamiast wierszy', () => {
    const vm = pilotPreviewVm(pilotWire({ recent: [], lastFlightAt: null }), opts);
    expect(vm.sub).toBe('JWR · w klubie od 12 MAR 2024 · jeszcze bez lotu');
    expect(vm.recent.rows).toEqual([]);
    expect(vm.recent.empty).toContain('ani jednego lotu');
  });
});

describe('podgląd samolotu (26B)', () => {
  it('podtytuł i liczniki ze źródłem odczytu', () => {
    const vm = aircraftPreviewVm(aircraftWire(), opts);
    expect(vm.title).toBe('SP-AXA');
    expect(vm.sub).toBe('Cessna 172 · w użytku · zbiornik 180 L');
    expect(vm.groups[0]!.rows).toEqual([
      { label: 'Motogodziny', value: '1236:30', sub: null },
      { label: 'Paliwo', value: '112 L', sub: '· zbiornik 180 L' },
      { label: 'Olej', value: '8,2 L', sub: '· minimum 6,0 L' },
      { label: 'Odczyt z', value: '20 WRZ 16:40', sub: 'zdanie samolotu, J. Wrona' },
    ]);
  });

  it('bez odczytu liczniki stoją kreską, nie zerem', () => {
    const vm = aircraftPreviewVm(aircraftWire({ counters: null }), opts);
    expect(vm.groups[0]!.rows.map((r) => r.value)).toEqual(['—', '—', '—', '—']);
  });

  it('ostatnie 30 dni, pilot skróconym nazwiskiem, wyłączenie z użytku na liście terminów', () => {
    const vm = aircraftPreviewVm(aircraftWire(), opts);
    expect(vm.groups[1]!.rows).toEqual([
      { label: 'Dni z lotami', value: '11', sub: null },
      { label: 'Starty', value: '38', sub: null },
      { label: 'Silnik', value: '26:15', sub: '· w powietrzu 21:40' },
    ]);
    expect(vm.recent.columns[1]).toBe('Pilot');
    expect(vm.recent.rows).toEqual([{ id: 's1', cells: ['20 WRZ', 'J. Wrona', 'Przelot', '1:40'] }]);
    expect(vm.upcoming.label).toBe('Najbliższe terminy');
    expect(vm.upcoming.rows).toEqual([
      { label: 'sob 26 WRZ 09:00-12:00', value: 'Jakub Wrona', sub: '· ta sprawa' },
      { label: '29 WRZ - 02 PAŹ', value: 'Wyłączona z użytku', sub: 'przegląd', tone: 'amber' },
    ]);
  });
});
