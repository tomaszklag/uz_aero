/**
 * UZ Aero — testy INWARIANTÓW domenowych (`domain/rules`).
 *
 * Każda gwardia dostaje parę: przypadek DOZWOLONY i ODRZUCONY. To jest kontrakt
 * „stany, które nigdy nie powinny powstać" — paliwo rosnące bez tankowania, cofnięty
 * licznik MH, `engine_stop` w powietrzu, `takeoff` bez silnika, `landing` bez startu,
 * dwa claimy, zapis nie od PIC-a sesji.
 *
 * Testy są czyste: budują strumień zdarzeń, liczą projekcję i wołają `checkAppend`.
 * Zero bazy, zero zegara systemowego, zero React Native.
 */

import {
  CORRECTION_WINDOW_MS,
  UNKNOWN_LIMITS,
  checkAppend,
  correctionWindow,
  errorsOf,
  projectSession,
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

/** Konfiguracja SP-AXA z design-notes: Cessna 182, zbiorniki 330 L. */
const LIMITS: AircraftLimits = { capacityL: 330 };

/** 22 JUNE 2026, 08:00 UTC — początek kanonicznego dnia. */
const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);
const min = (m: number): number => T0 + m * 60_000;
const MH_START = 1234.5; // 1234:30

let seq = 0;

interface EvOptions {
  t?: number;
  picId?: string;
  sessionUuid?: string;
  aircraftId?: string;
  gpsTime?: number | null;
}

function ev<K extends EventType>(
  type: K,
  payload: EventPayloadMap[K],
  o: EvOptions = {},
): Event {
  const t = o.t ?? min(0);
  return {
    uuid: `e-${++seq}`,
    sessionUuid: o.sessionUuid ?? SESSION,
    aircraftId: o.aircraftId ?? AC,
    picId: o.picId ?? PIC,
    dualId: null,
    type,
    payload,
    deviceTime: t,
    gpsTime: o.gpsTime === undefined ? t : o.gpsTime,
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

// ── typowe stany dnia ────────────────────────────────────────────────────────

const claim = (): Event => ev('session_claim', { mode: 'free' }, { t: min(-5) });

const preflight = (): Event =>
  ev(
    'preflight_confirm',
    {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: 'EPKK',
      dutyStart: min(0),
      reading: { fuelL: 150, mh: MH_START },
      mhFormat: 'hhmm',
    },
    { t: min(0) },
  );

/** Po preflightcie, silnik wyłączony. */
const ground = (): Event[] => [claim(), preflight()];
/** Silnik pracuje (08:12). */
const running = (): Event[] => [...ground(), ev('engine_start', {}, { t: min(12) })];
/** W powietrzu (T/O 08:25). */
const inFlight = (): Event[] => [
  ...running(),
  ev('takeoff', { method: 'auto' }, { t: min(25) }),
];
/** Pełny cykl 08:12–10:34 z jednym lotem — block 2:22 = 2.3667 h. */
const afterCycle = (): Event[] => [
  ...inFlight(),
  ev('landing', { method: 'auto' }, { t: min(78) }),
  ev('engine_stop', {}, { t: min(154) }),
];

/** Skrót: sprawdź kandydata na tle strumienia. */
function check(stream: Event[], candidate: Event, limits = LIMITS): RuleViolation[] {
  return checkAppend(projectSession(stream), candidate, limits);
}

const codes = (v: RuleViolation[]): string[] => v.map((x) => x.code);
const hard = (v: RuleViolation[]): string[] => codes(errorsOf(v));
const soft = (v: RuleViolation[]): string[] => codes(warningsOf(v));

// ─────────────────────────────────────────────────────────────────────────────

describe('koperta sesji — tożsamość i single-writer', () => {
  it('pierwszym zdarzeniem musi być session_claim', () => {
    expect(hard(check([], ev('engine_start', {})))).toEqual(['SESSION_NOT_CLAIMED']);
    expect(check([], claim())).toEqual([]);
  });

  it('drugi claim tej samej sesji jest odrzucany', () => {
    expect(hard(check([claim()], ev('session_claim', { mode: 'free' }, { t: min(1) })))).toEqual([
      'SESSION_ALREADY_CLAIMED',
    ]);
  });

  it('zdarzenie z cudzej sesji / cudzego samolotu jest odrzucane', () => {
    expect(
      hard(check(ground(), ev('engine_start', {}, { t: min(12), sessionUuid: 'inna' }))),
    ).toContain('SESSION_MISMATCH');
    expect(
      hard(check(ground(), ev('engine_start', {}, { t: min(12), aircraftId: 'inny' }))),
    ).toContain('AIRCRAFT_MISMATCH');
  });

  it('single-writer: pisze tylko PIC, który otworzył sesję (§4.1 pkt 3)', () => {
    expect(hard(check(ground(), ev('engine_start', {}, { t: min(12), picId: 'inny-pilot' })))).toEqual(
      ['WRITER_MISMATCH'],
    );
    expect(check(ground(), ev('engine_start', {}, { t: min(12) }))).toEqual([]);
  });
});

describe('cykl silnika', () => {
  it('engine_start wymaga preflightu', () => {
    expect(hard(check([claim()], ev('engine_start', {}, { t: min(12) })))).toEqual([
      'PREFLIGHT_REQUIRED',
    ]);
    expect(check(ground(), ev('engine_start', {}, { t: min(12) }))).toEqual([]);
  });

  it('engine_start przy pracującym silniku jest odrzucany', () => {
    expect(hard(check(running(), ev('engine_start', {}, { t: min(20) })))).toEqual([
      'ENGINE_ALREADY_RUNNING',
    ]);
  });

  it('engine_stop tylko gdy silnik pracuje', () => {
    expect(hard(check(ground(), ev('engine_stop', {}, { t: min(20) })))).toEqual([
      'ENGINE_NOT_RUNNING',
    ]);
    expect(check(running(), ev('engine_stop', {}, { t: min(154) }))).toEqual([]);
  });

  it('engine_stop w powietrzu jest odrzucany', () => {
    expect(hard(check(inFlight(), ev('engine_stop', {}, { t: min(40) })))).toEqual([
      'ENGINE_STOP_IN_FLIGHT',
    ]);
  });

  it('drugi preflight tego samego dnia jest odrzucany', () => {
    expect(hard(check(ground(), preflight()))).toEqual(['PREFLIGHT_ALREADY_CONFIRMED']);
  });
});

describe('lot: takeoff / landing', () => {
  it('takeoff wymaga pracującego silnika', () => {
    expect(hard(check(ground(), ev('takeoff', { method: 'auto' }, { t: min(25) })))).toEqual([
      'ENGINE_NOT_RUNNING',
    ]);
    expect(check(running(), ev('takeoff', { method: 'auto' }, { t: min(25) }))).toEqual([]);
  });

  it('takeoff w trakcie lotu jest odrzucany', () => {
    expect(hard(check(inFlight(), ev('takeoff', { method: 'auto' }, { t: min(40) })))).toEqual([
      'ALREADY_IN_FLIGHT',
    ]);
  });

  it('landing tylko gdy trwa lot', () => {
    expect(hard(check(running(), ev('landing', { method: 'auto' }, { t: min(78) })))).toEqual([
      'NOT_IN_FLIGHT',
    ]);
    expect(check(inFlight(), ev('landing', { method: 'auto' }, { t: min(78) }))).toEqual([]);
  });
});

describe('kołowanie (taxi)', () => {
  /** Silnik pracuje, kołowanie rozpoczęte (08:14). */
  const taxiing = (): Event[] => [...running(), ev('taxi', { method: 'auto' }, { t: min(14) })];

  it('taxi wymaga pracującego silnika, w locie nie ma sensu', () => {
    expect(hard(check(ground(), ev('taxi', { method: 'auto' }, { t: min(13) })))).toEqual([
      'ENGINE_NOT_RUNNING',
    ]);
    expect(hard(check(inFlight(), ev('taxi', { method: 'auto' }, { t: min(40) })))).toEqual([
      'ALREADY_IN_FLIGHT',
    ]);
    expect(check(running(), ev('taxi', { method: 'auto' }, { t: min(14) }))).toEqual([]);
  });

  it('drugie taxi z rzędu jest odrzucane — kołowanie już trwa', () => {
    // Duplikat z odrodzonego detektora (remont ekranu, restart aplikacji) albo z dryfu
    // GPS — po otwartym kołowaniu legalny jest tylko start albo wyłączenie silnika.
    expect(hard(check(taxiing(), ev('taxi', { method: 'auto' }, { t: min(16) })))).toEqual([
      'ALREADY_TAXIING',
    ]);
    expect(hard(check(taxiing(), ev('taxi', { method: 'manual' }, { t: min(20) })))).toEqual([
      'ALREADY_TAXIING',
    ]);
  });

  it('po taxi wolno wystartować i wolno wyłączyć silnik', () => {
    expect(check(taxiing(), ev('takeoff', { method: 'auto' }, { t: min(25) }))).toEqual([]);
    expect(check(taxiing(), ev('engine_stop', {}, { t: min(30) }))).toEqual([]);
  });

  it('start zamyka kołowanie — po lądowaniu taxi zapada ponownie (zjazd z pasa)', () => {
    const afterLanding = [
      ...taxiing(),
      ev('takeoff', { method: 'auto' }, { t: min(25) }),
      ev('landing', { method: 'auto' }, { t: min(78) }),
    ];
    expect(check(afterLanding, ev('taxi', { method: 'auto' }, { t: min(79) }))).toEqual([]);
  });

  it('wyłączenie silnika zamyka kołowanie — nowy cykl zaczyna od czystego stanu', () => {
    const nextCycle = [
      ...taxiing(),
      ev('engine_stop', {}, { t: min(30) }),
      ev('engine_start', {}, { t: min(45) }),
    ];
    expect(check(nextCycle, ev('taxi', { method: 'auto' }, { t: min(46) }))).toEqual([]);
  });
});

describe('paliwo', () => {
  const refuel = (payload: EventPayloadMap['refuel'], t = min(168)): Event =>
    ev('refuel', payload, { t });

  it('poprawne tankowanie 112 +48 → 160 L przechodzi', () => {
    expect(check(afterCycle(), refuel({ beforeL: 112, addedL: 48, afterL: 160 }))).toEqual([]);
  });

  it('arytmetyka musi się zgadzać: after = before + added', () => {
    expect(hard(check(afterCycle(), refuel({ beforeL: 112, addedL: 48, afterL: 200 })))).toContain(
      'FUEL_ARITHMETIC',
    );
  });

  it('stan po tankowaniu nie może przekroczyć pojemności zbiorników', () => {
    expect(hard(check(afterCycle(), refuel({ beforeL: 300, addedL: 100, afterL: 400 })))).toContain(
      'FUEL_OVER_CAPACITY',
    );
  });

  it('bez znanej pojemności (offline, brak cache) reguła pojemności śpi', () => {
    expect(
      hard(
        check(afterCycle(), refuel({ beforeL: 300, addedL: 100, afterL: 400 }), UNKNOWN_LIMITS),
      ),
    ).toEqual([]);
  });

  it('tankowanie przy pracującym silniku jest odrzucane', () => {
    expect(hard(check(running(), refuel({ beforeL: 112, addedL: 48, afterL: 160 })))).toContain(
      'REFUEL_ENGINE_RUNNING',
    );
  });

  it('ujemna ilość dolana jest odrzucana', () => {
    expect(hard(check(afterCycle(), refuel({ beforeL: 112, addedL: -8, afterL: 104 })))).toContain(
      'FUEL_NEGATIVE',
    );
  });

  it('stan „przed" wyższy niż ostatni odczyt = miękka flaga, nie blokada', () => {
    const v = check(afterCycle(), refuel({ beforeL: 200, addedL: 20, afterL: 220 }));
    expect(hard(v)).toEqual([]);
    expect(soft(v)).toEqual(['FUEL_MISMATCH']);
  });

  it('spadek paliwa między odczytami jest normalny (spalanie) — zero uwag', () => {
    expect(soft(check(afterCycle(), refuel({ beforeL: 112, addedL: 48, afterL: 160 })))).toEqual([]);
  });

  it('odczyt startowy ponad pojemność jest odrzucany', () => {
    const bad = ev(
      'preflight_confirm',
      {
        operation: 'skoki',
        dutyStart: min(0),
        reading: { fuelL: 400, mh: MH_START },
      },
      { t: min(0) },
    );
    expect(hard(check([claim()], bad))).toEqual(['FUEL_OVER_CAPACITY']);
  });
});

describe('zamknięcie dnia', () => {
  /** Dzień po pełnym cyklu: block 2:22 = 2.3667 h → MH 1234.5 → 1236.8667. */
  const MH_END = MH_START + 142 / 60;

  const dayClose = (
    payload: Partial<EventPayloadMap['day_close']> = {},
    t = min(300),
  ): Event =>
    ev(
      'day_close',
      {
        finalReading: { fuelL: 112, mh: MH_END },
        dutyEnd: min(300),
        ...payload,
      },
      { t },
    );

  it('poprawne zamknięcie po cyklu przechodzi bez uwag', () => {
    expect(check(afterCycle(), dayClose())).toEqual([]);
  });

  it('zamknięcie przy pracującym silniku jest odrzucane', () => {
    expect(hard(check(running(), dayClose()))).toContain('ENGINE_RUNNING_AT_DAY_CLOSE');
  });

  it('drugie day_close jest odrzucane', () => {
    expect(hard(check([...afterCycle(), dayClose()], dayClose({}, min(320))))).toEqual([
      'DAY_ALREADY_CLOSED',
    ]);
  });

  it('cofnięty licznik MH to twardy błąd (MH_REGRESSION)', () => {
    const v = check(afterCycle(), dayClose({ finalReading: { fuelL: 112, mh: MH_START - 1 } }));
    expect(hard(v)).toContain('MH_REGRESSION');
  });

  it('rozjazd Δ MH vs block time to miękka flaga — zdarzenie zostaje', () => {
    const v = check(afterCycle(), dayClose({ finalReading: { fuelL: 112, mh: MH_START + 5 } }));
    expect(hard(v)).toEqual([]);
    expect(soft(v)).toEqual(['MH_DELTA_MISMATCH']);
  });

  it('paliwo nie może wzrosnąć bez tankowania (twardo)', () => {
    const v = check(afterCycle(), dayClose({ finalReading: { fuelL: 200, mh: MH_END } }));
    expect(hard(v)).toContain('FUEL_INCREASE_WITHOUT_REFUEL');
  });

  it('wzrost w granicach tolerancji paliwomierza przechodzi', () => {
    // Tolerancja SP-AXA: max(10 L, 5% z 330 L) = 16.5 L.
    const v = check(afterCycle(), dayClose({ finalReading: { fuelL: 160, mh: MH_END } }));
    expect(hard(v)).toEqual([]);
  });

  it('po tankowaniu wyższy odczyt końcowy jest w porządku', () => {
    const stream = [
      ...afterCycle(),
      ev('refuel', { beforeL: 112, addedL: 48, afterL: 160 }, { t: min(168) }),
    ];
    expect(hard(check(stream, dayClose({ finalReading: { fuelL: 160, mh: MH_END } })))).toEqual([]);
  });

  it('koniec służby przed meldunkiem jest odrzucany', () => {
    expect(hard(check(afterCycle(), dayClose({ dutyEnd: min(-60) })))).toContain(
      'DUTY_END_BEFORE_START',
    );
  });
});

describe('okno korekty po zamknięciu dnia (24 h)', () => {
  const closed = (): Event[] => [
    ...afterCycle(),
    ev(
      'day_close',
      { finalReading: { fuelL: 112, mh: MH_START + 142 / 60 }, dutyEnd: min(300) },
      { t: min(300) },
    ),
  ];

  it('zwykłe zdarzenia po zamknięciu są odrzucane', () => {
    expect(hard(check(closed(), ev('engine_start', {}, { t: min(310) })))).toEqual(['DAY_CLOSED']);
  });

  it('wpis ręczny w oknie 24 h przechodzi', () => {
    const entry = ev(
      'manual_log_entry',
      { offBlock: min(12), takeoff: min(25), landing: min(78), onBlock: min(154) },
      { t: min(400) },
    );
    expect(check(closed(), entry)).toEqual([]);
  });

  it('wpis ręczny po 24 h jest odrzucany (korekta u administratora)', () => {
    const late = ev(
      'manual_log_entry',
      { offBlock: min(12), onBlock: min(154) },
      { t: min(300) + CORRECTION_WINDOW_MS + 60_000 },
    );
    expect(hard(check(closed(), late))).toEqual(['CORRECTION_WINDOW_EXPIRED']);
  });

  it('correctionWindow liczy pozostały czas OD WZLOTU, nie od zdania samolotu', () => {
    // §3.6a: kotwicą jest wzlot. Cykl kończy się o min(154), samolot jest zdawany
    // o min(300) — okno biegnie od wcześniejszej z tych chwil, bo dotyczy danych lotu.
    const LEG_END = min(154);
    const state = projectSession(closed());

    const open = correctionWindow(state, LEG_END + 3_600_000);
    expect(open.hasClosedLeg).toBe(true);
    expect(open.open).toBe(true);
    expect(open.remainingMs).toBe(CORRECTION_WINDOW_MS - 3_600_000);
    expect(open.openLegCount).toBe(1);

    const expired = correctionWindow(state, LEG_END + CORRECTION_WINDOW_MS + 1);
    expect(expired.open).toBe(false);
    expect(expired.remainingMs).toBe(0);

    // Wzlot świeżo zamknięty: okno dopiero ruszyło, korekta oczywiście dozwolona.
    expect(correctionWindow(projectSession(afterCycle()), min(200)).open).toBe(true);
  });
});

describe('wpis ręczny (fallback GPS, §3.8)', () => {
  it('jest furtką na przegapione zdarzenia — nie podlega gwardii silnika', () => {
    const entry = ev(
      'manual_log_entry',
      { offBlock: min(12), takeoff: min(25), landing: min(78), onBlock: min(154) },
      { t: min(160) },
    );
    expect(check(ground(), entry)).toEqual([]);
  });

  it('pusty wpis jest odrzucany', () => {
    expect(hard(check(ground(), ev('manual_log_entry', { notes: 'nic' }, { t: min(160) })))).toEqual(
      ['MANUAL_ENTRY_EMPTY'],
    );
  });

  it('czasy w złej kolejności są odrzucane', () => {
    const entry = ev(
      'manual_log_entry',
      { takeoff: min(78), landing: min(25) },
      { t: min(160) },
    );
    expect(hard(check(ground(), entry))).toEqual(['MANUAL_ENTRY_TIME_ORDER']);
  });
});

describe('zrzuty', () => {
  const drop = (
    payload: Partial<EventPayloadMap['drop']> = {},
    t = min(40),
  ): Event =>
    ev(
      'drop',
      { dropNumber: 1, altitudeFt: 2450, jumpers: { tandem: 2, aff: 1, solo: 1 }, ...payload },
      { t },
    );

  it('zrzut w locie przy operacji skoki przechodzi', () => {
    expect(check(inFlight(), drop())).toEqual([]);
  });

  it('zrzut bez skoczków jest odrzucany', () => {
    expect(hard(check(inFlight(), drop({ jumpers: { tandem: 0, aff: 0, solo: 0 } })))).toEqual([
      'DROP_NO_JUMPERS',
    ]);
  });

  it('zrzut poza lotem to miękka flaga — dane przychodowe zostają zapisane', () => {
    const v = check(running(), drop({}, min(20)));
    expect(hard(v)).toEqual([]);
    expect(soft(v)).toEqual(['DROP_ON_GROUND']);
  });

  it('zrzut przy operacji innej niż skoki to miękka flaga', () => {
    const ferry = [
      claim(),
      ev(
        'preflight_confirm',
        { operation: 'ferry', dutyStart: min(0), reading: { fuelL: 150, mh: MH_START } },
        { t: min(0) },
      ),
      ev('engine_start', {}, { t: min(12) }),
      ev('takeoff', { method: 'auto' }, { t: min(25) }),
    ];
    const v = check(ferry, drop());
    expect(hard(v)).toEqual([]);
    expect(soft(v)).toEqual(['DROP_OUTSIDE_JUMP_OPERATION']);
  });
});

describe('załoga', () => {
  it('zmiana Duala przechodzi', () => {
    const change = ev(
      'crew_change',
      { role: 'dual', pilotOutId: null, pilotInId: 'pic-2' },
      { t: min(160) },
    );
    expect(check(ground(), change)).toEqual([]);
  });

  it('zmiana PIC w ramach sesji jest odrzucana (single-writer, §3.5)', () => {
    const change = ev(
      'crew_change',
      { role: 'pic', pilotOutId: PIC, pilotInId: 'pic-2' },
      { t: min(160) },
    );
    expect(hard(check(ground(), change))).toEqual(['PIC_CHANGE_NOT_ALLOWED']);
  });

  it('Dual nie może być tą samą osobą co PIC', () => {
    const change = ev(
      'crew_change',
      { role: 'dual', pilotOutId: null, pilotInId: PIC },
      { t: min(160) },
    );
    expect(hard(check(ground(), change))).toEqual(['DUAL_IS_PIC']);
  });
});

describe('zegary', () => {
  it('rozjazd device↔GPS ponad 120 s to miękka flaga', () => {
    const drifted = ev('engine_start', {}, { t: min(12), gpsTime: min(12) - 300_000 });
    const v = check(ground(), drifted);
    expect(hard(v)).toEqual([]);
    expect(soft(v)).toEqual(['CLOCK_DRIFT']);
  });

  it('brak fixa GPS nie generuje flagi driftu', () => {
    expect(check(ground(), ev('engine_start', {}, { t: min(12), gpsTime: null }))).toEqual([]);
  });
});
