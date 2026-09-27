/**
 * Ninerdeck - panel 3.2: statystyki - treść faktów, słupków i wierszy tabel.
 *
 * Pod obserwacją trzy reguły ekranu: kreska tam, gdzie serwer nie wie (nigdy zero),
 * prawy fotel jako OSOBNA liczba z osobną sumą (§17.1 pkt 1) i podtytuł, który NAZYWA
 * podstawę liczenia zamiast zostawiać rozjazd z dziennikiem bez wyjaśnienia.
 */

import { describe, expect, it } from 'vitest';

import type { StatsAircraftDto, StatsPilotDto, StatsReportDto, StatsTotalsDto } from '../../api/dto';
import {
  aircraftFoot,
  aircraftRow,
  operationFoot,
  operationRow,
  pilotFoot,
  pilotRow,
  rangeLabel,
  statsBars,
  statsFacts,
  statsSubtitle,
} from './statsRows';

const HOUR = 3_600_000;
const MIN = 60_000;

const TOTALS: StatsTotalsDto = {
  sessions: 11,
  activeDays: 6,
  flights: 33,
  aircraft: 3,
  pilots: 5,
  blockMs: 19 * HOUR + 45 * MIN,
  flightMs: 15 * HOUR + 46 * MIN,
  fuelConsumedL: 1125,
  fuelUnknownSessions: 0,
  avgLitresPerBlockHour: 56.96,
  mhDeltaH: 19.9,
  mhUnknownSessions: 0,
  dual: { operations: 3, blockMs: 6 * HOUR + 4 * MIN },
  staleRows: 0,
  openSessionsInRange: 2,
  openSessionsUndated: 0,
};

const report = (totals: Partial<StatsTotalsDto> = {}): StatsReportDto => ({
  at: '2026-09-07T12:00:00.000Z',
  range: { fromDay: '2026-09-01', toDay: '2026-09-07', calendarDays: 7, defaulted: false },
  totals: { ...TOTALS, ...totals },
  daily: [],
  aircraft: [],
  pilots: [],
  operations: [],
});

describe('podtytuł nazywa podstawę liczenia', () => {
  it('zakres słowami, podstawa i operacje w toku poza sumami', () => {
    expect(statsSubtitle(report())).toBe(
      '1–7 września 2026 · operacje zamknięte w zakresie · 2 w toku poza sumami',
    );
  });

  it('zero operacji w toku nie dostaje członu - zdanie kończy się na podstawie', () => {
    expect(statsSubtitle(report({ openSessionsInRange: 0 }))).toBe(
      '1–7 września 2026 · operacje zamknięte w zakresie',
    );
  });

  it('operacja bez daty przejęcia (rejestr niekompletny) jest nazwana osobno', () => {
    expect(statsSubtitle(report({ openSessionsInRange: 0, openSessionsUndated: 1 }))).toContain(
      '1 bez daty przejęcia',
    );
  });
});

describe('zakres słowami', () => {
  it('ten sam miesiąc, różne miesiące, różne lata i jeden dzień', () => {
    expect(rangeLabel('2026-09-01', '2026-09-07')).toBe('1–7 września 2026');
    expect(rangeLabel('2026-08-25', '2026-09-07')).toBe('25 sierpnia – 7 września 2026');
    expect(rangeLabel('2025-12-01', '2026-01-07')).toBe('1 grudnia 2025 – 7 stycznia 2026');
    expect(rangeLabel('2026-09-07', '2026-09-07')).toBe('7 września 2026');
  });
});

describe('pasek faktów', () => {
  it('osiem faktów w kolejności kafelka operacji, dni lotne z mianownikiem', () => {
    const facts = statsFacts(TOTALS, 7);
    expect(facts.map((fact) => fact.label)).toEqual([
      'Operacje',
      'Dni lotne',
      'Loty',
      'Blok',
      'Lot',
      'Paliwo',
      'Δ MH',
      'Piloci',
    ]);
    expect(facts[1]).toEqual({ label: 'Dni lotne', value: '6', small: 'z 7' });
    expect(facts[3]!.value).toBe('19:45');
    expect(facts[5]!.value).toBe('1125 L');
    // Δ MH w godzinach dziesiętnych - flota miesza formaty licznika.
    expect(facts[6]!.value).toBe('19,9 h');
  });

  it('bilans, którego serwer nie zna, to kreska - nie zero', () => {
    const facts = statsFacts({ ...TOTALS, fuelConsumedL: null, mhDeltaH: null }, 7);
    expect(facts[5]!.value).toBe('—');
    expect(facts[6]!.value).toBe('—');
  });
});

describe('słupki nalotu', () => {
  const daily = [
    { day: '2026-09-01', blockMs: 5 * HOUR + 26 * MIN },
    { day: '2026-09-02', blockMs: 2 * HOUR + 32 * MIN },
    { day: '2026-09-03', blockMs: 0 },
  ];

  it('wysokość względem najwyższego dnia, zero jako kreska, podpis przy każdym słupku w tygodniu', () => {
    const chart = statsBars(daily, '2026-09-01', '2026-09-03', '2026-09-03');
    expect(chart.bars.map((bar) => bar.heightPct)).toEqual([100, 47, 0]);
    expect(chart.bars.map((bar) => bar.zero)).toEqual([false, false, true]);
    expect(chart.bars[0]!.title).toBe('1 wrz: 5:26');
    expect(chart.bars.map((bar) => bar.label)).toEqual(['1 wrz', '2 wrz', '3 wrz']);
    expect(chart.axisLeft).toBe('najwyższy dzień: 1 września · 5:26');
    // Ostatni dzień zakresu jest dzisiejszy - podpis mówi to wprost.
    expect(chart.axisRight).toBe('3 wrz · dziś');
    expect(chart.aria).toBe('Nalot blokowy dzień po dniu, 1–3 września 2026');
  });

  it('przy dłuższym zakresie podpis co siódmy słupek, a zakres zamknięty w przeszłości bez „dziś"', () => {
    const month = Array.from({ length: 30 }, (_, i) => ({
      day: `2026-08-${String(i + 1).padStart(2, '0')}`,
      blockMs: HOUR,
    }));
    const chart = statsBars(month, '2026-08-01', '2026-08-30', '2026-09-07');
    expect(chart.bars.filter((bar) => bar.label != null).map((bar) => bar.label)).toEqual([
      '1 sie',
      '8 sie',
      '15 sie',
      '22 sie',
      '29 sie',
    ]);
    expect(chart.axisRight).toBe('30 sie');
  });

  it('zakres bez ani jednego lotu nie ma najwyższego dnia', () => {
    const chart = statsBars(
      [{ day: '2026-09-01', blockMs: 0 }],
      '2026-09-01',
      '2026-09-01',
      '2026-09-07',
    );
    expect(chart.bars[0]!.heightPct).toBe(0);
    expect(chart.axisLeft).toBe('bez lotów w tym zakresie');
  });
});

describe('tabela samolotów', () => {
  const axa: StatsAircraftDto = {
    aircraftId: 'a1',
    reg: 'SP-AXA',
    aircraftType: 'Cessna 182',
    mhFormat: 'hhmm',
    sessions: 7,
    flights: 22,
    blockMs: 12 * HOUR + 15 * MIN,
    flightMs: 9 * HOUR + 59 * MIN,
    fuelConsumedL: 469,
    fuelUnknownSessions: 0,
    avgLitresPerBlockHour: 38.29,
    mhDeltaH: 12.533,
    mhUnknownSessions: 0,
    activeDays: 6,
    utilizationPct: 85.7,
    staleRows: 0,
  };

  it('formatuje policzone liczby: HH:MM, litry, Śr. L/h z przecinkiem, licznik w formacie maszyny, procent', () => {
    expect(aircraftRow(axa)).toMatchObject({
      reg: 'SP-AXA',
      aircraftType: 'Cessna 182',
      operations: '7',
      days: '6',
      flights: '22',
      block: '12:15',
      flight: '09:59',
      fuel: '469 L',
      fuelNote: null,
      avg: '38,3',
      moto: '12:32',
      utilization: '86 %',
    });
  });

  it('bilans z dziurą to kreska z podpisem, ILE operacji nie ma odczytu', () => {
    const row = aircraftRow({ ...axa, fuelConsumedL: null, avgLitresPerBlockHour: null, fuelUnknownSessions: 2 });
    expect(row.fuel).toBe('—');
    expect(row.avg).toBe('—');
    expect(row.fuelNote).toBe('2 operacje bez odczytu');
  });

  it('maszyna spoza rejestru floty zostaje w tabeli z kreską w miejscu znaków', () => {
    expect(aircraftRow({ ...axa, reg: null, aircraftType: null, mhFormat: null }).reg).toBe('—');
  });

  it('wiersz Razem: średnią floty i Δ MH podaje serwer; wykorzystanie nie ma sumy', () => {
    expect(aircraftFoot(TOTALS)).toEqual([
      'Razem',
      '11',
      '6',
      '33',
      '19:45',
      '15:46',
      '1125 L',
      '57,0',
      '19,9 h',
      '—',
    ]);
  });
});

describe('tabela pilotów - prawy fotel osobno', () => {
  const instructor: StatsPilotDto = {
    pilotId: 'p1',
    code: 'AKO',
    name: 'Adam Kowalski',
    sessions: 4,
    flights: 15,
    blockMs: 7 * HOUR + 40 * MIN,
    flightMs: 6 * HOUR + 20 * MIN,
    dual: { operations: 2, blockMs: 2 * HOUR + 12 * MIN },
    regs: ['SP-AXA', 'SP-KLM'],
    staleRows: 0,
  };

  it('nalot dowódcy w swoich kolumnach, czas w prawym fotelu w swojej', () => {
    expect(pilotRow(instructor)).toMatchObject({
      name: 'Adam Kowalski',
      code: 'AKO',
      note: null,
      operations: '4',
      flights: '15',
      block: '07:40',
      flight: '06:20',
      dual: '02:12',
      regs: ['SP-AXA', 'SP-KLM'],
    });
  });

  it('uczeń bez operacji jako dowódca: zera w nalocie, liczba w swojej kolumnie i podpis dlaczego', () => {
    const learner = pilotRow({
      ...instructor,
      code: 'JWR',
      sessions: 0,
      flights: 0,
      blockMs: 0,
      flightMs: 0,
      dual: { operations: 3, blockMs: 3 * HOUR + 52 * MIN },
    });
    expect(learner.note).toBe('tylko jako drugi pilot');
    expect(learner.block).toBe('00:00');
    expect(learner.dual).toBe('03:52');
  });

  it('bez lotu w prawym fotelu kolumna ma kreskę, nie 00:00', () => {
    expect(pilotRow({ ...instructor, dual: null }).dual).toBe('—');
  });

  it('wiersz Razem sumuje prawy fotel OSOBNO - liczbą z serwera, nie z wierszy', () => {
    expect(pilotFoot(TOTALS)).toEqual(['Razem', '11', '33', '19:45', '15:46', '06:04', '']);
    expect(pilotFoot({ ...TOTALS, dual: null })[5]).toBe('—');
  });
});

describe('tabela zadań', () => {
  it('nazwa zadania po polsku, udział z serwera, brak zadania nazwany kreską', () => {
    const row = operationRow({
      operation: 'ferry',
      sessions: 3,
      flights: 5,
      blockMs: 4 * HOUR + 10 * MIN,
      flightMs: 3 * HOUR + 7 * MIN,
      blockSharePct: 21.1,
      regs: ['SP-AXA', 'SP-TWG'],
      staleRows: 0,
    });
    expect(row).toMatchObject({ key: 'ferry', label: 'Przelot', share: '21 %', block: '04:10' });
    expect(operationRow({ ...row, operation: null, blockSharePct: null } as never).label).toBe('—');
  });

  it('wiersz Razem: udziały dają całość, a bez nalotu nie ma czego dzielić', () => {
    expect(operationFoot(TOTALS)).toEqual(['Razem', '11', '33', '19:45', '15:46', '100 %', '']);
    expect(operationFoot({ ...TOTALS, blockMs: 0 })[5]).toBe('—');
  });
});
