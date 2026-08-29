/**
 * UZ Aero - testy INWARIANTÓW domenowych (`domain/rules`).
 *
 * Każda gwardia dostaje parę: przypadek DOZWOLONY i ODRZUCONY. To jest kontrakt
 * „stany, które nigdy nie powinny powstać" - paliwo rosnące bez tankowania, cofnięty
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

/** Konfiguracja SP-AXA z design-notes: Cessna 182, zbiorniki 330 L; olej min 8,5 / zbiornik 11,4 L (issue #60). */
const LIMITS: AircraftLimits = { capacityL: 330, oilMinL: 8.5, oilCapacityL: 11.4 };

/** 22 JUNE 2026, 08:00 UTC - początek kanonicznego dnia. */
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
/** Pełny cykl 08:12–10:34 z jednym lotem - block 2:22 = 2.3667 h. */
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

describe('koperta sesji - tożsamość i single-writer', () => {
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

  it('drugi bieg silnika w sesji jest odrzucany - sesja = jeden bieg (2026-08-10)', () => {
    // Po STOP ENGINE jedyną drogą naprzód jest zdanie samolotu (09b); kolejny lot
    // to NOWE przejęcie. Bez tej gwardii stary model („kolejne wzloty w sesji")
    // wracałby tylnymi drzwiami przez każdy zapis ręczny albo replay.
    expect(hard(check(afterCycle(), ev('engine_start', {}, { t: min(170) })))).toEqual([
      'SESSION_ALREADY_RAN',
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

  it('drugie taxi z rzędu jest odrzucane - kołowanie już trwa', () => {
    // Duplikat z odrodzonego detektora (remont ekranu, restart aplikacji) albo z dryfu
    // GPS - po otwartym kołowaniu legalny jest tylko start albo wyłączenie silnika.
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

  it('start zamyka kołowanie - po lądowaniu taxi zapada ponownie (zjazd z pasa)', () => {
    const afterLanding = [
      ...taxiing(),
      ev('takeoff', { method: 'auto' }, { t: min(25) }),
      ev('landing', { method: 'auto' }, { t: min(78) }),
    ];
    expect(check(afterLanding, ev('taxi', { method: 'auto' }, { t: min(79) }))).toEqual([]);
  });

  it('wyłączenie silnika zamyka kołowanie - nowy cykl zaczyna od czystego stanu', () => {
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

  it('spadek paliwa między odczytami jest normalny (spalanie) - zero uwag', () => {
    expect(soft(check(afterCycle(), refuel({ beforeL: 112, addedL: 48, afterL: 160 })))).toEqual([]);
  });

  it('odczyt startowy ponad pojemność jest odrzucany', () => {
    const bad = ev(
      'preflight_confirm',
      {
        operation: 'skoki',
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

  // Test „odczyt końcowy porównuje się z OSTATNIM wskazaniem" usunięty 2026-08-10:
  // pośrednie odczyty per wzlot znikły razem z `leg_close`, więc jedynym punktem
  // odniesienia wewnątrz sesji jest stan przy przejęciu - a to pokrywa test wyżej.

  it('rozjazd Δ MH vs block time to miękka flaga - zdarzenie zostaje', () => {
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

  it('zdanie bez ani jednego wzlotu i bez powodu daje MIĘKKĄ flagę (09C)', () => {
    // Zdarzenie ZOSTAJE: odrzucenie skasowałoby jedyny ślad po tym, że maszyna stała
    // zajęta. Administrator dostaje flagę zamiast pytania bez adresata.
    const noFlight = [claim(), preflight()];
    const close = ev(
      'day_close',
      { finalReading: { fuelL: 150, mh: MH_START } },
      { t: min(75) },
    );

    expect(hard(check(noFlight, close))).toEqual([]);
    expect(soft(check(noFlight, close))).toContain('NO_FLIGHT_WITHOUT_REASON');
  });

  it('z podanym powodem flagi nie ma', () => {
    const close = ev(
      'day_close',
      { finalReading: { fuelL: 150, mh: MH_START }, noFlightReason: 'weather' },
      { t: min(75) },
    );

    expect(check([claim(), preflight()], close)).toEqual([]);
  });

  it('sesja ZE WZLOTAMI nie jest o powód pytana', () => {
    expect(soft(check(afterCycle(), dayClose()))).not.toContain('NO_FLIGHT_WITHOUT_REASON');
  });

  // Test `DUTY_END_BEFORE_START` żył tu do 2026-08-11 - reguła usunięta razem
  // z klamrą służby (issue #23): payload nie niesie już godzin do porównania.
});

// Blok „potwierdzenie wzlotu (leg_close)" usunięty 2026-08-10 razem ze zdarzeniem
// i regułami LEG_CLOSE_* - sesję zatwierdza `day_close` (odczyty obowiązkowe), czego
// pilnują testy „zamknięcie dnia" wyżej i gwardia SESSION_ALREADY_RAN w „cyklu silnika".

describe('preflightAt jest znacznikiem preflightu (nie dawna godzina meldunku)', () => {
  /**
   * Godzina meldunku (`dutyStart`) była opcjonalna od §3.6a, a 2026-08-11 znikła
   * z payloadu w ogóle (issue #23). Ten blok pilnuje, żeby reguły pytały o
   * `preflightAt` - historycznie DWA RAZY pytały o meldunek i pilot, który zrobił
   * wszystko dobrze, nie mógł uruchomić silnika (B5) albo przechodził drugi
   * preflight nadpisujący początek łańcucha MH.
   */
  const preflightNoDuty = (): Event =>
    ev(
      'preflight_confirm',
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: 'EPKK',
        reading: { fuelL: 150, mh: MH_START },
        mhFormat: 'hhmm',
      },
      { t: min(0) },
    );

  const groundNoDuty = (): Event[] => [claim(), preflightNoDuty()];

  it('silnik wolno uruchomić - preflight był, choć meldunku nie zadeklarowano', () => {
    expect(hard(check(groundNoDuty(), ev('engine_start', {}, { t: min(12) })))).toEqual([]);
  });

  it('samolot wolno zdać bez deklaracji meldunku', () => {
    const stream = [
      ...groundNoDuty(),
      ev('engine_start', {}, { t: min(12) }),
      ev('engine_stop', {}, { t: min(154) }),
    ];
    const close = ev(
      'day_close',
      { finalReading: { fuelL: 112, mh: MH_START + 142 / 60 } },
      { t: min(300) },
    );

    expect(hard(check(stream, close))).toEqual([]);
  });

  it('bez preflightu silnik nadal jest zablokowany - regułę przesuwamy, nie kasujemy', () => {
    expect(hard(check([claim()], ev('engine_start', {}, { t: min(12) })))).toEqual([
      'PREFLIGHT_REQUIRED',
    ]);
  });

  /**
   * ÓSME WYSTĄPIENIE wzorca „pole opcjonalne jako znacznik, że zdarzenie zaszło".
   *
   * `PREFLIGHT_ALREADY_CONFIRMED` pytało o `state.dutyStart` (godzinę meldunku) -
   * dokładnie tak, jak przed etapem B5 pytał `PREFLIGHT_REQUIRED`. W produkcji pole
   * było `null`, gwardia się nie budziła i drugi `preflight_confirm` nadpisywał
   * `mh.start` oraz `fuel.startL`, czyli POCZĄTEK ŁAŃCUCHA MH (§4.5).
   *
   * Znacznikiem jest `preflightAt` i tylko on (`projections/session.ts`).
   */
  it('drugi preflight jest odrzucany także BEZ deklaracji meldunku', () => {
    expect(hard(check(groundNoDuty(), preflightNoDuty()))).toEqual([
      'PREFLIGHT_ALREADY_CONFIRMED',
    ]);
  });
});

describe('okno korekty po zamknięciu dnia (24 h)', () => {
  const closed = (): Event[] => [
    ...afterCycle(),
    ev(
      'day_close',
      { finalReading: { fuelL: 112, mh: MH_START + 142 / 60 } },
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

  it('correctionWindow liczy pozostały czas OD ZDANIA - jedyna kotwica (2026-08-10)', () => {
    // Do 2026-08-10 każdy wzlot miał własne okno od `leg_close`; po pivocie jednostką
    // zatwierdzenia jest SESJA, a okno rusza w chwili zdania samolotu (min(300)).
    const RELEASED = min(300);
    const state = projectSession(closed());

    const open = correctionWindow(state, RELEASED + 3_600_000);
    expect(open.confirmed).toBe(true);
    expect(open.open).toBe(true);
    expect(open.remainingMs).toBe(CORRECTION_WINDOW_MS - 3_600_000);

    const expired = correctionWindow(state, RELEASED + CORRECTION_WINDOW_MS + 1);
    expect(expired.open).toBe(false);
    expect(expired.remainingMs).toBe(0);

    // Sesja NIEZDANA nie podlega oknu: korekta w kokpicie jest normalną pracą.
    const active = correctionWindow(projectSession(afterCycle()), min(200));
    expect(active.confirmed).toBe(false);
    expect(active.open).toBe(true);
  });
});

describe('wpis ręczny (fallback GPS, §3.8)', () => {
  it('jest furtką na przegapione zdarzenia - nie podlega gwardii silnika', () => {
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

  it('zrzut BEZ składu przechodzi - raportowanie skoczków jest opcjonalne (issue #21)', () => {
    // `null` = „skład niepodany" (tak normalizuje komenda), a suma 0 wprost z payloadu
    // też nie ma prawa blokować: zrzut jest znacznikiem faktu, nie formularzem.
    expect(check(inFlight(), drop({ jumpers: null }))).toEqual([]);
    expect(check(inFlight(), drop({ jumpers: { tandem: 0, aff: 0, solo: 0 } }))).toEqual([]);
  });

  it('ujemna liczba skoczków jest odrzucana - skład niemożliwy, nie podejrzany', () => {
    expect(hard(check(inFlight(), drop({ jumpers: { tandem: -1, aff: 0, solo: 1 } })))).toEqual([
      'DROP_NEGATIVE_JUMPERS',
    ]);
  });

  it('zrzut poza lotem to miękka flaga - dane przychodowe zostają zapisane', () => {
    const v = check(running(), drop({}, min(20)));
    expect(hard(v)).toEqual([]);
    expect(soft(v)).toEqual(['DROP_ON_GROUND']);
  });

  it('zrzut przy operacji innej niż skoki to miękka flaga', () => {
    const ferry = [
      claim(),
      ev(
        'preflight_confirm',
        { operation: 'ferry', reading: { fuelL: 150, mh: MH_START } },
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

describe('załadunek (issue #21 pkt 7)', () => {
  const boarding = (
    payload: EventPayloadMap['boarding'] = { jumpers: { tandem: 2, aff: 1, solo: 3 } },
    t = min(15),
  ): Event => ev('boarding', payload, { t });

  it('załadunek na ziemi dnia skokowego przechodzi - ze składem i bez', () => {
    expect(check(running(), boarding())).toEqual([]);
    expect(check(running(), boarding({ jumpers: null }))).toEqual([]);
    // Także przed uruchomieniem silnika: pierwszy skład wsiada na postoju (04a).
    expect(check(ground(), boarding())).toEqual([]);
  });

  it('ujemna liczba skoczków jest odrzucana', () => {
    expect(
      hard(check(running(), boarding({ jumpers: { tandem: 0, aff: -1, solo: 0 } }))),
    ).toEqual(['BOARDING_NEGATIVE_JUMPERS']);
  });

  it('załadunek w locie to miękka flaga - w powietrzu nikt nie wsiada', () => {
    const v = check(inFlight(), boarding(undefined, min(30)));
    expect(hard(v)).toEqual([]);
    expect(soft(v)).toEqual(['BOARDING_IN_FLIGHT']);
  });

  it('załadunek przy operacji innej niż skoki to miękka flaga', () => {
    const ferry = [
      claim(),
      ev(
        'preflight_confirm',
        { operation: 'ferry', reading: { fuelL: 150, mh: MH_START } },
        { t: min(0) },
      ),
      ev('engine_start', {}, { t: min(12) }),
    ];
    const v = check(ferry, boarding());
    expect(hard(v)).toEqual([]);
    expect(soft(v)).toEqual(['BOARDING_OUTSIDE_JUMP_OPERATION']);
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

describe('olej przy przejęciu (issue #60)', () => {
  /** Preflight z polami olejowymi - reszta jak kanoniczny `preflight()`. */
  const oilPreflight = (oil: { oilL?: number | null; oilAddedL?: number | null }): Event =>
    ev(
      'preflight_confirm',
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: 'EPKK',
        reading: { fuelL: 150, mh: MH_START },
        mhFormat: 'hhmm',
        ...oil,
      },
      { t: min(0) },
    );

  it('domena przyjmuje brak pomiaru (stare strumienie, wpis ręczny) - wymagalność egzekwuje ekran 02a', () => {
    expect(check([claim()], oilPreflight({}))).toEqual([]);
    expect(check([claim()], oilPreflight({ oilL: null, oilAddedL: null }))).toEqual([]);
  });

  it('ujemny pomiar i ujemna dolewka są twardo odrzucane', () => {
    expect(hard(check([claim()], oilPreflight({ oilL: -1 })))).toEqual(['OIL_NEGATIVE']);
    expect(hard(check([claim()], oilPreflight({ oilAddedL: -0.5 })))).toEqual(['OIL_NEGATIVE']);
  });

  it('stan ponad zbiornik oleju jest twardo odrzucany - pomiar, suma i dolewka w ciemno', () => {
    expect(hard(check([claim()], oilPreflight({ oilL: 12 })))).toEqual(['OIL_OVER_CAPACITY']);
    // 10,6 + 1,5 = 12,1 > 11,4 - sufit liczy się na STANIE PO DOLEWCE
    expect(hard(check([claim()], oilPreflight({ oilL: 10.6, oilAddedL: 1.5 })))).toEqual([
      'OIL_OVER_CAPACITY',
    ]);
    // dolewka bez pomiaru też nie zmieści więcej, niż mieści zbiornik
    expect(hard(check([claim()], oilPreflight({ oilAddedL: 12 })))).toEqual(['OIL_OVER_CAPACITY']);
    // równo do pełna jest legalne (epsilon łapie artefakty IEEE-754, nie intencję)
    expect(check([claim()], oilPreflight({ oilL: 10.4, oilAddedL: 1.0 }))).toEqual([]);
  });

  it('bez konfiguracji zbiornika sufit śpi (offline bez cache, §4.8)', () => {
    expect(check([claim()], oilPreflight({ oilL: 12 }), UNKNOWN_LIMITS)).toEqual([]);
  });

  it('poniżej minimum flaguje MIĘKKO i mówi, ile brakuje - zapis przechodzi', () => {
    const v = check([claim()], oilPreflight({ oilL: 7.8 }));
    expect(hard(v)).toEqual([]);
    expect(soft(v)).toEqual(['OIL_BELOW_MIN']);
    expect(warningsOf(v)[0]?.details?.missingL).toBeCloseTo(0.7, 6);
  });

  it('dolewka domykająca minimum gasi ostrzeżenie; równo na minimum nie jest „poniżej"', () => {
    expect(check([claim()], oilPreflight({ oilL: 7.8, oilAddedL: 1.0 }))).toEqual([]);
    expect(check([claim()], oilPreflight({ oilL: 8.5 }))).toEqual([]);
  });
});

describe('dolewka oleju z kokpitu - oil_add (issue #60, decyzja 2026-08-27)', () => {
  const oilAdd = (addedL: number, o: EvOptions = {}): Event =>
    ev('oil_add', { addedL }, o);

  it('wolno dolać PRZED uruchomieniem i PO wyłączeniu - jak tankowanie', () => {
    expect(check(ground(), oilAdd(1.0, { t: min(2) }))).toEqual([]);
    expect(check(afterCycle(), oilAdd(1.0, { t: min(160) }))).toEqual([]);
  });

  it('przy pracującym silniku dolewka jest twardo odrzucana', () => {
    expect(hard(check(running(), oilAdd(1.0, { t: min(20) })))).toEqual([
      'OIL_ADD_ENGINE_RUNNING',
    ]);
  });

  it('ujemna ilość i dolewka ponad zbiornik - te same progi, co para na przejęciu', () => {
    expect(hard(check(ground(), oilAdd(-0.5, { t: min(2) })))).toEqual(['OIL_NEGATIVE']);
    expect(hard(check(ground(), oilAdd(12, { t: min(2) })))).toEqual(['OIL_OVER_CAPACITY']);
    expect(check(ground(), oilAdd(12, { t: min(2) }), UNKNOWN_LIMITS)).toEqual([]);
  });

  it('po zdaniu samolotu dolewki już nie ma - bramka typów korekty', () => {
    const closed = [
      ...afterCycle(),
      ev('day_close', { finalReading: { fuelL: 100, mh: 1236.9 } }, { t: min(170) }),
    ];
    expect(hard(check(closed, oilAdd(1.0, { t: min(180) })))).toContain('DAY_CLOSED');
  });

  it('korekty: retime i void przechodzą, amend jest odrzucany (parytet z refuel)', () => {
    const add = oilAdd(1.0, { t: min(2) });
    const stream = [...ground(), add];
    const correction = (payload: Record<string, unknown>): Event =>
      ev('event_correction', { targetUuid: add.uuid, ...payload } as never, { t: min(6) });

    expect(check(stream, correction({ action: 'retime', newTime: min(3) }))).toEqual([]);
    expect(check(stream, correction({ action: 'void' }))).toEqual([]);
    expect(
      hard(check(stream, correction({ action: 'amend', fields: { oilAddedL: 2 } }))),
    ).toEqual(['CORRECTION_FIELD_NOT_ALLOWED']);
  });
});
