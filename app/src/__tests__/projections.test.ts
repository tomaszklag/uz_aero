/**
 * UZ Aero — testy projekcji sesji (§5.2: stan liczony w pamięci ze strumienia zdarzeń).
 *
 * Scenariusz odwzorowuje **kanoniczną oś czasu dnia 22 JUNE** z `docs/design-notes.md`,
 * czyli te same liczby, które pokazują mockupy 04/09/10/11:
 *   cykl 1: 08:12–10:34 (blok 2:22) · loty 08:25→09:18, 09:35→10:22 · MH 1234:30→1236:52
 *   tankowanie 10:48: 112 +48 → 160 L
 *   cykl 2: 11:15–12:28 (blok 1:13) · lot 11:28→12:15
 *   cykl 3: 13:10–16:14 (blok 3:04) · loty 13:24→14:08, 14:21→15:03, 15:17→16:10
 *   dzień:  6 lotów · block 6:39 · paliwo 150 +48 −110 = 88 · MH 1234:30 → 1241:09
 *
 * Dzięki temu test pilnuje nie tylko poprawności kodu, ale i zgodności z designem.
 */

import { projectSession, emptySessionState } from '../domain';
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
): Event {
  return {
    uuid: `e-${++seq}`,
    sessionUuid: SESSION,
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

/** Kanoniczny dzień: 3 cykle, 6 lotów, jedno tankowanie, zamknięcie dnia. */
function canonicalDay(): Event[] {
  return [
    ev('preflight_confirm', '08:00', {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: 'EPKK',
      dutyStart: at('08:00'),
      reading: { fuelL: 150, mh: mh('1234:30') },
      client: 'Strefa EPKK',
      mhFormat: 'hhmm',
    }),

    // ── cykl 1 (blok 2:22) ────────────────────────────────────────────────
    ev('engine_start', '08:12', {}),
    ev('takeoff', '08:25', { method: 'auto' }),
    ev('landing', '09:18', { method: 'auto' }),
    ev('takeoff', '09:35', { method: 'auto' }),
    ev('landing', '10:22', { method: 'auto' }),
    ev('engine_stop', '10:34', {}),

    // ── tankowanie: 112 +48 → 160 L ───────────────────────────────────────
    ev('refuel', '10:48', { beforeL: 112, addedL: 48, afterL: 160 }),

    // ── cykl 2 (blok 1:13) ────────────────────────────────────────────────
    ev('engine_start', '11:15', {}),
    ev('takeoff', '11:28', { method: 'auto' }),
    ev('landing', '12:15', { method: 'auto' }),
    ev('engine_stop', '12:28', {}),

    // ── cykl 3 (blok 3:04) — popołudnie skokowe ───────────────────────────
    ev('engine_start', '13:10', {}),
    ev('takeoff', '13:24', { method: 'auto' }),
    ev('drop', '13:48', {
      dropNumber: 1,
      altitudeFt: 2450,
      jumpers: { tandem: 2, aff: 1, solo: 1 },
    }),
    ev('landing', '14:08', { method: 'auto' }),
    ev('takeoff', '14:21', { method: 'auto' }),
    ev('drop', '14:42', {
      dropNumber: 2,
      altitudeFt: 1800,
      jumpers: { tandem: 1, aff: 0, solo: 3 },
    }),
    ev('landing', '15:03', { method: 'manual' }),
    ev('takeoff', '15:17', { method: 'auto' }),
    ev('drop', '15:45', {
      dropNumber: 3,
      altitudeFt: 3200,
      jumpers: { tandem: 3, aff: 2, solo: 0 },
    }),
    ev('landing', '16:10', { method: 'auto' }),
    ev('engine_stop', '16:14', {}),

    ev('day_close', '16:45', {
      finalReading: { fuelL: 88, mh: mh('1241:09') },
      dutyEnd: at('16:45'),
    }),
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

describe('projectSession — kanoniczny dzień 22 JUNE (zgodność z design-notes)', () => {
  const s = projectSession(canonicalDay());

  it('block time = 6:39 (suma trzech cykli 2:22 + 1:13 + 3:04)', () => {
    expect(s.blockTimeMs).toBe(399 * MIN);
    expect(s.legs).toHaveLength(3);
    expect(s.legs.map((r) => r.durationMs)).toEqual([
      142 * MIN,
      73 * MIN,
      184 * MIN,
    ]);
  });

  it('6 lotów i liczniki 6/6', () => {
    expect(s.flights).toHaveLength(6);
    expect(s.takeoffCount).toBe(6);
    expect(s.landingCount).toBe(6);
  });

  it('paliwo: 150 +48 −110 = 88 L', () => {
    expect(s.fuel.startL).toBe(150);
    expect(s.fuel.addedL).toBe(48);
    expect(s.fuel.endL).toBe(88);
    expect(s.fuel.consumedL).toBe(110);
  });

  it('łańcuch MH: 1234:30 → 1241:09, delta = block time', () => {
    expect(s.mh.start).toBeCloseTo(mh('1234:30'), 5);
    expect(s.mh.end).toBeCloseTo(mh('1241:09'), 5);
    // Δ MH (6.65 h) musi się zgadzać z block time (6:39) — inwariant łańcucha (§4.5).
    expect(s.mh.deltaH).toBeCloseTo(6.65, 5);
    expect(s.mh.deltaH! * 60 * MIN).toBeCloseTo(s.blockTimeMs, 0);
  });

  it('zrzuty: 3 wyniesienia, 13 skoczków, średnia wysokość', () => {
    expect(s.drops.count).toBe(3);
    expect(s.drops.jumpers).toEqual({ tandem: 6, aff: 3, solo: 4 });
    expect(s.drops.totalJumpers).toBe(13);
    // Suma i licznik wysokości jadą OSOBNO (panel A10 składa z nich średnią zakresu —
    // średnich per sesja nie da się składać), a średnia sesji jest z nich pochodną.
    expect(s.drops.altitudeSumFt).toBe(2450 + 1800 + 3200);
    expect(s.drops.altitudeFixCount).toBe(3);
    expect(s.drops.avgAltitudeFt).toBeCloseTo((2450 + 1800 + 3200) / 3, 5);
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

  it('kontekst dnia i zamknięcie', () => {
    expect(s.operation).toBe('skoki');
    expect(s.departureIcao).toBe('EPKK');
    expect(s.mhFormat).toBe('hhmm');
    expect(s.dutyStart).toBe(at('08:00'));
    expect(s.dutyEnd).toBe(at('16:45'));
    expect(s.closed).toBe(true);
    expect(s.engineRunning).toBe(false);
  });
});

describe('projectSession — notatka dnia (issue #14)', () => {
  it('notatka z preflightu wchodzi do projekcji', () => {
    const state = projectSession([
      ev('preflight_confirm', '08:00', {
        operation: 'skoki',
        dutyStart: at('08:00'),
        reading: { fuelL: 150, mh: 1234.5 },
        notes: 'Lot z uczniem\nDrugi zbiornik nie działa',
      }),
    ]);

    expect(state.notes).toBe('Lot z uczniem\nDrugi zbiornik nie działa');
  });

  it('dzień bez notatki ma `null`, a nie pusty napis — stare telefony jej nie wysyłają', () => {
    // Zdarzenie sprzed issue #14 nie ma pola `notes`; projekcja musi to znieść bez zmiany
    // znaczenia („nie napisano" to nie to samo co „napisano pustkę").
    expect(projectSession(canonicalDay()).notes).toBeNull();
  });
});

describe('projectSession — odporność', () => {
  it('kolejność wejścia nie zmienia wyniku (porządkowanie po czasie)', () => {
    const ordered = canonicalDay();
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

/**
 * Zamknięcie wzlotu (`leg_close`) — etap B przebudowy flow (`docs/_main.md.txt` §3.6).
 *
 * Jednostką potwierdzenia danych jest WZLOT, nie doba. Odczyt liczników jest w nim
 * OPCJONALNY (w serii skokowej nikt nie chodzi do licznika po każdym wzlocie), ale gdy
 * jest — jest pełnoprawnym odczytem paliwomierza, bo §4.1 pkt 5 stawia licznik fizyczny
 * nad naszą rachubą.
 *
 * Strażnikiem regresji dla starego strumienia jest CAŁA reszta tego pliku: buduje
 * zdarzenia `schemaVersion: 1` i sprawdza kanoniczny dzień 22 JUNE. Jeśli dołożenie
 * `leg_close` cokolwiek w nim ruszy, te testy upadną — o to chodzi.
 */
describe('projectSession — zamknięcie wzlotu (leg_close)', () => {
  it('odczyt z zamknięcia wzlotu staje się ostatnim znanym stanem paliwomierza', () => {
    const s = projectSession([
      ev('preflight_confirm', '08:00', {
        operation: 'skoki',
        dutyStart: at('08:00'),
        reading: { fuelL: 150, mh: mh('1234:30') },
      }),
      ...singleCycle(),
      ev('leg_close', '10:40', {
        legIndex: 1,
        reading: { fuelL: 128, mh: mh('1236:52') },
      }),
    ]);

    expect(s.fuel.lastReadingL).toBe(128);
  });

  it('wzlot zamknięty BEZ odczytu nie rusza stanu paliwomierza', () => {
    const withoutReading = projectSession([
      ev('preflight_confirm', '08:00', {
        operation: 'skoki',
        dutyStart: at('08:00'),
        reading: { fuelL: 150, mh: mh('1234:30') },
      }),
      ...singleCycle(),
      ev('leg_close', '10:40', { legIndex: 1 }),
    ]);

    // Brak odczytu to NIEWIEDZA, nie zero i nie „tyle samo co przed lotem" —
    // ostatnim znanym stanem zostaje odczyt z przejęcia.
    expect(withoutReading.fuel.lastReadingL).toBe(150);
  });

  it('liczy zamknięte wzloty niezależnie od tego, czy niosły odczyt', () => {
    const s = projectSession([
      ev('preflight_confirm', '08:00', {
        operation: 'skoki',
        dutyStart: at('08:00'),
        reading: { fuelL: 150, mh: mh('1234:30') },
      }),
      ...singleCycle(),
      ev('leg_close', '10:40', { legIndex: 1 }),
      ev('engine_start', '11:15', {}),
      ev('takeoff', '11:28', { method: 'auto' }),
      ev('landing', '12:15', { method: 'auto' }),
      ev('engine_stop', '12:28', {}),
      ev('leg_close', '12:30', { legIndex: 2, reading: { fuelL: 96, mh: mh('1238:05') } }),
    ]);

    expect(s.legs.filter((l) => l.confirmed)).toHaveLength(2);
    expect(s.fuel.lastReadingL).toBe(96);
  });
});

/**
 * Klamry służby są OPCJONALNE (§3.6a) — pilot nie deklaruje niczego, żeby polecieć.
 * Stare zdarzenia (`schemaVersion: 1`) zawsze je niosą i muszą projektować się tak samo.
 */
describe('projectSession — opcjonalne klamry służby', () => {
  it('preflight bez `dutyStart` nie ustawia klamry, ale ustawia odczyty', () => {
    const s = projectSession([
      ev('preflight_confirm', '08:00', {
        operation: 'ferry',
        reading: { fuelL: 96, mh: mh('1239:39') },
      }),
    ]);

    expect(s.dutyStart).toBeNull();
    expect(s.fuel.startL).toBe(96);
    expect(s.mh.start).toBeCloseTo(mh('1239:39'), 6);
  });

  it('zdanie samolotu bez `dutyEnd` domyka odczyty, nie klamrę', () => {
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

    expect(s.dutyEnd).toBeNull();
    expect(s.closed).toBe(true);
    expect(s.fuel.endL).toBe(62);
  });
});

/**
 * Wzlot jako byt (etap B2): `Leg` to cykl silnika RAZEM z jego potwierdzeniem.
 * Nie ma osobnej tablicy obok `legs` — wzlot i cykl to w tym modelu ten sam byt.
 */
describe('projectSession — wzlot jako byt (Leg)', () => {
  const dayStart = () =>
    ev('preflight_confirm', '08:00', {
      operation: 'skoki',
      reading: { fuelL: 150, mh: mh('1234:30') },
    });

  it('wzlot dostaje numer i startuje jako niepotwierdzony', () => {
    const s = projectSession([dayStart(), ...singleCycle()]);

    expect(s.legs).toHaveLength(1);
    expect(s.legs[0]!.index).toBe(1);
    expect(s.legs[0]!.confirmed).toBe(false);
    expect(s.legs[0]!.confirmedAt).toBeNull();
    expect(s.legs[0]!.reading).toBeNull();
  });

  it('potwierdzenie przypina się do wzlotu razem z odczytem i uwagą', () => {
    const s = projectSession([
      dayStart(),
      ...singleCycle(),
      ev('leg_close', '10:40', {
        legIndex: 1,
        reading: { fuelL: 128, mh: mh('1236:52') },
        notes: 'drugi zbiornik nie ciągnie',
      }),
    ]);

    const leg = s.legs[0]!;
    expect(leg.confirmed).toBe(true);
    expect(leg.confirmedAt).toBe(at('10:40'));
    expect(leg.reading).toEqual({ fuelL: 128, mh: mh('1236:52') });
    expect(leg.notes).toBe('drugi zbiornik nie ciągnie');
  });

  it('potwierdzenie trafia w NAJSTARSZY niepotwierdzony wzlot, nie w ostatni', () => {
    // Pilot pominął potwierdzenie pierwszego wzlotu („Potwierdzę później"), poleciał
    // drugi raz i dopiero wtedy potwierdził. Zaległy wzlot ma dostać to potwierdzenie
    // jako pierwszy — inaczej kolejka zaległości nigdy by się nie rozładowała.
    const s = projectSession([
      dayStart(),
      ...singleCycle(),
      ev('engine_start', '11:15', {}),
      ev('takeoff', '11:28', { method: 'auto' }),
      ev('landing', '12:15', { method: 'auto' }),
      ev('engine_stop', '12:28', {}),
      ev('leg_close', '12:30', { legIndex: 1 }),
    ]);

    expect(s.legs[0]!.confirmed).toBe(true);
    expect(s.legs[1]!.confirmed).toBe(false);
  });

  it('wzlot niepotwierdzony i tak wnosi czas blokowy — czasy są faktem z detekcji', () => {
    const s = projectSession([dayStart(), ...singleCycle()]);

    expect(s.legs[0]!.confirmed).toBe(false);
    expect(s.blockTimeMs).toBe(142 * MIN);
  });

  it('otwarty wzlot nie jest jeszcze kandydatem do potwierdzenia', () => {
    const s = projectSession([
      dayStart(),
      ev('engine_start', '08:12', {}),
      ev('leg_close', '08:20', { legIndex: 1 }),
    ]);

    // Reguły blokują ten zapis (LEG_CLOSE_ENGINE_RUNNING), ale projekcja musi być
    // totalna także dla strumienia, który jakimś cudem taki wpis zawiera.
    expect(s.legs[0]!.confirmed).toBe(false);
  });
});
