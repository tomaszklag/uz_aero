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
});

describe('projectSession — kanoniczny dzień 22 JUNE (zgodność z design-notes)', () => {
  const s = projectSession(canonicalDay());

  it('block time = 6:39 (suma trzech cykli 2:22 + 1:13 + 3:04)', () => {
    expect(s.blockTimeMs).toBe(399 * MIN);
    expect(s.engineRuns).toHaveLength(3);
    expect(s.engineRuns.map((r) => r.durationMs)).toEqual([
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
    expect(s.drops.avgAltitudeFt).toBeCloseTo((2450 + 1800 + 3200) / 3, 5);
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
