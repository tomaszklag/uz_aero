/**
 * UZ Aero — testy projekcji SŁUŻBY (`docs/_main.md.txt` §3.6a).
 *
 * Scenariusz odwzorowuje mockup `design/01-moj-dzien.html`, czyli te same liczby,
 * które widzi pilot:
 *   meldunek zadeklarowany 07:10 (poprawiony — pierwszy wzlot jest o 08:12)
 *   SP-AXA · Skoki:   wzlot 1  08:12→09:05 (blok 0:53, lot 0:41)
 *                     wzlot 2  10:20→11:02 (blok 0:42, lot 0:35)
 *   SP-KLM · Przelot: wzlot 3  13:40→15:10 (blok 1:30, lot 1:21)
 *   sumy doby: blok 3:05 · loty 2:37 · 3 st / 3 ldg
 *
 * Reguła, której pilnuje cały ten plik: **służba ⊇ suma wzlotów, zawsze.**
 */

import { projectDuty, utcDayStart, liveDutyMs, emptySessionState } from '../domain';
import type { SessionState, Leg, Flight } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0); // 06 SIE 2026
const PIC = 'tmk';
const MIN = 60_000;

function at(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h! * 60 + m!) * 60_000;
}

let legSeq = 0;

function leg(from: string, to: string | null, confirmed = true): Leg {
  return {
    index: ++legSeq,
    startedAt: at(from),
    stoppedAt: to == null ? null : at(to),
    durationMs: to == null ? 0 : at(to) - at(from),
    confirmed,
    confirmedAt: to == null || !confirmed ? null : at(to),
    reading: null,
    notes: null,
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

/** Sesja samolotu — tylko pola, których projekcja służby faktycznie używa. */
function session(over: Partial<SessionState>): SessionState {
  return { ...emptySessionState(), sessionUuid: 's', sessionPicId: PIC, ...over };
}

/** SP-AXA: dwa wzloty skokowe, klamra zadeklarowana na 07:10. */
function axa(): SessionState {
  return session({
    sessionUuid: 's-axa',
    aircraftId: 'sp-axa',
    dutyStart: at('07:10'),
    legs: [leg('08:12', '09:05'), leg('10:20', '11:02')],
    flights: [flight('08:20', '09:01'), flight('10:26', '11:01')],
  });
}

/** SP-KLM: jeden wzlot przelotowy, bez deklaracji klamry. */
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

describe('projectDuty — jedna służba, dwa samoloty (scenariusz 01)', () => {
  const duty = () => projectDuty([axa(), klm()], PIC, DAY0);

  it('składa wzloty z OBU maszyn w jedną oś, uporządkowaną w czasie', () => {
    const d = duty();

    expect(d.legs).toHaveLength(3);
    expect(d.legs.map((l) => l.aircraftId)).toEqual(['sp-axa', 'sp-axa', 'sp-klm']);
    // Numeracja biegnie ciągiem przez maszyny — tak, jak numeruje ekran 01.
    expect(d.legs.map((l) => l.index)).toEqual([1, 2, 3]);
    expect(d.aircraftIds).toEqual(['sp-axa', 'sp-klm']);
  });

  it('sumy doby zgadzają się z mockupem: blok 3:05, loty 2:37, 3 st / 3 ldg', () => {
    const d = duty();

    expect(d.blockTimeMs).toBe((3 * 60 + 5) * MIN);
    expect(d.flightTimeMs).toBe((2 * 60 + 37) * MIN);
    expect(d.takeoffCount).toBe(3);
    expect(d.landingCount).toBe(3);
  });

  it('klamra bierze deklarację 07:10, bo jest WCZEŚNIEJSZA niż pierwszy wzlot', () => {
    const d = duty();

    expect(d.startAt).toBe(at('07:10'));
    expect(d.declaredStart).toBe(at('07:10'));
    expect(d.endAt).toBe(at('15:10')); // brak deklaracji końca → ostatni wzlot
    expect(d.durationMs).toBe((8 * 60) * MIN); // 07:10 → 15:10
  });

  it('czas lotu przypisuje się do wzlotu, w którym lot się zaczął', () => {
    const d = duty();

    expect(d.legs[0]!.flightMs).toBe(41 * MIN);
    expect(d.legs[1]!.flightMs).toBe(35 * MIN);
    expect(d.legs[2]!.flightMs).toBe(81 * MIN);
  });
});

describe('projectDuty — klamra jest KLAMRĄ (służba ⊇ suma wzlotów)', () => {
  it('deklaracja PÓŹNIEJSZA niż pierwszy wzlot nie zawęża klamry, ale zostaje oznaczona', () => {
    // Pilot wpisał meldunek 09:00, choć poleciał o 08:12. Lot jest faktem,
    // deklaracja opisem — klamra musi objąć lot.
    const s = session({
      aircraftId: 'sp-axa',
      dutyStart: at('09:00'),
      legs: [leg('08:12', '09:05')],
    });

    const d = projectDuty([s], PIC, DAY0);

    expect(d.startAt).toBe(at('08:12'));
    expect(d.declaredStart).toBe(at('09:00'));
    expect(d.declarationNarrowsStart).toBe(true);
  });

  it('deklaracja WCZEŚNIEJSZA niż ostatni wzlot nie ucina końca służby', () => {
    const s = session({
      aircraftId: 'sp-axa',
      dutyEnd: at('14:00'),
      legs: [leg('08:12', '15:10')],
    });

    const d = projectDuty([s], PIC, DAY0);

    expect(d.endAt).toBe(at('15:10'));
    expect(d.declarationNarrowsEnd).toBe(true);
  });

  it('deklaracja rozszerzająca wygrywa w obie strony', () => {
    const s = session({
      aircraftId: 'sp-axa',
      dutyStart: at('06:00'),
      dutyEnd: at('18:30'),
      legs: [leg('08:12', '09:05')],
    });

    const d = projectDuty([s], PIC, DAY0);

    expect(d.startAt).toBe(at('06:00'));
    expect(d.endAt).toBe(at('18:30'));
    expect(d.declarationNarrowsStart).toBe(false);
    expect(d.declarationNarrowsEnd).toBe(false);
  });
});

describe('projectDuty — służba w toku i dzień pusty', () => {
  it('otwarty wzlot trzyma służbę otwartą (endAt null, brak długości)', () => {
    const s = session({ aircraftId: 'sp-axa', legs: [leg('08:12', null)] });

    const d = projectDuty([s], PIC, DAY0);

    expect(d.startAt).toBe(at('08:12'));
    expect(d.endAt).toBeNull();
    expect(d.durationMs).toBeNull();
  });

  it('`liveDutyMs` liczy trwającą służbę do `now`, zamkniętą oddaje bez zmian', () => {
    const open = projectDuty([session({ aircraftId: 'a', legs: [leg('08:12', null)] })], PIC, DAY0);
    expect(liveDutyMs(open, at('09:12'))).toBe(60 * MIN);

    const closed = projectDuty([axa(), klm()], PIC, DAY0);
    expect(liveDutyMs(closed, at('20:00'))).toBe(closed.durationMs);
  });

  it('doba bez wzlotów i bez deklaracji jest pusta, a nie zerowa', () => {
    const d = projectDuty([], PIC, DAY0);

    // `null`, nie `0` — brak służby to niewiedza, nie wynik (ta sama zasada
    // co „— —" zamiast zer na ekranie 01A).
    expect(d.startAt).toBeNull();
    expect(d.durationMs).toBeNull();
    expect(d.legs).toHaveLength(0);
  });

  it('sama deklaracja bez wzlotu otwiera służbę — pilot był na miejscu', () => {
    const s = session({ aircraftId: 'sp-axa', dutyStart: at('07:10') });

    const d = projectDuty([s], PIC, DAY0);

    expect(d.startAt).toBe(at('07:10'));
    expect(d.legs).toHaveLength(0);
  });
});

describe('projectDuty — granice doby i cudze sesje', () => {
  it('odrzuca sesje prowadzone przez INNEGO pilota', () => {
    const foreign = session({ sessionPicId: 'krz', aircraftId: 'sp-fgk', legs: [leg('08:12', '09:05')] });

    const d = projectDuty([axa(), foreign], PIC, DAY0);

    expect(d.legs.every((l) => l.aircraftId === 'sp-axa')).toBe(true);
  });

  it('wzlot rozpoczęty przed północą należy do doby, w której WYSTARTOWAŁ', () => {
    // Wzlot 23:50 → 00:20 następnej doby. Gdyby przynależność szła po czasie
    // zamknięcia, jeden lot rozpadłby się na dwie służby — czyli dokładnie problem,
    // który ta przebudowa usuwa.
    const s = session({
      aircraftId: 'sp-axa',
      legs: [
        {
          index: 1,
          startedAt: DAY0 + (23 * 60 + 50) * MIN,
          stoppedAt: DAY0 + (24 * 60 + 20) * MIN,
          durationMs: 30 * MIN,
          confirmed: true,
          confirmedAt: DAY0 + (24 * 60 + 20) * MIN,
          reading: null,
          notes: null,
        },
      ],
    });

    const today = projectDuty([s], PIC, DAY0);
    const tomorrow = projectDuty([s], PIC, DAY0 + 86_400_000);

    expect(today.legs).toHaveLength(1);
    expect(today.blockTimeMs).toBe(30 * MIN);
    expect(tomorrow.legs).toHaveLength(0);
  });

  it('`utcDayStart` sprowadza dowolny moment doby do jej północy', () => {
    expect(utcDayStart(at('13:40'))).toBe(DAY0);
    expect(utcDayStart(DAY0)).toBe(DAY0);
    expect(utcDayStart(DAY0 + 86_399_999)).toBe(DAY0);
  });
});

describe('projectDuty — wzloty niepotwierdzone', () => {
  it('liczy zaległe potwierdzenia, ale wlicza je do sum', () => {
    const s = session({
      aircraftId: 'sp-axa',
      legs: [leg('08:12', '09:05', true), leg('10:20', '11:02', false)],
    });

    const d = projectDuty([s], PIC, DAY0);

    expect(d.unconfirmedLegCount).toBe(1);
    // Czasy są faktem z detekcji — brak potwierdzenia niczego nie odejmuje.
    expect(d.blockTimeMs).toBe((53 + 42) * MIN);
  });
});
