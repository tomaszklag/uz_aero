/**
 * UZ Aero - test metryk zbiorczych zużycia.
 *
 * Najważniejsza rzecz, której ten plik pilnuje, mieści się w jednym zdaniu: średnią okna
 * liczymy jako iloraz sum, a nie jako średnią z dziennych L/h. Różnica bywa kilkukrotna
 * i nie widać jej po wyniku - dlatego pierwszy test stawia przypadek, w którym obie
 * metody rozjeżdżają się drastycznie.
 */

import { consumptionSummary, type FuelInterval } from '../domain';

const DAY = Date.UTC(2026, 4, 10); // 10 MAJ 2026
const HOUR = 3_600_000;

/** Interwał o zadanym zużyciu i czasie pracy silnika; reszta pól rozsądnie domyślna. */
function interval(over: Partial<FuelInterval> = {}): FuelInterval {
  const engineMs = over.engineMs ?? 2 * HOUR;
  return {
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    dayStart: DAY,
    startAt: DAY,
    endAt: DAY + engineMs,
    startKind: 'preflight',
    endKind: 'day_close',
    startUuid: 'u-start',
    endUuid: 'u-end',
    startReadingL: 150,
    endReadingL: 120,
    consumedL: 30,
    engineMs,
    flightMs: engineMs,
    groundMs: 0,
    climbMs: null,
    cruiseMs: null,
    descentMs: null,
    flightCount: 1,
    rejected: null,
    ...over,
  };
}

describe('średnia okna', () => {
  it('to iloraz sum, nie średnia ilorazów', () => {
    // Odcinek krótki i „drogi" (1 L na 0,1 h = 10 L/h) obok długiego i taniego
    // (100 L na 50 h = 2 L/h). Średnia ilorazów dałaby 6 L/h i byłaby zdominowana
    // przez odcinek, w którym błąd odczytu paliwomierza jest całym sygnałem.
    const summary = consumptionSummary([
      interval({ consumedL: 1, engineMs: 0.1 * HOUR, flightMs: 0.1 * HOUR }),
      interval({ consumedL: 100, engineMs: 50 * HOUR, flightMs: 50 * HOUR }),
    ]);

    expect(summary.litersPerBlockHour).toBeCloseTo(101 / 50.1, 9);
    expect(summary.litersPerBlockHour).not.toBeCloseTo((10 + 2) / 2, 3);
  });

  it('nie dzieli przez zero - brak pracy silnika to null, nie nieskończoność', () => {
    const summary = consumptionSummary([
      interval({ consumedL: 5, engineMs: 0, flightMs: 0, rejected: 'no-engine' }),
    ]);

    expect(summary.litersPerBlockHour).toBeNull();
    expect(summary.intervals).toBe(0);
  });

  it('liczy osobno na godzinę lotu i na godzinę pracy silnika', () => {
    const summary = consumptionSummary([
      interval({ consumedL: 60, engineMs: 4 * HOUR, flightMs: 3 * HOUR }),
    ]);

    expect(summary.litersPerBlockHour).toBeCloseTo(15, 9);
    expect(summary.litersPerFlightHour).toBeCloseTo(20, 9);
  });

  it('paliwo na wzlot dzieli przez sumę lotów', () => {
    const summary = consumptionSummary([
      interval({ consumedL: 60, flightCount: 3 }),
      interval({ consumedL: 40, flightCount: 2 }),
    ]);

    expect(summary.litersPerFlight).toBeCloseTo(20, 9);
  });
});

describe('interwały odrzucone nie wchodzą do żadnej sumy', () => {
  it('pomija ujemne zużycie', () => {
    const summary = consumptionSummary([
      interval({ consumedL: 30, engineMs: 2 * HOUR }),
      interval({ consumedL: -20, engineMs: 2 * HOUR, rejected: 'negative-consumption' }),
    ]);

    expect(summary.intervals).toBe(1);
    expect(summary.litersTotal).toBe(30);
  });

  it('pusta lista daje puste podsumowanie, nie zera udające pomiar', () => {
    const summary = consumptionSummary([]);

    expect(summary.litersPerBlockHour).toBeNull();
    expect(summary.blockLPerHP10).toBeNull();
    expect(summary.months).toEqual([]);
    expect(summary.firstDay).toBeNull();
  });
});

describe('pasmo rozrzutu - norma dla aplikacji', () => {
  it('obejmuje typowe stawki i odcina skrajne', () => {
    // Dziewięć interwałów po 2 h: stawki 10…18 L/h. Pasmo 10–90% ma zostawić skraje poza.
    const rates = [10, 11, 12, 13, 14, 15, 16, 17, 18];
    const summary = consumptionSummary(
      rates.map((rate) => interval({ consumedL: rate * 2, engineMs: 2 * HOUR })),
    );

    expect(summary.blockLPerHP10!).toBeGreaterThan(10);
    expect(summary.blockLPerHP90!).toBeLessThan(18);
    expect(summary.blockLPerHP10!).toBeLessThan(summary.blockLPerHP90!);
  });

  it('przy jednym interwale pasmo jest punktem - i taka jest prawda o tych danych', () => {
    const summary = consumptionSummary([interval({ consumedL: 30, engineMs: 2 * HOUR })]);

    expect(summary.blockLPerHP10).toBeCloseTo(15, 9);
    expect(summary.blockLPerHP90).toBeCloseTo(15, 9);
  });
});

describe('trend miesięczny', () => {
  it('grupuje po miesiącach UTC i porządkuje rosnąco', () => {
    const may = DAY;
    const june = Date.UTC(2026, 5, 3);

    const summary = consumptionSummary([
      interval({ dayStart: june, consumedL: 40, engineMs: 2 * HOUR }),
      interval({ dayStart: may, consumedL: 30, engineMs: 2 * HOUR }),
      interval({ dayStart: may, consumedL: 30, engineMs: 2 * HOUR }),
    ]);

    expect(summary.months.map((m) => m.month)).toEqual(['2026-05', '2026-06']);
    expect(summary.months[0]!.intervals).toBe(2);
    expect(summary.months[0]!.litersPerBlockHour).toBeCloseTo(15, 9);
    expect(summary.months[1]!.litersPerBlockHour).toBeCloseTo(20, 9);
  });

  it('zna zakres dni, z których liczył', () => {
    const summary = consumptionSummary([
      interval({ dayStart: Date.UTC(2026, 5, 3) }),
      interval({ dayStart: DAY }),
    ]);

    expect(summary.firstDay).toBe(DAY);
    expect(summary.lastDay).toBe(Date.UTC(2026, 5, 3));
  });
});
