/**
 * Ninerdeck - testy DOPISANIA FAKTU PO CZASIE (`rules/insertion.ts`, panel 3.2.0 §5.4).
 *
 * `checkAppend` pyta o stan KOŃCOWY, `checkInsert` o stan Z CHWILI FAKTU. Każdy
 * przypadek niżej to para: to samo zdarzenie, które `checkAppend` odbija (samolot
 * zdany, silnik już nie pracuje), `checkInsert` wpuszcza - albo odwrotnie: fakt,
 * który w swojej chwili nie miał prawa zajść, odbija się mimo „luźniejszego" pytania.
 * Testy czyste: strumień, projekcja, reguła. Zero bazy, zero zegara systemowego.
 */

import {
  CORRECTION_WINDOW_MS,
  checkAppend,
  checkInsert,
  errorsOf,
  projectSession,
  stateAsOf,
  warningsOf,
  type AircraftLimits,
  type Event,
  type EventPayloadMap,
  type EventType,
  type RuleViolation,
} from '../domain';

const SESSION = 'sess-1';
const AC = 'ac-1';
const PIC = 'pic-1';
const LIMITS: AircraftLimits = { capacityL: 330, oilMinL: 8.5, oilCapacityL: 11.4 };

/** 22 JUNE 2026, 08:00 UTC. */
const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);
const min = (m: number): number => T0 + m * 60_000;
const MH_START = 1234.5;

let seq = 0;

function ev<K extends EventType>(type: K, payload: EventPayloadMap[K], t: number): Event {
  return {
    uuid: `e-${++seq}`,
    sessionUuid: SESSION,
    aircraftId: AC,
    picId: PIC,
    dualId: null,
    type,
    payload,
    deviceTime: t,
    gpsTime: t,
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

/**
 * Dzień z LOTEM BEZ LĄDOWANIA: GPS zgubił przyziemienie, silnik stanął, samolot zdany.
 * Dokładnie scenariusz makiety `dziennik-dopisanie` - najczęstszy powód dopisania.
 */
function dayWithoutLanding(): Event[] {
  return [
    ev('session_claim', { mode: 'free' }, min(-5)),
    ev(
      'preflight_confirm',
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: 'EPKK',
        reading: { fuelL: 150, mh: MH_START },
        mhFormat: 'hhmm',
      },
      min(0),
    ),
    ev('engine_start', {}, min(12)),
    ev('takeoff', { method: 'auto' }, min(25)),
    ev('engine_stop', {}, min(154)),
    ev('day_close', { finalReading: { fuelL: 100, mh: MH_START + 2.3 } }, min(170)),
  ];
}

const codes = (v: RuleViolation[]): string[] => v.map((x) => x.code);
const hard = (v: RuleViolation[]): string[] => codes(errorsOf(v));
const soft = (v: RuleViolation[]): string[] => codes(warningsOf(v));

/** Chwila wpisania: dwa dni po zdaniu - okno pilota dawno minęło. */
const LATER = min(170) + 2 * 24 * 60 * 60_000;

describe('stan z chwili faktu (stateAsOf)', () => {
  it('przycina strumień do zdarzeń nie późniejszych niż zadana chwila', () => {
    const asOf = stateAsOf(dayWithoutLanding(), min(60));
    expect(asOf.engineRunning).toBe(true);
    expect(asOf.inFlight).toBe(true);
    expect(asOf.closed).toBe(false);

    const final = projectSession(dayWithoutLanding());
    expect(final.closed).toBe(true);
    expect(final.engineRunning).toBe(false);
  });

  it('nakłada korekty PRZED przycięciem - unieważniony start nie istnieje w żadnej chwili', () => {
    const stream = dayWithoutLanding();
    const takeoff = stream[3]!;
    stream.push(
      ev('event_correction', { targetUuid: takeoff.uuid, action: 'void' }, min(200)),
    );
    expect(stateAsOf(stream, min(60)).inFlight).toBe(false);
  });
});

describe('dopisanie po czasie (checkInsert) kontra dopisanie teraz (checkAppend)', () => {
  it('brakujące lądowanie w środku biegu: checkAppend odbija, checkInsert wpuszcza', () => {
    const stream = dayWithoutLanding();
    const landing = ev('landing', { method: 'manual' }, min(78));

    expect(hard(checkAppend(projectSession(stream), landing, LIMITS))).toEqual(['DAY_CLOSED']);

    const verdict = checkInsert(stream, landing, LATER, LIMITS, 'administrative');
    expect(hard(verdict)).toEqual([]);
    // Zdany samolot po oknie pilota: administrator nie dostaje żadnej kolizji.
    expect(soft(verdict)).toEqual([]);
  });

  it('lądowanie bez otwartego lotu w swojej chwili odbija się tak samo, jak w kokpicie', () => {
    const stream = dayWithoutLanding();
    // Przed startem (min 25) nikt nie był w powietrzu.
    const landing = ev('landing', { method: 'manual' }, min(20));
    expect(hard(checkInsert(stream, landing, LATER, LIMITS, 'administrative'))).toEqual([
      'NOT_IN_FLIGHT',
    ]);
  });

  it('fakt z czasem PO zdaniu samolotu należy do następnej operacji - DAY_CLOSED', () => {
    const stream = dayWithoutLanding();
    const refuel = ev('refuel', { beforeL: 100, addedL: 50, afterL: 150 }, min(180));
    expect(hard(checkInsert(stream, refuel, LATER, LIMITS, 'administrative'))).toEqual([
      'DAY_CLOSED',
    ]);
  });

  it('tankowanie w środku biegu silnika odbija się w swojej chwili', () => {
    const stream = dayWithoutLanding();
    const refuel = ev('refuel', { beforeL: 100, addedL: 50, afterL: 150 }, min(60));
    expect(hard(checkInsert(stream, refuel, LATER, LIMITS, 'administrative'))).toEqual([
      'REFUEL_ENGINE_RUNNING',
    ]);
    // Po wyłączeniu silnika, przed zdaniem - wolno.
    const later = ev('refuel', { beforeL: 100, addedL: 50, afterL: 150 }, min(160));
    expect(hard(checkInsert(stream, later, LATER, LIMITS, 'administrative'))).toEqual([]);
  });

  it('zrzut poza lotem jest ostrzeżeniem także po czasie - fakt z terenu zostaje', () => {
    const stream = dayWithoutLanding();
    // Silnik już pracuje (min 12), ale start dopiero o min 25 - zrzut na ziemi.
    const drop = ev(
      'drop',
      { dropNumber: 1, altitudeFt: null, jumpers: null, client: null, position: null },
      min(20),
    );
    const verdict = checkInsert(stream, drop, LATER, LIMITS, 'administrative');
    expect(hard(verdict)).toEqual([]);
    expect(soft(verdict)).toContain('DROP_ON_GROUND');
  });

  it('fakt sprzed przejęcia nie ma operacji, do której mógłby należeć', () => {
    const stream = dayWithoutLanding();
    const refuel = ev('refuel', { beforeL: 100, addedL: 50, afterL: 150 }, min(-30));
    expect(hard(checkInsert(stream, refuel, LATER, LIMITS, 'administrative'))).toEqual([
      'SESSION_NOT_CLAIMED',
    ]);
  });
});

describe('okno korekty liczy się na stanie KOŃCOWYM i chwili WPISANIA', () => {
  it('pilot dopisuje w oknie 24 h od zdania, po oknie - odmowa jak przy korekcie', () => {
    const stream = dayWithoutLanding();
    const landing = ev('landing', { method: 'manual' }, min(78));

    const inWindow = min(170) + CORRECTION_WINDOW_MS - 60_000;
    expect(hard(checkInsert(stream, landing, inWindow, LIMITS))).toEqual([]);

    const afterWindow = min(170) + CORRECTION_WINDOW_MS + 60_000;
    expect(hard(checkInsert(stream, landing, afterWindow, LIMITS))).toEqual([
      'CORRECTION_WINDOW_EXPIRED',
    ]);
  });

  it('administrator w oknie pilota dostaje kolizję jako OSTRZEŻENIE, nie odmowę', () => {
    const stream = dayWithoutLanding();
    const landing = ev('landing', { method: 'manual' }, min(78));
    const inWindow = min(170) + 60_000;
    const verdict = checkInsert(stream, landing, inWindow, LIMITS, 'administrative');
    expect(hard(verdict)).toEqual([]);
    expect(soft(verdict)).toEqual(['ADMIN_EDIT_PILOT_WINDOW_OPEN']);
  });

  it('operacja W TOKU: administrator dostaje kolizję z pilotem, pilot - nic', () => {
    const stream = dayWithoutLanding().slice(0, 5); // bez zdania
    const landing = ev('landing', { method: 'manual' }, min(78));
    expect(soft(checkInsert(stream, landing, min(200), LIMITS, 'administrative'))).toEqual([
      'ADMIN_EDIT_SESSION_ACTIVE',
    ]);
    expect(checkInsert(stream, landing, min(200), LIMITS)).toEqual([]);
  });

  it('pominięte uprawnienie znaczy pilota - dopisanie nigdy nie poszerza się samo', () => {
    const stream = dayWithoutLanding();
    const landing = ev('landing', { method: 'manual' }, min(78));
    expect(hard(checkInsert(stream, landing, LATER, LIMITS))).toEqual(['CORRECTION_WINDOW_EXPIRED']);
  });
});
