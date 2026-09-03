/**
 * UZ Aero - test arytmetyki ekranu TANKOWANIE (mockup 06).
 *
 * Kalkulacja zużycia jest jedyną liczbą na tym ekranie, której pilot nie odczyta
 * z przyrządu - więc jedyną, której błędu nie ma jak zauważyć. Test odwzorowuje
 * kanoniczny dzień 22 JUNE z `docs/design-notes.md`, te same liczby, które pokazuje
 * mockup: odczyt startowy 150 L, cykl 08:12 → 10:34 (blok 2:22), stan przed
 * tankowaniem 112 L → 38 L zużycia → ~16 L/h.
 *
 * Zgodność z mockupem jest tu KONTRAKTEM: rozjazd tych liczb bez zmiany designu
 * (albo odwrotnie) jest błędem, nie poprawką.
 */

import {
  addedLitresText,
  engineTimeInWindow,
  estimateConsumption,
  estimateFob,
  expectedHandoverL,
  fuelEstimateTrail,
  fuelReferenceLabel,
  hoursMinutes,
  lastFuelReference,
  maxAddableL,
  refuelGauge,
  refuelScale,
} from '../ui/screens/logic/refuelMath';
import { projectSession, type ConsumptionNorm, type Event } from '../domain';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event<T extends Event['type']>(type: T, time: number, payload: unknown = {}): Event {
  seq += 1;
  return {
    uuid: `e-${seq}-${type}`,
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

const preflight = (time: number, fuelL: number, mh = 1234.5): Event =>
  event('preflight_confirm', time, {
    operation: 'skoki',
    reading: { fuelL, mh },
  });

/** Dzień z mockupu do chwili tankowania: preflight 150 L + jeden cykl 2:22. */
const canonicalDay: Event[] = [
  preflight(at(8, 0), 150),
  event('engine_start', at(8, 12)),
  event('engine_stop', at(10, 34)),
];

describe('punkt odniesienia paliwa', () => {
  it('bierze odczyt z preflightu, gdy nie było jeszcze tankowania', () => {
    expect(lastFuelReference(canonicalDay)).toEqual({
      at: at(8, 0),
      fuelL: 150,
      source: 'preflight',
    });
  });

  it('po tankowaniu odniesieniem jest stan PO dolaniu', () => {
    const ref = lastFuelReference([
      ...canonicalDay,
      event('refuel', at(10, 48), { beforeL: 112, addedL: 48, afterL: 160 }),
    ]);
    expect(ref).toEqual({ at: at(10, 48), fuelL: 160, source: 'refuel' });
  });

  it('wybiera odczyt najpóźniejszy CHRONOLOGICZNIE, nie ostatni zapisany', () => {
    // Wpis ręczny i korekta czasu wstawiają zdarzenia z cofniętym czasem - kolejność
    // wstawienia wskazałaby wtedy nieaktualny odczyt.
    const ref = lastFuelReference([
      event('refuel', at(10, 48), { beforeL: 112, addedL: 48, afterL: 160 }),
      preflight(at(8, 0), 150),
    ]);
    expect(ref?.source).toBe('refuel');
  });

  it('brak odczytu = null, a nie zero', () => {
    expect(lastFuelReference([event('engine_start', at(8, 12))])).toBeNull();
  });
});

describe('czas pracy silnika w oknie', () => {
  it('sumuje cykle od punktu odniesienia', () => {
    const state = projectSession(canonicalDay);
    expect(engineTimeInWindow(state, canonicalDay, at(8, 0), at(10, 48))).toBe(142 * 60_000); // 2:22
  });

  it('przycina cykl, który zaczął się przed oknem', () => {
    const state = projectSession(canonicalDay);
    // Okno od 09:34 łapie ostatnią godzinę cyklu 08:12–10:34.
    expect(engineTimeInWindow(state, canonicalDay, at(9, 34), at(10, 48))).toBe(60 * 60_000);
  });

  it('cykl otwarty liczy do „teraz”', () => {
    const events = [preflight(at(8, 0), 150), event('engine_start', at(8, 12))];
    expect(engineTimeInWindow(projectSession(events), events, at(8, 0), at(9, 12))).toBe(
      60 * 60_000,
    );
  });

  it('liczy ręczny off/on-block - wada naprawiona 2026-08-05', () => {
    // Dzień, w którym GPS zawiódł i wzlot trafił do rejestru wpisem ręcznym (ekran 08).
    // Przed poprawką mianownik pomijał te 90 minut, więc średnia L/h wychodziła zawyżona.
    const events = [
      preflight(at(8, 0), 150),
      event('manual_log_entry', at(11, 0), { offBlock: at(9, 0), onBlock: at(10, 30) }),
    ];
    expect(engineTimeInWindow(projectSession(events), events, at(8, 0), at(11, 0))).toBe(
      90 * 60_000,
    );
  });
});

describe('kalkulacja zużycia', () => {
  it('odtwarza liczby z mockupu 06 (150 → 112 L przez 2:22)', () => {
    const state = projectSession(canonicalDay);
    const estimate = estimateConsumption(canonicalDay, state, 112, at(10, 48));

    expect(estimate).not.toBeNull();
    expect(estimate!.usedL).toBe(38);
    expect(hoursMinutes(estimate!.engineMs)).toBe('2h 22 min');
    // Mockup: „~16 L/h".
    expect(Math.round(estimate!.lPerH)).toBe(16);
  });

  it('liczy od OSTATNIEGO tankowania, a nie od początku dnia', () => {
    const events: Event[] = [
      ...canonicalDay,
      event('refuel', at(10, 48), { beforeL: 112, addedL: 48, afterL: 160 }),
      event('engine_start', at(11, 15)),
      event('engine_stop', at(12, 28)), // blok 1:13
    ];
    const estimate = estimateConsumption(events, projectSession(events), 140, at(12, 40));

    expect(estimate!.reference.source).toBe('refuel');
    expect(estimate!.usedL).toBe(20); // 160 − 140
    expect(hoursMinutes(estimate!.engineMs)).toBe('1h 13 min');
  });

  it('bez pracy silnika nie ma czego dzielić - null, nie nieskończoność', () => {
    const events = [preflight(at(8, 0), 150)];
    expect(estimateConsumption(events, projectSession(events), 150, at(8, 30))).toBeNull();
  });

  it('wzrost paliwa nie daje ujemnego zużycia - null zamiast wymyślonej liczby', () => {
    // Ktoś zatankował poza aplikacją; domena zgłosi FUEL_MISMATCH, my nie zgadujemy.
    const state = projectSession(canonicalDay);
    expect(estimateConsumption(canonicalDay, state, 165, at(10, 48))).toBeNull();
  });

  it('brak odczytu odniesienia = brak kalkulacji', () => {
    const events = [event('engine_start', at(8, 12)), event('engine_stop', at(10, 34))];
    expect(estimateConsumption(events, projectSession(events), 112, at(10, 48))).toBeNull();
  });
});

describe('limity dolewki i podziałka', () => {
  it('maks. dolewka to droga do pełna (mockup: 330 − 112 = 218 L)', () => {
    expect(maxAddableL(112, 330)).toBe(218);
  });

  it('przepełniony zbiornik nie daje ujemnej dolewki', () => {
    expect(maxAddableL(340, 330)).toBe(0);
  });

  it('nieznana pojemność = brak limitu, nie zero (offline nie blokuje pracy)', () => {
    expect(maxAddableL(112, null)).toBeNull();
  });

  it('podziałka odwzorowuje `.slider-labels` z mockupu', () => {
    expect(refuelScale(218)).toEqual(['0 L', '55 L', '110 L', '165 L', '218 L']);
  });
});

/** Norma z serwera do testów szacunku - domyślnie sama stawka blokowa 16 L/h. */
function norm(overrides: Partial<ConsumptionNorm> = {}): ConsumptionNorm {
  return {
    windowDays: 90,
    blockLPerHLow: 15,
    blockLPerHHigh: 17,
    blockLPerH: 16,
    airLPerH: null,
    groundLPerH: null,
    litersPerFlight: null,
    fuelRatioLow: null,
    fuelRatioHigh: null,
    mh: null,
    intervals: 42,
    engineMs: 100 * 3_600_000,
    computedAt: DAY,
    ...overrides,
  };
}

describe('szacunek FOB z normy (podpowiedź na wejściu w 06)', () => {
  it('odtwarza mockup: 150 L − 16 L/h × 2:22 ≈ 112 L', () => {
    const est = estimateFob(canonicalDay, projectSession(canonicalDay), norm(), at(10, 48));
    expect(est).not.toBeNull();
    expect(est!.fobL).toBe(112);
    expect(est!.usedL).toBeCloseTo(16 * (142 / 60));
    expect(est!.reference.fuelL).toBe(150);
  });

  it('ze stawkami fazowymi liczy czas lotu osobno od ziemi', () => {
    // Lot 08:20–10:20 (2 h w powietrzu), reszta biegu (22 min) na ziemi.
    const events = [
      ...canonicalDay,
      event('takeoff', at(8, 20)),
      event('landing', at(10, 20)),
    ];
    const est = estimateFob(
      events,
      projectSession(events),
      norm({ airLPerH: 18, groundLPerH: 8 }),
      at(10, 48),
    );
    // 18 × 2 + 8 × (22/60) = 38,93 → 150 − 38,93 ≈ 111.
    expect(est!.usedL).toBeCloseTo(18 * 2 + 8 * (22 / 60));
    expect(est!.fobL).toBe(111);
  });

  it('bez normy nie zgaduje - null', () => {
    expect(estimateFob(canonicalDay, projectSession(canonicalDay), null, at(10, 48))).toBeNull();
  });

  it('silnik nie pracował od odczytu = null (odczyt JEST stanem bieżącym)', () => {
    const events = [preflight(at(8, 0), 150)];
    expect(estimateFob(events, projectSession(events), norm(), at(8, 30))).toBeNull();
  });

  it('szacunek nie schodzi poniżej zera', () => {
    const events = [
      preflight(at(8, 0), 10),
      event('engine_start', at(8, 12)),
      event('engine_stop', at(10, 34)),
    ];
    expect(estimateFob(events, projectSession(events), norm(), at(10, 48))!.fobL).toBe(0);
  });
});

describe('szlak szacunku (wspólny dla 06 i 09B)', () => {
  it('trzy ogniwa: odczyt → latano z normą → zielone „zostało"', () => {
    const est = estimateFob(canonicalDay, projectSession(canonicalDay), norm(), at(10, 48))!;
    const rows = fuelEstimateTrail(est, 90);

    expect(rows.map((r) => r.title)).toEqual([
      'Ostatni odczyt · preflight 08:00 UTC',
      'Latano · 2h 22 min',
      'Szacunkowo zostało ~112 L',
    ]);
    expect(rows[0]!.meta).toBe('w zbiorniku 150 L');
    expect(rows[1]!.meta).toBe('zużycie z normy ~38 L');
    expect(rows[2]!.tone).toBe('green');
  });

  it('podpis źródła odróżnia preflight od tankowania', () => {
    expect(fuelReferenceLabel({ at: at(8, 0), fuelL: 150, source: 'preflight' })).toBe(
      'preflight 08:00 UTC',
    );
    expect(fuelReferenceLabel({ at: at(10, 48), fuelL: 160, source: 'refuel' })).toBe(
      'tankowanie 10:48 UTC',
    );
  });
});

describe('oczekiwany stan przekazania (ogniwo na przejęciu, 02A)', () => {
  const claim = { kind: 'claim' as const, at: at(8, 0), pilotId: 'AKO', fuelDeltaL: null, fuelAfterL: 96, mhAfter: 1234.5, durationMs: null };
  const flight = { kind: 'flight' as const, at: at(9, 0), pilotId: 'AKO', fuelDeltaL: null, fuelAfterL: 62, mhAfter: 1236, durationMs: 90 * 60_000 };
  const refuel = { kind: 'refuel' as const, at: at(8, 30), pilotId: null, fuelDeltaL: 20, fuelAfterL: 116, mhAfter: null, durationMs: null };

  it('zastane + dolewki − norma × czas lotów', () => {
    // 96 + 20 − 16 L/h × 1,5 h = 92.
    expect(expectedHandoverL([claim, refuel, flight], norm())).toEqual({
      expectedL: 92,
      engineMs: 90 * 60_000,
    });
  });

  it('bez normy, bez zastanego i bez lotów - null, ekran milczy', () => {
    expect(expectedHandoverL([claim, flight], null)).toBeNull();
    expect(expectedHandoverL([{ ...claim, fuelAfterL: null }, flight], norm())).toBeNull();
    // Bez lotów oczekiwanie równałoby się przekazaniu - zdanie o niczym.
    expect(expectedHandoverL([claim, refuel], norm())).toBeNull();
  });

  it('nie schodzi poniżej zera', () => {
    expect(
      expectedHandoverL([{ ...claim, fuelAfterL: 10 }, flight], norm())!.expectedL,
    ).toBe(0);
  });
});

describe('miarka stanu po tankowaniu', () => {
  it('odwzorowuje liczby z mockupu: 112 zastane + 48,7 dolane na 330 L', () => {
    const g = refuelGauge(112, 48.7, 330);
    expect(g).not.toBeNull();
    expect(g!.baseRatio).toBeCloseTo(112 / 330);
    expect(g!.ratio).toBeCloseTo(160.7 / 330);
  });

  it('bez pojemności miarki nie ma - pasek bez mianownika nic nie mówi', () => {
    expect(refuelGauge(112, 48, null)).toBeNull();
  });

  it('przepełnienie przycina się do 1 - o limicie mówi ton, nie geometria', () => {
    const g = refuelGauge(300, 60, 330);
    expect(g!.ratio).toBe(1);
    expect(g!.baseRatio).toBeCloseTo(300 / 330);
  });
});

describe('format ilości dolanej', () => {
  it('miejsca po przecinku zostają, gdy pilot je wpisał (licznik dystrybutora)', () => {
    // Uwaga z urządzenia (2026-09-02): odczyt z licznika tankowania bywa
    // ułamkowy - zaokrąglenie okłamywałoby pilota o jego własnym wpisie.
    expect(addedLitresText(48.7)).toBe('48,7');
    expect(addedLitresText(48.72)).toBe('48,72');
  });

  it('wartość całkowita (przyciski ±) pisze się bez ogona „,00"', () => {
    expect(addedLitresText(48)).toBe('48');
    expect(addedLitresText(0)).toBe('0');
  });

  it('szum zmiennoprzecinkowy przycina się do setnych', () => {
    expect(addedLitresText(48.7 + 5)).toBe('53,7');
  });
});

describe('format czasu pracy silnika', () => {
  it('pełne godziny i minuty jak w mockupie', () => {
    expect(hoursMinutes(142 * 60_000)).toBe('2h 22 min');
  });

  it('poniżej godziny pomija człon godzinowy', () => {
    expect(hoursMinutes(18 * 60_000)).toBe('18 min');
  });
});
