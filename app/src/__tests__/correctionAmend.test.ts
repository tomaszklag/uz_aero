/**
 * UZ Aero - test AKCJI `amend` (issue #43): korekta WARTOŚCI, nie czasu.
 *
 * Do issue #43 `event_correction` umiało dwie rzeczy: przesunąć zdarzenie w czasie
 * i uznać, że go nie było. Odczyt paliwa, licznik motogodzin i skład zrzutu były więc
 * nietykalne - pilot, który przepisał z tarczy 171 zamiast 168, nie miał JAK tego
 * poprawić, a to jego jedyny zapis stanu maszyny.
 *
 * Testy pilnują trzech rzeczy naraz:
 *  1. `amend` faktycznie zmienia liczby W PROJEKCJI (nie tylko w payloadzie),
 *  2. czas i wartości są NIEZALEŻNE - poprawka jednego nie kasuje drugiego,
 *  3. korekta nie jest furtką omijającą reguły: te same progi, co przy pierwszym zapisie.
 *
 * Punkt czwarty jest testem REGRESYJNYM na najdalszego konsumenta strumienia: skoro
 * `applyCorrections` jest jedynym przejściem, poprawiony odczyt musi sam z siebie
 * dojechać do analityki zużycia. Gdyby ktoś dołożył drugą ścieżkę odczytu payloadu,
 * ten test upadnie jako pierwszy.
 */

import {
  applyCorrections,
  buildFuelIntervals,
  checkAppend,
  projectSession,
  errorsOf,
  type AircraftLimits,
  type CorrectionFields,
  type Event,
  type EventOf,
  type RuleViolation,
} from '../domain';

const DAY = Date.UTC(2026, 7, 6);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
const LIMITS: AircraftLimits = { capacityL: 212, oilMinL: 8.5, oilCapacityL: 11.4 };

let seq = 0;
function event(type: Event['type'], time: number, payload: unknown = {}): Event {
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

type CorrectionAction =
  | { action: 'retime'; newTime: number }
  | { action: 'void' }
  | { action: 'amend'; fields: CorrectionFields };

function correction(
  target: Event,
  recordedAt: number,
  action: CorrectionAction,
  reason?: string,
): EventOf<'event_correction'> {
  seq += 1;
  return {
    uuid: `c-${seq}`,
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type: 'event_correction',
    deviceTime: recordedAt,
    gpsTime: recordedAt,
    payload: { targetUuid: target.uuid, ...action, ...(reason != null ? { reason } : {}) },
    schemaVersion: 1,
    syncedAt: null,
  } as EventOf<'event_correction'>;
}

/** Sesja z mockupu 10: przejęcie 150 L / 1234.5 h, zdanie 171 L / 1236.1 h, jeden zrzut. */
function session(): {
  events: Event[];
  preflight: Event;
  dayClose: Event;
  drop: Event;
  landing: Event;
} {
  const preflight = event('preflight_confirm', at(8, 4), {
    operation: 'skoki',
    departureIcao: 'EPZG',
    arrivalIcao: 'EPZG',
    reading: { fuelL: 150, mh: 1234.5 },
    mhFormat: 'decimal',
    // Olej z bagnetu przy przejęciu (issue #60) - pomiar 10,2 L + dolane 1,0 L.
    oilL: 10.2,
    oilAddedL: 1.0,
  });
  const drop = event('drop', at(8, 52), {
    dropNumber: 1,
    altitudeFt: 12800,
    jumpers: { tandem: 2, aff: 1, solo: 1 },
  });
  const landing = event('landing', at(9, 1), { method: 'auto' });
  const dayClose = event('day_close', at(11, 20), {
    finalReading: { fuelL: 171, mh: 1236.1 },
  });

  return {
    events: [
      event('session_claim', at(8, 4), { mode: 'free' }),
      preflight,
      event('engine_start', at(8, 12)),
      event('takeoff', at(8, 20), { method: 'auto' }),
      drop,
      landing,
      event('engine_stop', at(9, 55)),
      dayClose,
    ],
    preflight,
    dayClose,
    drop,
    landing,
  };
}

const codes = (v: RuleViolation[]): string[] => errorsOf(v).map((x) => x.code);

/** Kandydat korekty na tle strumienia - tak samo jak sprawdza go komenda. */
function check(stream: Event[], candidate: Event): RuleViolation[] {
  return checkAppend(projectSession(stream), candidate, LIMITS);
}

describe('amend - odczyty przejęcia i zdania', () => {
  it('poprawiony odczyt przy zdaniu wchodzi do projekcji i przelicza zużycie', () => {
    const { events, dayClose } = session();
    const before = projectSession(events);
    expect(before.fuel.endL).toBe(171);
    // (150 + 0) − 171 = −21: sesja „dolała" paliwa, czyli odczyt jest błędny.
    expect(before.fuel.consumedL).toBe(-21);

    const stream = [
      ...events,
      correction(dayClose, at(11, 40), { action: 'amend', fields: { fuelL: 123 } }),
    ];
    const after = projectSession(stream);
    expect(after.fuel.endL).toBe(123);
    expect(after.fuel.consumedL).toBe(27);
    // Motogodzin nikt nie ruszał - korekta jednego pola nie dotyka drugiego.
    expect(after.mh.end).toBe(1236.1);
  });

  it('poprawiony odczyt przy przejęciu przesuwa POCZĄTEK łańcucha MH', () => {
    const { events, preflight } = session();
    const stream = [
      ...events,
      correction(preflight, at(11, 40), { action: 'amend', fields: { mh: 1234.9 } }),
    ];
    const after = projectSession(stream);
    expect(after.mh.start).toBe(1234.9);
    expect(after.mh.deltaH).toBeCloseTo(1.2, 6);
    expect(after.fuel.startL).toBe(150);
  });

  it('oryginał zostaje w rejestrze nietknięty (append-only)', () => {
    const { events, dayClose } = session();
    const stream = [
      ...events,
      correction(dayClose, at(11, 40), { action: 'amend', fields: { fuelL: 123 } }),
    ];
    applyCorrections(stream);
    expect((dayClose as EventOf<'day_close'>).payload.finalReading.fuelL).toBe(171);
  });
});

describe('amend - skład zrzutu', () => {
  it('zmienia skład i sumę skoczków w rozliczeniu', () => {
    const { events, drop } = session();
    expect(projectSession(events).drops.totalJumpers).toBe(4);

    const stream = [
      ...events,
      correction(drop, at(11, 40), {
        action: 'amend',
        fields: { jumpers: { tandem: 2, aff: 1, solo: 2 } },
      }),
    ];
    const after = projectSession(stream);
    expect(after.drops.totalJumpers).toBe(5);
    expect(after.drops.jumpers).toEqual({ tandem: 2, aff: 1, solo: 2 });
    // Wysokość pochodzi z pomiaru i nie należy do białej listy - zostaje.
    expect(after.drops.avgAltitudeFt).toBe(12800);
  });

  it('`jumpers: null` znaczy „skład niepodany", a nie zero', () => {
    const { events, drop } = session();
    const stream = [
      ...events,
      correction(drop, at(11, 40), { action: 'amend', fields: { jumpers: null } }),
    ];
    const effective = applyCorrections(stream).find((e) => e.uuid === drop.uuid);
    expect((effective as EventOf<'drop'>).payload.jumpers).toBeNull();
    // Zrzut nadal się LICZY - brak składu nie kasuje faktu wyniesienia (issue #21).
    expect(projectSession(stream).drops.count).toBe(1);
    expect(projectSession(stream).drops.totalJumpers).toBe(0);
  });
});

/**
 * Notatka (issue #43, zgłoszenie z urządzenia) - jedyna dana sesji pisana ZDANIEM.
 * Do tej poprawki nie dało się jej zmienić w ogóle: tekst z kroku „zadanie" wracał
 * do autora wyłącznie do czytania.
 */
describe('amend - notatka operacji', () => {
  it('poprawia notatkę z zadania', () => {
    const { events, preflight } = session();
    expect(projectSession(events).notes).toBeNull();

    const stream = [
      ...events,
      correction(preflight, at(11, 40), {
        action: 'amend',
        fields: { notes: 'Drugi zbiornik nie trzyma wskazania.' },
      }),
    ];
    expect(projectSession(stream).notes).toBe('Drugi zbiornik nie trzyma wskazania.');
  });

  it('`notes: null` KASUJE notatkę - pusty tekst to decyzja, nie brak pola', () => {
    const { events, preflight } = session();
    const stream = [
      ...events,
      correction(preflight, at(11, 40), { action: 'amend', fields: { notes: 'literówka' } }),
      correction(preflight, at(11, 45), { action: 'amend', fields: { notes: null } }),
    ];
    expect(projectSession(stream).notes).toBeNull();
  });

  it('nie rusza odczytów przy tym samym zdarzeniu', () => {
    const { events, preflight } = session();
    const stream = [
      ...events,
      correction(preflight, at(11, 40), { action: 'amend', fields: { notes: 'uwaga' } }),
    ];
    const after = projectSession(stream);
    expect(after.fuel.startL).toBe(150);
    expect(after.mh.start).toBe(1234.5);
  });

  it('reguły: notatka wolna przy preflightcie, zakazana przy zdaniu', () => {
    const { events, preflight, dayClose } = session();
    expect(
      codes(check(events, correction(preflight, at(11, 40), { action: 'amend', fields: { notes: 'x' } }))),
    ).toEqual([]);
    // `day_close` niesie odczyty przekazania, nie tekst - pole tam nie istnieje.
    expect(
      codes(check(events, correction(dayClose, at(11, 40), { action: 'amend', fields: { notes: 'x' } }))),
    ).toContain('CORRECTION_FIELD_NOT_ALLOWED');
  });
});

/**
 * DUAL (issue #43, zgłoszenie z urządzenia) - najtrudniejsze pole z całej białej listy.
 *
 * Drugi pilot żył wyłącznie w NAGŁÓWKU zdarzeń, a nagłówka nie da się poprawić bez
 * złamania append-only: opisuje chwilę zapisu, nie fakt o sesji. Dlatego preflight
 * dostał `dualId` w payloadzie, a projekcja czyta go z PIERWSZEŃSTWEM.
 */
describe('amend - drugi pilot całej operacji', () => {
  it('deklaracja z preflightu wygrywa z nagłówkami zdarzeń', () => {
    const { events, preflight } = session();
    // Nagłówki niosą AKO - tak zapisał telefon w chwili lotu.
    const withDual = events.map((e) => ({ ...e, dualId: 'AKO' }) as Event);
    expect(projectSession(withDual).dualId).toBe('AKO');

    const stream = [
      ...withDual,
      correction(preflight, at(11, 40), { action: 'amend', fields: { dualId: 'KRZ' } }),
    ];
    // Poprawka działa WSTECZ na całą sesję, choć nagłówki nadal mówią „AKO".
    expect(projectSession(stream).dualId).toBe('KRZ');
    expect(stream.every((e) => e.type === 'event_correction' || e.dualId === 'AKO')).toBe(true);
  });

  it('`dualId: null` znaczy „operacja jednoosobowa" - to deklaracja, nie brak', () => {
    const { events, preflight } = session();
    const withDual = events.map((e) => ({ ...e, dualId: 'AKO' }) as Event);
    const stream = [
      ...withDual,
      correction(preflight, at(11, 40), { action: 'amend', fields: { dualId: null } }),
    ];
    expect(projectSession(stream).dualId).toBeNull();
  });

  it('bez deklaracji obowiązuje nagłówek - operacje sprzed tej zmiany liczą się jak dawniej', () => {
    const { events } = session();
    const withDual = events.map((e) => ({ ...e, dualId: 'AKO' }) as Event);
    expect(projectSession(withDual).dualId).toBe('AKO');
  });

  it('Dual nie może być PIC-em - ta sama reguła, co przy zmianie załogi', () => {
    const { events, preflight } = session();
    expect(
      codes(check(events, correction(preflight, at(11, 40), { action: 'amend', fields: { dualId: 'TMK' } }))),
    ).toContain('DUAL_IS_PIC');
  });

  it('przy zdaniu samolotu pola załogi nie ma - tam nie deklaruje się składu', () => {
    const { events, dayClose } = session();
    expect(
      codes(check(events, correction(dayClose, at(11, 40), { action: 'amend', fields: { dualId: 'AKO' } }))),
    ).toContain('CORRECTION_FIELD_NOT_ALLOWED');
  });
});

describe('składanie wielu korekt - czas i wartości są niezależne', () => {
  it('retime PO amend nie cofa poprawionej wartości', () => {
    const { events, drop } = session();
    const stream = [
      ...events,
      correction(drop, at(11, 40), {
        action: 'amend',
        fields: { jumpers: { tandem: 3, aff: 0, solo: 0 } },
      }),
      correction(drop, at(11, 45), { action: 'retime', newTime: at(8, 55) }),
    ];
    const effective = applyCorrections(stream).find((e) => e.uuid === drop.uuid)!;
    expect(effective.gpsTime).toBe(at(8, 55));
    expect((effective as EventOf<'drop'>).payload.jumpers).toEqual({ tandem: 3, aff: 0, solo: 0 });
  });

  it('amend PO retime nie cofa poprawionego czasu', () => {
    const { events, drop } = session();
    const stream = [
      ...events,
      correction(drop, at(11, 40), { action: 'retime', newTime: at(8, 55) }),
      correction(drop, at(11, 45), {
        action: 'amend',
        fields: { jumpers: { tandem: 0, aff: 0, solo: 4 } },
      }),
    ];
    const effective = applyCorrections(stream).find((e) => e.uuid === drop.uuid)!;
    expect(effective.gpsTime).toBe(at(8, 55));
    expect((effective as EventOf<'drop'>).payload.jumpers).toEqual({ tandem: 0, aff: 0, solo: 4 });
  });

  it('druga korekta paliwa nie kasuje poprawionych wcześniej motogodzin', () => {
    const { events, dayClose } = session();
    const stream = [
      ...events,
      correction(dayClose, at(11, 40), { action: 'amend', fields: { mh: 1236.5 } }),
      correction(dayClose, at(11, 45), { action: 'amend', fields: { fuelL: 123 } }),
    ];
    const after = projectSession(stream);
    expect(after.mh.end).toBe(1236.5);
    expect(after.fuel.endL).toBe(123);
  });

  it('amend przywraca zdarzenie unieważnione - poprawiasz to, co uznajesz za zaszłe', () => {
    const { events, drop } = session();
    const stream = [
      ...events,
      correction(drop, at(11, 40), { action: 'void' }),
      correction(drop, at(11, 45), {
        action: 'amend',
        fields: { jumpers: { tandem: 1, aff: 0, solo: 0 } },
      }),
    ];
    expect(projectSession(stream).drops.count).toBe(1);
    expect(projectSession(stream).drops.totalJumpers).toBe(1);
  });

  it('amend BEZ ani jednego znanego pola jest nieczytelny - poprzedni zostaje w mocy', () => {
    const { events, dayClose } = session();
    const broken = correction(dayClose, at(11, 45), { action: 'amend', fields: {} });
    (broken as { payload: unknown }).payload = {
      targetUuid: dayClose.uuid,
      action: 'amend',
      fields: { capacityL: 999 },
    };
    const stream = [
      ...events,
      correction(dayClose, at(11, 40), { action: 'amend', fields: { fuelL: 123 } }),
      broken,
    ];
    expect(projectSession(stream).fuel.endL).toBe(123);
  });
});

describe('reguły korekty wartości', () => {
  it('przejęcie i zdanie MOŻNA poprawić przez amend', () => {
    const { events, dayClose } = session();
    const candidate = correction(dayClose, at(11, 40), {
      action: 'amend',
      fields: { fuelL: 123 },
    });
    expect(codes(check(events, candidate))).toEqual([]);
  });

  it('ale nie da się ich przesunąć w czasie ani unieważnić', () => {
    const { events, dayClose, preflight } = session();
    expect(
      codes(check(events, correction(dayClose, at(11, 40), { action: 'retime', newTime: at(11, 0) }))),
    ).toContain('CORRECTION_TARGET_NOT_ALLOWED');
    expect(codes(check(events, correction(preflight, at(11, 40), { action: 'void' })))).toContain(
      'CORRECTION_TARGET_NOT_ALLOWED',
    );
  });

  it('pole spoza białej listy tego typu jest odrzucane', () => {
    const { events, dayClose, landing } = session();
    expect(
      codes(
        check(
          events,
          correction(dayClose, at(11, 40), {
            action: 'amend',
            fields: { jumpers: { tandem: 1, aff: 0, solo: 0 } },
          }),
        ),
      ),
    ).toContain('CORRECTION_FIELD_NOT_ALLOWED');
    // Lądowanie nie ma ŻADNEGO pola do poprawienia - czas zmienia `retime`.
    expect(
      codes(check(events, correction(landing, at(11, 40), { action: 'amend', fields: { fuelL: 1 } }))),
    ).toContain('CORRECTION_FIELD_NOT_ALLOWED');
  });

  it('pusta korekta wartości nie ma czego zmienić', () => {
    const { events, dayClose } = session();
    expect(
      codes(check(events, correction(dayClose, at(11, 40), { action: 'amend', fields: {} }))),
    ).toContain('CORRECTION_FIELD_NOT_ALLOWED');
  });

  it('korekta nie omija progów pierwszego zapisu', () => {
    const { events, dayClose, drop } = session();
    expect(
      codes(check(events, correction(dayClose, at(11, 40), { action: 'amend', fields: { fuelL: 400 } }))),
    ).toContain('FUEL_OVER_CAPACITY');
    expect(
      codes(check(events, correction(dayClose, at(11, 40), { action: 'amend', fields: { mh: -1 } }))),
    ).toContain('MH_NEGATIVE');
    expect(
      codes(
        check(
          events,
          correction(drop, at(11, 40), {
            action: 'amend',
            fields: { jumpers: { tandem: -2, aff: 0, solo: 0 } },
          }),
        ),
      ),
    ).toContain('DROP_NEGATIVE_JUMPERS');
  });

  /**
   * `session_claim` przestał być nietykalny w JEDNYM wymiarze (uwaga z urządzenia):
   * godzina przejęcia to zwykły fakt i pilot musi umieć ją sprostować. Nietykalna
   * została sama ISTOTA claimu - bez niego sesja nie ma właściciela (§4.4).
   */
  it('godzinę przejęcia MOŻNA poprawić', () => {
    const { events } = session();
    const claim = events[0]!;
    expect(
      codes(check(events, correction(claim, at(11, 40), { action: 'retime', newTime: at(9, 0) }))),
    ).toEqual([]);
  });

  it('ale przejęcia nie da się unieważnić ani zmienić w nim wartości', () => {
    const { events } = session();
    const claim = events[0]!;
    expect(codes(check(events, correction(claim, at(11, 40), { action: 'void' })))).toContain(
      'CORRECTION_TARGET_NOT_ALLOWED',
    );
    expect(
      codes(check(events, correction(claim, at(11, 40), { action: 'amend', fields: { fuelL: 100 } }))),
    ).toContain('CORRECTION_TARGET_NOT_ALLOWED');
  });

  it('korekty się nie poprawia - poprawia się fakt', () => {
    const { events } = session();
    const first = correction(events[3]!, at(11, 40), { action: 'retime', newTime: at(8, 21) });
    const stream = [...events, first];
    // Odmowa przychodzi z INDEKSU, nie z listy typów: `buildEventIndex` w ogóle nie
    // wpisuje do niego korekt, więc celowanie w nie wygląda jak celowanie w zdarzenie
    // spoza sesji. Skutek jest ten sam (twarde odrzucenie), a komunikat mówi prawdę:
    // takiego celu tu nie ma.
    expect(
      codes(check(stream, correction(first, at(11, 45), { action: 'retime', newTime: at(8, 22) }))),
    ).toEqual(['CORRECTION_TARGET_NOT_FOUND']);
  });
});

describe('regresja: poprawka dociera do analityki zużycia', () => {
  it('interwał paliwowy liczy się z odczytu PO korekcie', () => {
    const { events, dayClose } = session();
    const raw = buildFuelIntervals(events).intervals;
    expect(raw[0]?.endReadingL).toBe(171);

    const stream = [
      ...events,
      correction(dayClose, at(11, 40), { action: 'amend', fields: { fuelL: 123 } }),
    ];
    const corrected = buildFuelIntervals(stream).intervals;
    expect(corrected[0]?.endReadingL).toBe(123);
    expect(corrected[0]?.consumedL).toBe(27);
  });

  it('równanie motogodzin też widzi poprawiony licznik', () => {
    const { events, dayClose } = session();
    expect(buildFuelIntervals(events).mh?.deltaMh).toBeCloseTo(1.6, 6);

    const stream = [
      ...events,
      correction(dayClose, at(11, 40), { action: 'amend', fields: { mh: 1236.5 } }),
    ];
    expect(buildFuelIntervals(stream).mh?.deltaMh).toBeCloseTo(2.0, 6);
  });
});

describe('amend - olej przy przejęciu (issue #60)', () => {
  it('poprawiony pomiar wchodzi do projekcji; dolewka i paliwo zostają nietknięte', () => {
    const { events, preflight } = session();
    expect(projectSession(events).oil).toEqual({ levelL: 10.2, addedL: 1.0, afterL: 11.2 });

    const stream = [
      ...events,
      correction(preflight, at(11, 40), { action: 'amend', fields: { oilL: 9.7 } }),
    ];
    const after = projectSession(stream);
    expect(after.oil.levelL).toBe(9.7);
    expect(after.oil.addedL).toBe(1.0);
    expect(after.oil.afterL).toBeCloseTo(10.7, 6);
    expect(after.fuel.startL).toBe(150);
  });

  it('`oilL: null` kasuje omyłkowy pomiar - null jest wartością, nie brakiem pola', () => {
    const { events, preflight } = session();
    const stream = [
      ...events,
      correction(preflight, at(11, 40), { action: 'amend', fields: { oilL: null } }),
    ];
    const after = projectSession(stream);
    expect(after.oil.levelL).toBeNull();
    expect(after.oil.afterL).toBeNull();
    // dolewka to osobny fakt - kasowanie pomiaru jej nie rusza
    expect(after.oil.addedL).toBe(1.0);
  });

  it('olej nie należy do zdania samolotu - biała lista odrzuca cel day_close', () => {
    const { events, dayClose } = session();
    const candidate = correction(dayClose, at(11, 40), {
      action: 'amend',
      fields: { oilL: 9.7 },
    });
    expect(codes(check(events, candidate))).toEqual(['CORRECTION_FIELD_NOT_ALLOWED']);
  });

  it('korekta nie jest furtką: te same progi zbiornika, co przy pierwszym zapisie', () => {
    const { events, preflight } = session();
    const candidate = correction(preflight, at(11, 40), {
      action: 'amend',
      fields: { oilL: 12 },
    });
    expect(codes(check(events, candidate))).toEqual(['OIL_OVER_CAPACITY']);
  });

  it('unieważniona dolewka z kokpitu (oil_add) znika z sumy oleju', () => {
    const { events } = session();
    const add = event('oil_add', at(8, 6), { addedL: 0.5 });
    const stream = [...events, add];
    expect(projectSession(stream).oil.addedL).toBeCloseTo(1.5, 6); // 1,0 z przejęcia + 0,5

    const voided = [...stream, correction(add, at(11, 40), { action: 'void' })];
    expect(projectSession(voided).oil.addedL).toBeCloseTo(1.0, 6);
    expect(projectSession(voided).oil.afterL).toBeCloseTo(11.2, 6);
  });
});
