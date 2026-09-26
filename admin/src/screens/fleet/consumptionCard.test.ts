/**
 * Ninerdeck - panel 3.2: karta „Zużycie z lotów" - treść z raportu analityki.
 *
 * Pod obserwacją: brak modelu = brak karty (issue #69), norma z dokumentacji jako
 * marker z odchyłką (issue #66), wiersz motogodzin gasnący osobno i geometria paska
 * na osi pełnych dziesiątek.
 */

import { describe, expect, it } from 'vitest';

import type { ConsumptionReportDto } from '../../api/dto';
import { consumptionCardView } from './consumptionCard';

const HOUR = 3_600_000;

function report(overrides: Partial<ConsumptionReportDto> = {}): ConsumptionReportDto {
  const gate = { published: true, intervals: 40, engineMs: 100 * HOUR, missingIntervals: 0, missingEngineMs: 0 };
  return {
    at: '2026-09-07T12:00:00.000Z',
    aircraft: { aircraftId: 'a1', reg: 'SP-AXA', mhFormat: 'hhmm', fuelNormLPerH: 30 },
    headline: { litersPerFlightHour: 38.3, litersPerBlockHour: 30.9, vsDocumentationPct: 3 },
    basis: { sessions: 42, firstDay: Date.UTC(2026, 4, 3) },
    summary: {
      intervals: 40,
      litersTotal: 3090,
      engineMs: 100 * HOUR,
      flightMs: 80 * HOUR,
      flights: 90,
      litersPerFlightHour: 38.3,
      litersPerBlockHour: 30.9,
      litersPerFlight: 34,
      blockLPerHP10: 28.4,
      blockLPerHP90: 32.9,
      months: [
        { month: '2026-07', litersTotal: 900, engineMs: 30 * HOUR, intervals: 12, litersPerBlockHour: 30 },
        { month: '2026-08', litersTotal: 280, engineMs: 9 * HOUR, intervals: 9, litersPerBlockHour: 31.1 },
      ],
      firstDay: Date.UTC(2026, 4, 3),
      lastDay: Date.UTC(2026, 8, 6),
    },
    fuel: {
      published: true,
      gate,
      phaseSet: 'two',
      degradedBecause: 'none',
      rates: [],
      equations: 37,
      degreesOfFreedom: 35,
      residualSigmaL: 2,
      rSquaredUncentered: 0.98,
      outliers: [{} as never, {} as never, {} as never],
      tracedIntervals: 38,
    },
    norm: {
      windowDays: 90,
      blockLPerHLow: 28.4,
      blockLPerHHigh: 32.9,
      blockLPerH: 30.9,
      airLPerH: 33.2,
      groundLPerH: 11.6,
      litersPerFlight: 34,
      fuelRatioLow: 0.9,
      fuelRatioHigh: 1.1,
      mh: { kind: 'tach', perFlightHour: 0.98, perGroundHour: 0.61, ratioLow: null, ratioHigh: null, sessions: 40 },
      intervals: 40,
      engineMs: 100 * HOUR,
      computedAt: Date.UTC(2026, 8, 7),
    },
    mh: {
      published: true,
      kind: 'tach',
      perFlightHour: 0.98,
      perFlightCi: 0.02,
      perGroundHour: 0.61,
      perGroundCi: 0.05,
      equations: 40,
      rejected: 0,
      residualSigmaH: 0.1,
      rows: [],
    },
    ...overrides,
  };
}

describe('brak danych = milczenie', () => {
  it('model poniżej progu publikacji znaczy BRAK karty - nie zera, nie zdanie o braku', () => {
    const r = report();
    expect(consumptionCardView({ ...r, fuel: { ...r.fuel, published: false }, norm: null })).toBeNull();
  });

  it('wiersz motogodzin gaśnie OSOBNO, gdy przeliczników nie ma - paliwo zostaje', () => {
    const r = report();
    const view = consumptionCardView({ ...r, norm: { ...r.norm!, mh: null } })!;
    expect(view.rows.map((row) => row.label)).not.toContain('Motogodziny');
    expect(view.band.value).toBe('28,4–32,9');
  });
});

describe('dwie różne liczby: pasmo z lotów i norma z dokumentacji', () => {
  it('pasmo zmierzone w zieleni, norma zadeklarowana bursztynem z odchyłką policzoną przez serwer', () => {
    const view = consumptionCardView(report())!;
    expect(view.badge).toBe('42 operacje · od 3 MAJA');
    expect(view.band).toEqual({
      label: 'Pasmo zużycia · 10.–90. centyl',
      value: '28,4–32,9',
      small: 'L/h',
      tone: 'green',
    });
    expect(view.rows[0]).toEqual({
      label: 'Z dokumentacji',
      value: '30,0',
      small: 'L/h · zadeklarowane, nie zmierzone · z lotów +3 %',
      tone: 'amber',
    });
  });

  it('bez normy z dokumentacji nie ma ani wiersza, ani markera - i nic nie udaje odchyłki', () => {
    const r = report();
    const view = consumptionCardView({
      ...r,
      aircraft: { ...r.aircraft, fuelNormLPerH: null },
      headline: { ...r.headline, vsDocumentationPct: null },
    })!;
    expect(view.rows.map((row) => row.label)).not.toContain('Z dokumentacji');
    expect(view.gauge.markPct).toBeNull();
    expect(view.gauge.aria).toBe('Pasmo 28,4–32,9 L/h na skali 20–40');
  });

  it('odchyłka ujemna z minusem typograficznym, zerowa bez znaku', () => {
    const r = report();
    const minus = consumptionCardView({ ...r, headline: { ...r.headline, vsDocumentationPct: -4.4 } })!;
    expect(minus.rows[0]!.small).toContain('z lotów −4 %');
    const zero = consumptionCardView({ ...r, headline: { ...r.headline, vsDocumentationPct: 0.2 } })!;
    expect(zero.rows[0]!.small).toContain('z lotów 0 %');
  });
});

describe('geometria paska', () => {
  it('oś w pełnych dziesiątkach obejmujących pasmo i marker; pasmo i marker w procentach osi', () => {
    const view = consumptionCardView(report())!;
    // 28,4–32,9 z markerem 30 na osi 20–40 - dokładnie jak na makiecie.
    expect(view.gauge).toMatchObject({
      leftPct: 42,
      widthPct: 22.5,
      markPct: 50,
      markTitle: 'Z dokumentacji: 30,0 L/h',
      scaleLow: '20 L/h',
      scaleHigh: '40 L/h',
    });
  });

  it('marker poza pasmem rozciąga oś, żeby było go widać', () => {
    const r = report();
    const view = consumptionCardView({ ...r, aircraft: { ...r.aircraft, fuelNormLPerH: 44 } })!;
    expect(view.gauge.scaleHigh).toBe('50 L/h');
    expect(view.gauge.markPct).toBe(80);
  });

  it('wąskie pasmo w jednej działce dostaje oś na dwie - nie stoi przyklejone do brzegu', () => {
    const r = report();
    const view = consumptionCardView({
      ...r,
      aircraft: { ...r.aircraft, fuelNormLPerH: null },
      norm: { ...r.norm!, blockLPerHLow: 15, blockLPerHHigh: 17 },
    })!;
    expect(view.gauge.scaleLow).toBe('0 L/h');
    expect(view.gauge.scaleHigh).toBe('20 L/h');
  });
});

describe('pozostałe wiersze', () => {
  it('stawki fazowe z normy dla telefonu, przeliczniki z rodzajem licznika, obserwacje i ostatni miesiąc', () => {
    const view = consumptionCardView(report())!;
    expect(view.rows.map((row) => [row.label, row.value, row.small])).toEqual([
      ['Z dokumentacji', '30,0', 'L/h · zadeklarowane, nie zmierzone · z lotów +3 %'],
      ['W locie / na ziemi', '33,2 / 11,6', 'L/h'],
      ['Na godzinę lotu', '38,3', 'L/h'],
      ['Motogodziny', '0,98 / 0,61', 'MH na h · w locie / na ziemi · obrotomierz'],
      ['Obserwacje', '42', 'operacje · 40 pomiarów, 38 ze śladem GPS · 3 odstające pominięte'],
      ['Ostatni miesiąc', '31,1', 'L/h · 9 pomiarów'],
    ]);
  });

  it('zero odstających nie dostaje członu, a jedna faza bez rozdziału nie dostaje wiersza', () => {
    const r = report();
    const view = consumptionCardView({
      ...r,
      fuel: { ...r.fuel, outliers: [] },
      norm: { ...r.norm!, airLPerH: null, groundLPerH: null },
    })!;
    const observations = view.rows.find((row) => row.label === 'Obserwacje')!;
    expect(observations.small).toBe('operacje · 40 pomiarów, 38 ze śladem GPS');
    expect(view.rows.map((row) => row.label)).not.toContain('W locie / na ziemi');
  });

  it('licznik nierozpoznany nie dopisuje rodzaju, godzinowy nazywa się słowami', () => {
    const r = report();
    const unknown = consumptionCardView({ ...r, norm: { ...r.norm!, mh: { ...r.norm!.mh!, kind: 'unknown' } } })!;
    expect(unknown.rows.find((row) => row.label === 'Motogodziny')!.small).toBe('MH na h · w locie / na ziemi');
    const hobbs = consumptionCardView({ ...r, norm: { ...r.norm!, mh: { ...r.norm!.mh!, kind: 'hobbs' } } })!;
    expect(hobbs.rows.find((row) => row.label === 'Motogodziny')!.small).toContain('licznik godzinowy');
  });
});
