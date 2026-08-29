/**
 * UZ Aero - testy projekcji DNIA PILOTA (`docs/_main.md.txt` §3.6, model po issue #23).
 *
 * Scenariusz odwzorowuje mockup `design/01-moj-dzien.html`, czyli te same liczby,
 * które widzi pilot:
 *   SP-AXA: sesja 1  08:12→09:05 (blok 0:53, lot 0:41)
 *           sesja 2  10:20→11:02 (blok 0:42, lot 0:35)
 *   SP-KLM: sesja 3  13:40→15:10 (blok 1:30, lot 1:21)
 *   sumy doby: blok 3:05 · loty 2:37 · 3 st / 3 ldg
 *
 * Reguła, której pilnuje cały ten plik: **dzień pilota = lista sesji doby, płaska oś
 * czasu przez maszyny.** Klamra służby (deklaracje, startAt/endAt, durationMs) żyła
 * w tej projekcji do 2026-08-11 i została usunięta razem z modelem (issue #23).
 */

import { projectPilotDay, utcDayStart, emptySessionState } from '../domain';
import type { SessionState, Leg, Flight } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0); // 06 SIE 2026
const PIC = 'tmk';
const MIN = 60_000;

function at(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h! * 60 + m!) * 60_000;
}

let legSeq = 0;

function leg(from: string, to: string | null): Leg {
  return {
    index: ++legSeq,
    startedAt: at(from),
    stoppedAt: to == null ? null : at(to),
    durationMs: to == null ? 0 : at(to) - at(from),
  };
}

let flightSeq = 0;

function flight(from: string, to: string): Flight {
  const i = ++flightSeq;
  return {
    index: i,
    method: 'auto',
    takeoffAt: at(from),
    landingAt: at(to),
    durationMs: at(to) - at(from),
    takeoffUuid: `t-${i}`,
    landingUuid: `l-${i}`,
  };
}

/** Sesja samolotu - tylko pola, których projekcja dnia faktycznie używa. */
function session(over: Partial<SessionState>): SessionState {
  return { ...emptySessionState(), sessionUuid: 's', sessionPicId: PIC, ...over };
}

/** SP-AXA: dwie sesje skokowe. */
function axa(): SessionState {
  return session({
    sessionUuid: 's-axa',
    aircraftId: 'sp-axa',
    legs: [leg('08:12', '09:05'), leg('10:20', '11:02')],
    flights: [flight('08:20', '09:01'), flight('10:26', '11:01')],
  });
}

/** SP-KLM: jedna sesja przelotowa. */
function klm(): SessionState {
  return session({
    sessionUuid: 's-klm',
    aircraftId: 'sp-klm',
    legs: [leg('13:40', '15:10')],
    flights: [flight('13:47', '15:08')],
  });
}

beforeEach(() => {
  legSeq = 0;
  flightSeq = 0;
});

describe('projectPilotDay - jeden dzień, dwa samoloty (scenariusz 01)', () => {
  const day = () => projectPilotDay([axa(), klm()], PIC, DAY0);

  it('składa sesje z OBU maszyn w jedną płaską oś, uporządkowaną w czasie', () => {
    const d = day();

    expect(d.sessions).toHaveLength(3);
    expect(d.sessions.map((x) => x.aircraftId)).toEqual(['sp-axa', 'sp-axa', 'sp-klm']);
    // Numeracja biegnie ciągiem przez maszyny - tak, jak numeruje ekran 01.
    expect(d.sessions.map((x) => x.index)).toEqual([1, 2, 3]);
    expect(d.aircraftIds).toEqual(['sp-axa', 'sp-klm']);
  });

  it('sumy doby zgadzają się z mockupem: blok 3:05, loty 2:37, 3 st / 3 ldg', () => {
    const d = day();

    expect(d.blockTimeMs).toBe((3 * 60 + 5) * MIN);
    expect(d.flightTimeMs).toBe((2 * 60 + 37) * MIN);
    expect(d.takeoffCount).toBe(3);
    expect(d.landingCount).toBe(3);
  });

  it('czas lotu przypisuje się do sesji, w której lot się zaczął', () => {
    const d = day();

    expect(d.sessions[0]!.flightMs).toBe(41 * MIN);
    expect(d.sessions[1]!.flightMs).toBe(35 * MIN);
    expect(d.sessions[2]!.flightMs).toBe(81 * MIN);
  });
});

describe('projectPilotDay - sesja w toku i dzień pusty', () => {
  it('otwarty bieg jest wierszem z `stoppedAt: null`, nie dziurą na liście', () => {
    const s = session({ aircraftId: 'sp-axa', legs: [leg('08:12', null)] });

    const d = projectPilotDay([s], PIC, DAY0);

    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0]!.stoppedAt).toBeNull();
    expect(d.sessions[0]!.blockMs).toBe(0);
  });

  it('doba bez sesji jest pusta, a nie zerowa', () => {
    const d = projectPilotDay([], PIC, DAY0);

    expect(d.sessions).toHaveLength(0);
    expect(d.aircraftIds).toHaveLength(0);
    expect(d.blockTimeMs).toBe(0);
  });
});

describe('projectPilotDay - granice doby i cudze sesje', () => {
  it('odrzuca sesje prowadzone przez INNEGO pilota', () => {
    const foreign = session({ sessionPicId: 'krz', aircraftId: 'sp-fgk', legs: [leg('08:12', '09:05')] });

    const d = projectPilotDay([axa(), foreign], PIC, DAY0);

    expect(d.sessions.every((x) => x.aircraftId === 'sp-axa')).toBe(true);
  });

  it('sesja rozpoczęta przed północą należy do doby, w której WYSTARTOWAŁA', () => {
    // Bieg 23:50 → 00:20 następnej doby. Gdyby przynależność szła po czasie
    // zamknięcia, jeden lot rozpadłby się na dwa dni - czyli dokładnie problem,
    // który przebudowa flow usunęła.
    const s = session({
      aircraftId: 'sp-axa',
      legs: [
        {
          index: 1,
          startedAt: DAY0 + (23 * 60 + 50) * MIN,
          stoppedAt: DAY0 + (24 * 60 + 20) * MIN,
          durationMs: 30 * MIN,
        },
      ],
    });

    const today = projectPilotDay([s], PIC, DAY0);
    const tomorrow = projectPilotDay([s], PIC, DAY0 + 86_400_000);

    expect(today.sessions).toHaveLength(1);
    expect(today.blockTimeMs).toBe(30 * MIN);
    expect(tomorrow.sessions).toHaveLength(0);
  });

  it('`utcDayStart` sprowadza dowolny moment doby do jej północy', () => {
    expect(utcDayStart(at('13:40'))).toBe(DAY0);
    expect(utcDayStart(DAY0)).toBe(DAY0);
    expect(utcDayStart(DAY0 + 86_399_999)).toBe(DAY0);
  });
});

describe('projectPilotDay - liczba lotów sesji (kolumna „Loty" na 01)', () => {
  it('zlicza loty, które zaczęły się wewnątrz biegu', () => {
    const s = session({
      aircraftId: 'sp-axa',
      legs: [leg('08:12', '09:05')],
      flights: [flight('08:20', '08:41'), flight('08:47', '09:01')],
    });

    const d = projectPilotDay([s], PIC, DAY0);

    expect(d.sessions[0]!.flightCount).toBe(2);
    expect(d.blockTimeMs).toBe(53 * MIN);
  });
});
