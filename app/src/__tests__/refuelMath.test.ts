/**
 * UZ Aero — test arytmetyki ekranu TANKOWANIE (mockup 06).
 *
 * Kalkulacja zużycia jest jedyną liczbą na tym ekranie, której pilot nie odczyta
 * z przyrządu — więc jedyną, której błędu nie ma jak zauważyć. Test odwzorowuje
 * kanoniczny dzień 22 JUNE z `docs/design-notes.md`, te same liczby, które pokazuje
 * mockup: odczyt startowy 150 L, cykl 08:12 → 10:34 (blok 2:22), stan przed
 * tankowaniem 112 L → 38 L zużycia → ~16 L/h.
 *
 * Zgodność z mockupem jest tu KONTRAKTEM: rozjazd tych liczb bez zmiany designu
 * (albo odwrotnie) jest błędem, nie poprawką.
 */

import {
  engineTimeInWindow,
  estimateConsumption,
  hoursMinutes,
  lastFuelReference,
  maxAddableL,
  refuelScale,
} from '../ui/screens/refuelMath';
import { projectSession, type Event } from '../domain';

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
    dutyStart: time,
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
    // Wpis ręczny i korekta czasu wstawiają zdarzenia z cofniętym czasem — kolejność
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
    expect(engineTimeInWindow(state, at(8, 0), at(10, 48))).toBe(142 * 60_000); // 2:22
  });

  it('przycina cykl, który zaczął się przed oknem', () => {
    const state = projectSession(canonicalDay);
    // Okno od 09:34 łapie ostatnią godzinę cyklu 08:12–10:34.
    expect(engineTimeInWindow(state, at(9, 34), at(10, 48))).toBe(60 * 60_000);
  });

  it('cykl otwarty liczy do „teraz”', () => {
    const state = projectSession([preflight(at(8, 0), 150), event('engine_start', at(8, 12))]);
    expect(engineTimeInWindow(state, at(8, 0), at(9, 12))).toBe(60 * 60_000);
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

  it('bez pracy silnika nie ma czego dzielić — null, nie nieskończoność', () => {
    const events = [preflight(at(8, 0), 150)];
    expect(estimateConsumption(events, projectSession(events), 150, at(8, 30))).toBeNull();
  });

  it('wzrost paliwa nie daje ujemnego zużycia — null zamiast wymyślonej liczby', () => {
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

describe('format czasu pracy silnika', () => {
  it('pełne godziny i minuty jak w mockupie', () => {
    expect(hoursMinutes(142 * 60_000)).toBe('2h 22 min');
  });

  it('poniżej godziny pomija człon godzinowy', () => {
    expect(hoursMinutes(18 * 60_000)).toBe('18 min');
  });
});
