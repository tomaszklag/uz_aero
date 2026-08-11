/**
 * UZ Aero — testy projekcji sesji (§5.2: stan liczony w pamięci ze strumienia zdarzeń).
 *
 * Scenariusz odwzorowuje **kanoniczną oś czasu dnia 22 JUNE** z `docs/design-notes.md`.
 * Od 2026-08-10 (pivot: sesja = jeden bieg silnika) dzień to TRZY SESJE na SP-AXA,
 * każda domknięta odczytami z obu stron — a liczby dnia zostają te same:
 *   s1: preflight 08:00 (150 L · 1234:30) · bieg 08:12–10:34, 2 loty · zdanie 10:40 (112 L · 1236:52)
 *   s2: preflight 11:00 (112 L) · tankowanie 11:05 (+48 → 160) · bieg 11:15–12:28, 1 lot · zdanie 12:35 (138 L · 1238:05)
 *   s3: preflight 13:00 (138 L) · bieg 13:10–16:14, 3 loty · 3 zrzuty · zdanie 16:45 (88 L · 1241:09)
 *   dzień: 6 lotów · block 6:39 · paliwo 150 +48 −110 = 88 · MH 1234:30 → 1241:09
 *
 * Ten dzień jest WZORCEM POPRAWNOŚCI modelu 2026-08-10 (strażnik zgodności ze starym
 * strumieniem zdjęty decyzją użytkownika — nic nie było wdrożone). Pilnuje nie tylko
 * kodu, ale i zgodności z designem.
 */

import { projectSession, emptySessionState, projectPilotDay } from '../domain';
import type { Event, EventType, EventPayloadMap } from '../domain';

const SESSION = 'sess-22jun';
const AC = 'sp-axa';
const PIC = 'tmk';

/** Baza doby scenariusza (22 JUNE 2026, 00:00 UTC) — konkretna data nie ma znaczenia. */
const DAY0 = Date.UTC(2026, 5, 22, 0, 0, 0);

/** „HH:MM" → epoch ms w dobie scenariusza. Czasy w całym projekcie są w UTC. */
function at(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h * 60 + m) * 60_000;
}

/** Motogodziny „hhmm" → godziny dziesiętne (w danych trzymamy zawsze decimal, §5.1). */
function mh(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h + m / 60;
}

let seq = 0;

/** Buduje zdarzenie z poprawnym nagłówkiem; `payload` zawężony przez `type`. */
function ev<K extends EventType>(
  type: K,
  time: string,
  payload: EventPayloadMap[K],
  sessionUuid: string = SESSION,
): Event {
  return {
    uuid: `e-${++seq}`,
    sessionUuid,
    aircraftId: AC,
    picId: PIC,
    dualId: null,
    type,
    payload,
    deviceTime: at(time),
    gpsTime: at(time),
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

const MIN = 60_000;

/** Pełny cykl silnika z jednym lotem — najmniejsza sensowna jednostka pracy. */
function singleCycle(): Event[] {
  return [
    ev('engine_start', '08:12', {}),
    ev('takeoff', '08:25', { method: 'auto' }),
    ev('landing', '09:18', { method: 'auto' }),
    ev('engine_stop', '10:34', {}),
  ];
}

/**
 * Kanoniczny dzień po pivocie: TRZY sesje SP-AXA, każda = jeden bieg silnika,
 * każda domknięta odczytami (przejęcie → zdanie). Łańcuch MH i paliwa biegnie
 * PRZEZ sesje: odczyt zdania jednej jest odczytem przejęcia następnej (§4.5).
 */
function canonicalSession1(): Event[] {
  const S = 'sess-22jun-1';
  return [
    ev('preflight_confirm', '08:00', {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: 'EPKK',
      reading: { fuelL: 150, mh: mh('1234:30') },
      client: 'Strefa EPKK',
      mhFormat: 'hhmm',
    }, S),
    ev('engine_start', '08:12', {}, S),
    ev('takeoff', '08:25', { method: 'auto' }, S),
    ev('landing', '09:18', { method: 'auto' }, S),
    ev('takeoff', '09:35', { method: 'auto' }, S),
    ev('landing', '10:22', { method: 'auto' }, S),
    ev('engine_stop', '10:34', {}, S),
    ev('day_close', '10:40', { finalReading: { fuelL: 112, mh: mh('1236:52') } }, S),
  ];
}

function canonicalSession2(): Event[] {
  const S = 'sess-22jun-2';
  return [
    ev('preflight_confirm', '11:00', {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: 'EPKK',
      reading: { fuelL: 112, mh: mh('1236:52') },
      mhFormat: 'hhmm',
    }, S),
    // Tankowanie PRZED uruchomieniem — wpis sesji (kokpit 04a): 112 +48 → 160 L.
    ev('refuel', '11:05', { beforeL: 112, addedL: 48, afterL: 160 }, S),
    ev('engine_start', '11:15', {}, S),
    ev('takeoff', '11:28', { method: 'auto' }, S),
    ev('landing', '12:15', { method: 'auto' }, S),
    ev('engine_stop', '12:28', {}, S),
    ev('day_close', '12:35', { finalReading: { fuelL: 138, mh: mh('1238:05') } }, S),
  ];
}

function canonicalSession3(): Event[] {
  const S = 'sess-22jun-3';
  return [
    ev('preflight_confirm', '13:00', {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: 'EPKK',
      reading: { fuelL: 138, mh: mh('1238:05') },
      mhFormat: 'hhmm',
    }, S),
    ev('engine_start', '13:10', {}, S),
    ev('takeoff', '13:24', { method: 'auto' }, S),
    ev('drop', '13:48', {
      dropNumber: 1,
      altitudeFt: 2450,
      jumpers: { tandem: 2, aff: 1, solo: 1 },
    }, S),
    ev('landing', '14:08', { method: 'auto' }, S),
    ev('takeoff', '14:21', { method: 'auto' }, S),
    ev('drop', '14:42', {
      dropNumber: 2,
      altitudeFt: 1800,
      jumpers: { tandem: 1, aff: 0, solo: 3 },
    }, S),
    ev('landing', '15:03', { method: 'manual' }, S),
    ev('takeoff', '15:17', { method: 'auto' }, S),
    ev('drop', '15:45', {
      dropNumber: 3,
      altitudeFt: 3200,
      jumpers: { tandem: 3, aff: 2, solo: 0 },
    }, S),
    ev('landing', '16:10', { method: 'auto' }, S),
    ev('engine_stop', '16:14', {}, S),
    ev('day_close', '16:45', {
      finalReading: { fuelL: 88, mh: mh('1241:09') },
    }, S),
  ];
}

describe('projectSession — pojedynczy cykl', () => {
  it('liczy block time, lot i liczniki z pełnego cyklu silnika', () => {
    const s = projectSession(singleCycle());

    expect(s.blockTimeMs).toBe(142 * MIN); // 08:12 → 10:34 = 2:22
    expect(s.flights).toHaveLength(1);
    expect(s.flightTimeMs).toBe(53 * MIN); // 08:25 → 09:18 = 0:53
    expect(s.takeoffCount).toBe(1);
    expect(s.landingCount).toBe(1);
    expect(s.engineRunning).toBe(false);
    expect(s.inFlight).toBe(false);
  });

  it('w trakcie lotu trzyma otwarty cykl i otwarty lot', () => {
    const s = projectSession([
      ev('engine_start', '08:12', {}),
      ev('takeoff', '08:25', { method: 'auto' }),
    ]);

    expect(s.engineRunning).toBe(true);
    expect(s.inFlight).toBe(true);
    expect(s.openEngineStartAt).toBe(at('08:12'));
    expect(s.openTakeoffAt).toBe(at('08:25'));
    // Niedomknięty cykl nie wlicza się do sumy — block time rośnie dopiero po stopie.
    expect(s.blockTimeMs).toBe(0);
    expect(s.landingCount).toBe(0);
  });

  it('pusty strumień daje pusty stan', () => {
    expect(projectSession([])).toEqual(emptySessionState());
  });

  it('taxi otwiera kołowanie; zamyka je start albo wyłączenie silnika', () => {
    const start = [ev('engine_start', '08:12', {}), ev('taxi', '08:14', { method: 'auto' })];
    expect(projectSession(start).taxiing).toBe(true);

    // Start zamyka kołowanie — po lądowaniu zjazd z pasa to NOWE taxi.
    const flying = [...start, ev('takeoff', '08:25', { method: 'auto' })];
    expect(projectSession(flying).taxiing).toBe(false);

    const backOnGround = [
      ...flying,
      ev('landing', '09:18', { method: 'auto' }),
      ev('taxi', '09:19', { method: 'auto' }),
    ];
    expect(projectSession(backOnGround).taxiing).toBe(true);

    const shutdown = [...backOnGround, ev('engine_stop', '09:25', {})];
    expect(projectSession(shutdown).taxiing).toBe(false);
  });
});

describe('kanoniczny dzień 22 JUNE — trzy sesje (zgodność z design-notes)', () => {
  const s1 = projectSession(canonicalSession1());
  const s2 = projectSession(canonicalSession2());
  const s3 = projectSession(canonicalSession3());
  const day = projectPilotDay([s1, s2, s3], PIC, DAY0);

  it('dzień: block 6:39 z trzech sesji 2:22 + 1:13 + 3:04 (projectPilotDay)', () => {
    expect(day.sessions).toHaveLength(3);
    expect(day.sessions.map((x) => x.blockMs)).toEqual([142 * MIN, 73 * MIN, 184 * MIN]);
    expect(day.blockTimeMs).toBe(399 * MIN);
  });

  it('dzień: 6 lotów (2 + 1 + 3) i liczniki 6/6', () => {
    expect(day.sessions.map((x) => x.flightCount)).toEqual([2, 1, 3]);
    expect(day.takeoffCount).toBe(6);
    expect(day.landingCount).toBe(6);
  });

  it('oś dnia: sesje ponumerowane ciągiem, w kolejności uruchomień silnika', () => {
    // Klamra służby żyła tu do 2026-08-11 (meldunek/koniec) — usunięta z modelem
    // (issue #23). Dzień pilota to płaska lista sesji.
    expect(day.sessions.map((x) => x.index)).toEqual([1, 2, 3]);
    expect(day.sessions.map((x) => x.startedAt)).toEqual([
      at('08:12'),
      at('11:15'),
      at('13:10'),
    ]);
  });

  it('paliwo dnia: 150 +48 −110 = 88 L, rozliczone per sesja', () => {
    expect(s1.fuel.consumedL).toBe(38); // 150 → 112
    expect(s2.fuel.consumedL).toBe(22); // 112 +48 → 138
    expect(s3.fuel.consumedL).toBe(50); // 138 → 88
    expect(s1.fuel.consumedL! + s2.fuel.consumedL! + s3.fuel.consumedL!).toBe(110);
    expect(s3.fuel.endL).toBe(88);
  });

  it('łańcuch MH biegnie PRZEZ sesje: zdanie jednej = przejęcie następnej (§4.5)', () => {
    expect(s1.mh.start).toBeCloseTo(mh('1234:30'), 5);
    expect(s1.mh.end).toBeCloseTo(mh('1236:52'), 5);
    expect(s2.mh.start).toBeCloseTo(s1.mh.end!, 5);
    expect(s2.mh.end).toBeCloseTo(mh('1238:05'), 5);
    expect(s3.mh.start).toBeCloseTo(s2.mh.end!, 5);
    expect(s3.mh.end).toBeCloseTo(mh('1241:09'), 5);
    // Δ MH każdej sesji = jej block time — inwariant łańcucha (§4.5).
    expect(s1.mh.deltaH! * 60 * MIN).toBeCloseTo(s1.blockTimeMs, 0);
    expect(s2.mh.deltaH! * 60 * MIN).toBeCloseTo(s2.blockTimeMs, 0);
    expect(s3.mh.deltaH! * 60 * MIN).toBeCloseTo(s3.blockTimeMs, 0);
  });

  it('zrzuty sesji skokowej: 3 wyniesienia, 13 skoczków, średnia wysokość', () => {
    expect(s3.drops.count).toBe(3);
    expect(s3.drops.jumpers).toEqual({ tandem: 6, aff: 3, solo: 4 });
    expect(s3.drops.totalJumpers).toBe(13);
    // Suma i licznik wysokości jadą OSOBNO (panel A10 składa z nich średnią zakresu —
    // średnich per sesja nie da się składać), a średnia sesji jest z nich pochodną.
    expect(s3.drops.altitudeSumFt).toBe(2450 + 1800 + 3200);
    expect(s3.drops.altitudeFixCount).toBe(3);
    expect(s3.drops.avgAltitudeFt).toBeCloseTo((2450 + 1800 + 3200) / 3, 5);
  });

  it('zrzut BEZ wysokości nie wchodzi ani do sumy, ani do licznika fixów', () => {
    // Brak fixa GPS to niewiedza, nie zero: wliczenie go do sumy zaniżałoby średnią,
    // a do licznika — udawało pomiar, którego nie było (mockup A10: „7 bez wysokości
    // nie wchodzi do średniej").
    const partial = projectSession([
      ev('drop', '13:48', { dropNumber: 1, altitudeFt: 3000, jumpers: { tandem: 1, aff: 0, solo: 0 } }),
      ev('drop', '14:42', { dropNumber: 2, jumpers: { tandem: 0, aff: 0, solo: 2 } }),
    ]);
    expect(partial.drops.count).toBe(2);
    expect(partial.drops.altitudeSumFt).toBe(3000);
    expect(partial.drops.altitudeFixCount).toBe(1);
    expect(partial.drops.avgAltitudeFt).toBe(3000);
  });

  it('zrzut BEZ składu liczy się do wyniesień, ale nie dokłada zer do sum (issue #21)', () => {
    const s = projectSession([
      ev('drop', '13:48', { dropNumber: 1, altitudeFt: 2500, jumpers: null }),
      ev('drop', '14:42', { dropNumber: 2, altitudeFt: 2600, jumpers: { tandem: 2, aff: 0, solo: 1 } }),
    ]);
    expect(s.drops.count).toBe(2);
    expect(s.drops.jumpers).toEqual({ tandem: 2, aff: 0, solo: 1 });
    expect(s.drops.totalJumpers).toBe(3);
  });

  it('załadunek czeka na zrzut: prefill ze składem, czasem i nadpisaniem (issue #21)', () => {
    const first = projectSession([
      ev('boarding', '13:05', { jumpers: { tandem: 2, aff: 1, solo: 0 } }),
    ]);
    expect(first.boarding).toEqual({
      jumpers: { tandem: 2, aff: 1, solo: 0 },
      at: at('13:05'),
    });

    // Kolejny załadunek NADPISUJE poprzedni — liczy się skład faktycznie na pokładzie.
    const overwritten = projectSession([
      ev('boarding', '13:05', { jumpers: { tandem: 2, aff: 1, solo: 0 } }),
      ev('boarding', '13:20', { jumpers: null }),
    ]);
    expect(overwritten.boarding).toEqual({ jumpers: null, at: at('13:20') });
  });

  it('zrzut KONSUMUJE załadunek — drugi arkusz w tym samym locie zaczyna od zera', () => {
    const s = projectSession([
      ev('boarding', '13:05', { jumpers: { tandem: 2, aff: 1, solo: 0 } }),
      ev('takeoff', '13:24', { method: 'auto' }),
      ev('drop', '13:48', { dropNumber: 1, altitudeFt: 2450, jumpers: { tandem: 2, aff: 1, solo: 0 } }),
    ]);
    expect(s.boarding).toBeNull();
  });

  it('kontekst sesji i zamknięcie', () => {
    expect(s1.operation).toBe('skoki');
    expect(s1.departureIcao).toBe('EPKK');
    expect(s1.mhFormat).toBe('hhmm');
    expect([s1, s2, s3].every((x) => x.closed)).toBe(true);
    expect([s1, s2, s3].every((x) => !x.engineRunning)).toBe(true);
  });
});

describe('projectSession — notatka dnia (issue #14)', () => {
  it('notatka z preflightu wchodzi do projekcji', () => {
    const state = projectSession([
      ev('preflight_confirm', '08:00', {
        operation: 'skoki',
        reading: { fuelL: 150, mh: 1234.5 },
        notes: 'Lot z uczniem\nDrugi zbiornik nie działa',
      }),
    ]);

    expect(state.notes).toBe('Lot z uczniem\nDrugi zbiornik nie działa');
  });

  it('sesja bez notatki ma `null`, a nie pusty napis', () => {
    // Preflight bez pola `notes`; projekcja musi to znieść bez zmiany znaczenia
    // („nie napisano" to nie to samo co „napisano pustkę").
    expect(projectSession(canonicalSession1()).notes).toBeNull();
  });
});

describe('projectSession — odporność', () => {
  it('kolejność wejścia nie zmienia wyniku (porządkowanie po czasie)', () => {
    const ordered = canonicalSession3();
    const shuffled = [...ordered].reverse();

    const a = projectSession(ordered);
    const b = projectSession(shuffled);

    expect(b.blockTimeMs).toBe(a.blockTimeMs);
    expect(b.flights).toHaveLength(a.flights.length);
    expect(b.fuel.consumedL).toBe(a.fuel.consumedL);
    expect(b.drops.totalJumpers).toBe(a.drops.totalJumpers);
  });

  it('lądowanie bez startu nie psuje projekcji', () => {
    const s = projectSession([
      ev('engine_start', '08:12', {}),
      ev('landing', '08:30', { method: 'manual' }),
      ev('engine_stop', '08:40', {}),
    ]);

    expect(s.blockTimeMs).toBe(28 * MIN);
    expect(s.engineRunning).toBe(false);
    expect(s.flights).toHaveLength(0);
  });
});

// Blok „zamknięcie wzlotu (leg_close)" usunięty 2026-08-10 razem ze zdarzeniem:
// sesja = jeden bieg silnika, a jej zatwierdzeniem jest `day_close` z obowiązkowym
// odczytem. Stan paliwomierza wewnątrz sesji zmieniają wyłącznie tankowania.

/**
 * Preflight i zdanie samolotu niosą WYŁĄCZNIE odczyty — klamra służby (dutyStart/
 * dutyEnd) znikła z payloadów razem z modelem (issue #23, 2026-08-11).
 */
describe('projectSession — preflight i zdanie to odczyty, nie deklaracje', () => {
  it('preflight ustawia odczyty startowe', () => {
    const s = projectSession([
      ev('preflight_confirm', '08:00', {
        operation: 'ferry',
        reading: { fuelL: 96, mh: mh('1239:39') },
      }),
    ]);

    expect(s.preflightAt).toBe(at('08:00'));
    expect(s.fuel.startL).toBe(96);
    expect(s.mh.start).toBeCloseTo(mh('1239:39'), 6);
  });

  it('zdanie samolotu domyka odczyty i sesję', () => {
    const s = projectSession([
      ev('preflight_confirm', '08:00', {
        operation: 'ferry',
        reading: { fuelL: 96, mh: mh('1239:39') },
      }),
      ...singleCycle(),
      ev('day_close', '11:20', {
        finalReading: { fuelL: 62, mh: mh('1241:09') },
      }),
    ]);

    expect(s.closed).toBe(true);
    expect(s.closedAt).toBe(at('11:20'));
    expect(s.fuel.endL).toBe(62);
  });
});

/**
 * Bieg silnika jako byt (`Leg`): para `engine_start`/`engine_stop` z czasem blokowym.
 * Pola potwierdzenia znikły 2026-08-10 razem z `leg_close` — sesję zatwierdza
 * `day_close`, a po regule SESSION_ALREADY_RAN sesja ma najwyżej jeden bieg.
 */
describe('projectSession — bieg silnika jako byt (Leg)', () => {
  const dayStart = () =>
    ev('preflight_confirm', '08:00', {
      operation: 'skoki',
      reading: { fuelL: 150, mh: mh('1234:30') },
    });

  it('bieg dostaje numer, czasy i czas blokowy', () => {
    const s = projectSession([dayStart(), ...singleCycle()]);

    expect(s.legs).toHaveLength(1);
    expect(s.legs[0]!.index).toBe(1);
    expect(s.legs[0]!.startedAt).toBe(at('08:12'));
    expect(s.legs[0]!.stoppedAt).toBe(at('10:34'));
    expect(s.blockTimeMs).toBe(142 * MIN);
  });

  it('projekcja jest totalna także dla strumienia ZŁAMANEGO (dwa biegi w sesji)', () => {
    // Reguła SESSION_ALREADY_RAN odrzuca drugi start, ale projekcja musi opisać
    // również strumień, który powstał obok reguł (dwa telefony przed syncem) —
    // dwa biegi dają dwa wiersze, a nie cichą utratę drugiego.
    const s = projectSession([
      dayStart(),
      ...singleCycle(),
      ev('engine_start', '11:15', {}),
      ev('takeoff', '11:28', { method: 'auto' }),
      ev('landing', '12:15', { method: 'auto' }),
      ev('engine_stop', '12:28', {}),
    ]);

    expect(s.legs).toHaveLength(2);
    expect(s.legs.map((l) => l.index)).toEqual([1, 2]);
  });
});
