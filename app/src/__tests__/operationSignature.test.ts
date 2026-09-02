/**
 * UZ Aero - testy SYGNATURY OPERACJI LOTNICZEJ (issue #68).
 *
 * Dwie rzeczy pod obserwacją i obie są umowami między odległymi miejscami kodu:
 *  1. **numer w sygnaturze = numer na kafelku 01** - `operationIndexes` i
 *     `projectPilotDay` muszą wyprodukować ten sam ciąg. Rozjazd byłby widoczny
 *     wprost: „OPERACJA 2" nad sygnaturą kończącą się na „/3";
 *  2. **kompletność** - sygnatura albo składa się z czterech członów, albo nie ma jej
 *     wcale. Napis z kreską zamiast pilota wygląda jak identyfikator i nim nie jest.
 */

import {
  emptySessionState,
  operationDate,
  operationIndexes,
  operationSignature,
  projectPilotDay,
  utcDayStart,
} from '../domain';
import type { Leg, SessionState } from '../domain';

const DAY0 = Date.UTC(2026, 8, 1, 0, 0, 0); // 01 WRZ 2026
const PIC = 'tmk';

const at = (hhmm: string, day = DAY0): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return day + (h! * 60 + m!) * 60_000;
};

let legSeq = 0;
const leg = (from: string, to: string, day = DAY0): Leg => ({
  index: ++legSeq,
  startedAt: at(from, day),
  stoppedAt: at(to, day),
  durationMs: at(to, day) - at(from, day),
});

const session = (over: Partial<SessionState>): SessionState => ({
  ...emptySessionState(),
  sessionUuid: 's',
  sessionPicId: PIC,
  ...over,
});

describe('operationDate', () => {
  it('podaje dobę UTC operacji, nie lokalną', () => {
    // 23:40 UTC 01 WRZ jest już 02 WRZ w Warszawie - sygnatura ma nieść UTC.
    expect(operationDate(at('23:40'))).toBe('2026-09-01');
  });
});

describe('operationSignature', () => {
  const parts = { reg: 'SP-AXA', startedAt: at('08:12'), picCode: 'AKO', index: 1 };

  it('składa cztery człony w kolejności znak → doba → PIC → numer', () => {
    expect(operationSignature(parts)).toBe('SP-AXA/2026-09-01/AKO/1');
  });

  it('podnosi znak i kod pilota do wersalików', () => {
    expect(operationSignature({ ...parts, reg: 'sp-axa', picCode: 'ako' })).toBe(
      'SP-AXA/2026-09-01/AKO/1',
    );
  });

  it.each([
    ['bez znaku maszyny', { reg: null }],
    ['ze znakiem pustym', { reg: '' }],
    ['bez uruchomienia silnika', { startedAt: null }],
    ['bez kodu pilota', { picCode: null }],
    ['bez numeru w dobie', { index: null }],
  ])('nie składa sygnatury %s', (_name, missing) => {
    expect(operationSignature({ ...parts, ...missing })).toBeNull();
  });
});

describe('operationIndexes', () => {
  const axa = session({
    sessionUuid: 's-axa',
    aircraftId: 'sp-axa',
    legs: [leg('08:12', '09:05')],
  });
  const klm = session({
    sessionUuid: 's-klm',
    aircraftId: 'sp-klm',
    legs: [leg('13:40', '15:10')],
  });

  it('numeruje ciągiem przez maszyny, w kolejności uruchomienia silnika', () => {
    // Kolejność wejścia odwrócona celowo: numeruje CZAS, nie kolejność w tablicy.
    const indexes = operationIndexes([klm, axa], PIC);
    expect(indexes.get('s-axa')).toBe(1);
    expect(indexes.get('s-klm')).toBe(2);
  });

  it('numeruje każdą dobę od nowa', () => {
    const nextDay = session({
      sessionUuid: 's-next',
      aircraftId: 'sp-axa',
      legs: [leg('07:00', '08:00', DAY0 + 86_400_000)],
    });
    expect(operationIndexes([axa, klm, nextDay], PIC).get('s-next')).toBe(1);
  });

  it('pomija operacje unieważnione, cudze i zapisy bez biegu i bez treści', () => {
    const voided = session({ sessionUuid: 's-void', legs: [leg('06:00', '07:00')], voided: true });
    const foreign = session({
      sessionUuid: 's-foreign',
      sessionPicId: 'ktos-inny',
      legs: [leg('06:30', '07:30')],
    });
    // 09C bez odczytów w strumieniu: treści nie da się orzec - numeru nie ma.
    const noRun = session({ sessionUuid: 's-09c', claimedAt: at('06:45'), closed: true });

    const indexes = operationIndexes([voided, foreign, noRun, axa], PIC);
    expect(indexes.get('s-void')).toBeUndefined();
    expect(indexes.get('s-foreign')).toBeUndefined();
    expect(indexes.get('s-09c')).toBeUndefined();
    // Pominięte nie zajmują numeru - pierwsza operacja doby zostaje pierwszą.
    expect(indexes.get('s-axa')).toBe(1);
  });

  /* ── issue #75 pkt 3: zapis bez biegu, ale ze ZMIANĄ, dostaje numer ────────── */

  const changedNoRun = session({
    sessionUuid: 's-changed',
    aircraftId: 'sp-fgk',
    claimedAt: at('06:45'),
    closed: true,
    closedAt: at('07:50'),
    fuel: { startL: 240, addedL: 0, endL: 236, consumedL: 4, lastReadingL: 236 },
    mh: { start: 2815.2, end: 2815.2, deltaH: 0 },
  });

  it('zapis bez biegu ze zmienionym odczytem dostaje numer - kotwicą jest przejęcie', () => {
    const indexes = operationIndexes([axa, changedNoRun], PIC);
    // Przejęcie 06:45 wyprzedza uruchomienie 08:12, więc zmiana jest pierwsza.
    expect(indexes.get('s-changed')).toBe(1);
    expect(indexes.get('s-axa')).toBe(2);
  });

  it('zapis pusty (komplet równych odczytów) numeru nie dostaje i go nie zajmuje', () => {
    const empty = session({
      sessionUuid: 's-empty',
      claimedAt: at('06:00'),
      closed: true,
      closedAt: at('06:30'),
      fuel: { startL: 240, addedL: 0, endL: 240, consumedL: 0, lastReadingL: 240 },
      mh: { start: 2815.2, end: 2815.2, deltaH: 0 },
    });
    const indexes = operationIndexes([empty, axa], PIC);
    expect(indexes.get('s-empty')).toBeUndefined();
    expect(indexes.get('s-axa')).toBe(1);
  });

  it('daje ten sam numer, co kafelek „OPERACJA n" na ekranie 01', () => {
    // Z operacją bez biegu w zestawie - obie listy muszą ją widzieć tak samo.
    const sessions = [klm, axa, changedNoRun];
    const indexes = operationIndexes(sessions, PIC);
    const day = projectPilotDay(sessions, PIC, utcDayStart(DAY0));

    expect(day.sessions.map((s) => [s.sessionUuid, s.index])).toEqual([
      ['s-changed', indexes.get('s-changed')],
      ['s-axa', indexes.get('s-axa')],
      ['s-klm', indexes.get('s-klm')],
    ]);
  });
});
