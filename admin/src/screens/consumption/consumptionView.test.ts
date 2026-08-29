/**
 * UZ Aero - panel: treść ekranu analityki zużycia.
 *
 * Dwie własności konstytucji tego ekranu. Pierwsza jest wspólna z resztą panelu: liczby
 * są PRZEPISANE z odpowiedzi, nie liczone tutaj. Druga jest tylko tutaj - **stawka bez
 * niepewności nie ma prawa wyglądać jak pomiar**, więc każdy stan „nie wiem" (przypięcie
 * do zera, brak stopni swobody, bramka publikacji) musi mieć własne zdanie na ekranie.
 */

import { describe, expect, it } from 'vitest';

import { consumptionFixture } from '../../../test/fixtures/consumption';
import {
  consumptionTiles,
  counterLabel,
  degradationNote,
  gateView,
  intervalRows,
  mhRows,
  rateCards,
  ribbonSegments,
} from './consumptionView';

const tile = (key: string, report = consumptionFixture()) => {
  const found = consumptionTiles(report).find((t) => t.key === key);
  if (found == null) throw new Error(`brak kafla ${key}`);
  return found;
};

describe('kafle nagłówkowe', () => {
  it('przepisują liczby z odpowiedzi w kolejności mockupu', () => {
    expect(consumptionTiles(consumptionFixture()).map((t) => t.key)).toEqual([
      'flight-hour',
      'block-hour',
      'per-flight',
      'mh',
      'basis',
    ]);
    expect(tile('flight-hour')).toMatchObject({ value: '43.6', unit: ' L/h', tone: 'green' });
    expect(tile('block-hour').value).toBe('35.9');
    expect(tile('per-flight').value).toBe('≈23');
    expect(tile('mh').value).toBe('0.86');
  });

  it('kafel motogodzin tłumaczy, CO znaczy jego liczba', () => {
    expect(tile('mh').note).toContain('obrotomierzowy');

    const hobbs = consumptionFixture({
      mh: { ...consumptionFixture().mh, kind: 'hobbs' },
    });
    expect(tile('mh', hobbs).note).toContain('Hobbs');
  });

  it('brak liczby to kreska, nigdy zero', () => {
    const empty = consumptionFixture({
      headline: {
        litersPerFlightHour: null,
        litersPerBlockHour: null,
        litersPerFlight: null,
        mhPerBlockHour: null,
      },
    });

    expect(tile('flight-hour', empty).value).toBe('-');
    expect(tile('per-flight', empty).value).toBe('-');
    expect(tile('mh', empty).value).toBe('-');
  });
});

describe('karty stawek', () => {
  it('każda stawka niesie wartość i przedział', () => {
    const cards = rateCards(consumptionFixture());

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ phase: 'Ziemia · silnik', value: '11.9', uncertainty: '±1.6 · 95%' });
    expect(cards[1]).toMatchObject({ phase: 'W powietrzu', value: '44.2', tone: 'blue' });
  });

  it('stawka przypięta do zera dostaje granicę JEDNOSTRONNĄ, nie ±', () => {
    // Symetryczny przedział sięgałby poniżej zera, czyli poza dziedzinę - a to jest
    // dokładnie ta sytuacja, w której model mówi „nie odróżniam tej fazy od zera".
    const base = consumptionFixture();
    const pinned = consumptionFixture({
      fuel: {
        ...base.fuel,
        rates: [{ ...base.fuel.rates[0]!, lPerH: 0, ciHalfWidth: 3.4, pinned: true }],
      },
    });

    const card = rateCards(pinned)[0]!;
    expect(card.uncertainty).toBe('≤ 3.4 L/h · 95%');
    expect(card.muted).toBe(true);
  });

  it('brak stopni swobody mówi wprost, że przedziału nie ma', () => {
    const base = consumptionFixture();
    const exact = consumptionFixture({
      fuel: {
        ...base.fuel,
        rates: [{ ...base.fuel.rates[0]!, ciHalfWidth: null }],
      },
    });

    expect(rateCards(exact)[0]!.uncertainty).toContain('bez przedziału');
  });
});

describe('wstęga podziału czasu', () => {
  it('segmenty sumują się do stu procent i niosą gotową szerokość CSS', () => {
    const segments = ribbonSegments(consumptionFixture());
    const total = segments.reduce((sum, s) => sum + Number.parseFloat(s.width), 0);

    expect(segments).toHaveLength(2);
    expect(total).toBeCloseTo(100, 1);
    expect(segments[0]!.width).toMatch(/^\d+\.\d%$/);
    expect(segments[0]!.label).toContain('ZIEMIA');
  });

  it('model bez stawek nie rysuje wstęgi', () => {
    const base = consumptionFixture();
    const empty = consumptionFixture({ fuel: { ...base.fuel, rates: [] } });

    expect(ribbonSegments(empty)).toEqual([]);
  });
});

describe('bramka publikacji (A10b)', () => {
  it('poniżej progu tłumaczy, czego brakuje - nie „coś poszło nie tak"', () => {
    const base = consumptionFixture();
    const scarce = consumptionFixture({
      fuel: {
        ...base.fuel,
        published: false,
        rates: [],
        gate: {
          published: false,
          intervals: 2,
          engineMs: 2.53 * 3_600_000,
          missingIntervals: 3,
          missingEngineMs: 7.47 * 3_600_000,
        },
      },
    });

    const gate = gateView(scarce);
    expect(gate.published).toBe(false);
    expect(gate.message).toContain('od 5 interwałów');
    expect(gate.intervalsLabel).toBe('2 / 5');
    expect(gate.engineLabel).toBe('2:32 / 10 h');
    expect(gate.intervalsPercent).toBeCloseTo(40, 6);
  });

  it('mierniki nie przekraczają stu procent po osiągnięciu progu', () => {
    const gate = gateView(consumptionFixture());
    expect(gate.published).toBe(true);
    expect(gate.intervalsPercent).toBe(100);
    expect(gate.enginePercent).toBe(100);
  });
});

describe('zejście po drabinie faz', () => {
  it('brak śladu GPS jest wyjaśniony liczbą interwałów, nie samym komunikatem', () => {
    const note = degradationNote(consumptionFixture());
    expect(note).toContain('śladu GPS');
    expect(note).toContain('0 z 96');
  });

  it('zbyt podobne interwały mówią wprost, że podział byłby przypadkowy', () => {
    const base = consumptionFixture();
    const collinear = consumptionFixture({
      fuel: { ...base.fuel, degradedBecause: 'collinear' },
    });

    expect(degradationNote(collinear)).toContain('przypadkowy');
  });

  it('model na najbogatszym zestawie nie tłumaczy się z niczego', () => {
    const base = consumptionFixture();
    const full = consumptionFixture({
      fuel: { ...base.fuel, phaseSet: 'four', degradedBecause: 'none' },
    });

    expect(degradationNote(full)).toBeNull();
  });
});

describe('tabela interwałów', () => {
  it('wiersz niesie granice, zużycie i odczyty źródłowe', () => {
    const row = intervalRows(consumptionFixture())[0]!;

    expect(row.day).toBe('30 JUL');
    expect(row.span).toBe('preflight 09:58 → zdanie 11:31');
    expect(row.consumed).toBe('22 L');
    expect(row.reading).toBe('odczyt 96 → 74 L');
    expect(row.state).toBe('ok');
  });

  it('fazy pionowe bez śladu pokazują kreski, nie zera', () => {
    // Zero znaczyłoby „nie wznosił się ani sekundy" - a my po prostu nie wiemy.
    expect(intervalRows(consumptionFixture())[0]!.phases).toBe('0:14 / - / - / -');
  });

  it('interwał odstający i odrzucony mają różne stany i własne powody', () => {
    const base = consumptionFixture();
    const flagged = consumptionFixture({
      intervals: [
        { ...base.intervals[0]!, rejected: 'outlier' },
        { ...base.intervals[0]!, rejected: 'negative-consumption' },
      ],
    });

    const rows = intervalRows(flagged);
    expect(rows[0]).toMatchObject({ state: 'outlier', stateLabel: 'Odstaje' });
    expect(rows[0]!.stateNote).toContain('poza modelem');
    expect(rows[1]).toMatchObject({ state: 'rejected', stateLabel: 'Odrzucony' });
    expect(rows[1]!.stateNote).toContain('paliwa przybyło');
  });
});

describe('tabela motogodzin', () => {
  it('zestawia fakt z modelem i pokazuje resztę ze znakiem', () => {
    const row = mhRows(consumptionFixture())[0]!;

    expect(row.day).toBe('30 JUL');
    expect(row.actual).toBe('0.8');
    expect(row.modelled).toBe('0.86');
    expect(row.residual).toBe('−0.06');
  });

  it('typ licznika opisuje zdaniem, nie kodem', () => {
    expect(counterLabel('tach')).toBe('obrotomierzowy');
    expect(counterLabel('hobbs')).toBe('godzinowy (Hobbs)');
    expect(counterLabel('unknown')).toBe('nierozstrzygnięty');
  });
});
