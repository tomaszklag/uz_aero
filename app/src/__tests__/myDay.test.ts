/**
 * UZ Aero — model widoku ekranu 01 „Mój dzień" (issue #23).
 *
 * Scenariusz jest ten sam, co w `pilotDay.test.ts` i w mockupie
 * `design/01-moj-dzien.html`: SP-AXA (2 sesje) → SP-KLM (1 sesja), sumy 3:05 / 2:37.
 * Tu sprawdzamy WARSTWĘ NAPISÓW: czy ekran dostanie to, co pilot ma przeczytać.
 *
 * Najważniejsza własność pilnowana niżej: **lista jest PŁASKĄ osią czasu** — wiersz
 * niesie rejestrację jako informację (issue #23 pkt 3), a nie żyje w grupie per maszyna.
 * Klamra służby (BracketVm, `closeDayBlocker`, suma „Służba") żyła w tym module do
 * 2026-08-11 i została usunięta razem z modelem.
 */

import { buildMyDay, totalLabel } from '../ui/screens/logic/myDay';
import { projectPilotDay, emptySessionState } from '../domain';
import type { SessionState, Leg, Flight } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0);
const PIC = 'tmk';

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

function session(over: Partial<SessionState>): SessionState {
  return { ...emptySessionState(), sessionUuid: 's', sessionPicId: PIC, ...over };
}

const axa = (): SessionState =>
  session({
    sessionUuid: 's-axa',
    aircraftId: 'SP-AXA',
    legs: [leg('08:12', '09:05'), leg('10:20', '11:02')],
    flights: [flight('08:20', '09:01'), flight('10:26', '11:01')],
    closed: true,
    closedAt: at('11:20'),
  });

const klm = (): SessionState =>
  session({
    sessionUuid: 's-klm',
    aircraftId: 'SP-KLM',
    legs: [leg('13:40', '15:10')],
    flights: [flight('13:47', '15:08')],
  });

const dayOf = (...sessions: SessionState[]) => projectPilotDay(sessions, PIC, DAY0);

beforeEach(() => {
  legSeq = 0;
  flightSeq = 0;
});

describe('buildMyDay — scenariusz mockupu 01', () => {
  const vm = () => buildMyDay(dayOf(axa(), klm()));

  it('lista jest płaską osią czasu z rejestracją w wierszu — bez grupowania', () => {
    const rows = vm().sessions;

    expect(rows.map((r) => r.index)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.aircraftId)).toEqual(['SP-AXA', 'SP-AXA', 'SP-KLM']);
  });

  it('wiersz sesji niesie czasy, liczbę lotów i oba czasy trwania', () => {
    const row = vm().sessions[0]!;

    expect(row.times).toBe('08:12 → 09:05');
    expect(row.flightsLabel).toBe('1');
    expect(row.blockLabel).toBe('0:53');
    expect(row.flightLabel).toBe('0:41');
  });

  it('otwarty bieg pokazuje „→ …" zamiast udawać zakończony', () => {
    const open = session({ aircraftId: 'SP-KLM', legs: [leg('13:40', null)] });

    const rows = buildMyDay(dayOf(open)).sessions;

    expect(rows[0]!.times).toBe('13:40 → …');
  });

  it('sumy zgadzają się z mockupem: Blok i Loty, bez sumy „Służba"', () => {
    const t = vm().totals;

    expect(t.block).toBe('3:05');
    expect(t.flight).toBe('2:37');
    expect(t.takeoffs).toBe(3);
    expect(t.landings).toBe(3);
    expect(t.aircraftCount).toBe(2);
    // Klamra usunięta (issue #23): totals nie mają już pola `duty`.
    expect('duty' in t).toBe(false);
  });
});

describe('buildMyDay — dzień pusty (wariant 01A)', () => {
  it('pusta doba to `empty` z kreskami zamiast zer', () => {
    const vm = buildMyDay(dayOf());

    expect(vm.empty).toBe(true);
    expect(vm.sessionCount).toBe(0);
    expect(vm.totals.block).toBeNull();
    expect(vm.totals.flight).toBeNull();
    expect(totalLabel(vm.totals.block)).toBe('— —');
  });

  it('doba z sesją nie jest pusta', () => {
    const vm = buildMyDay(dayOf(axa()));

    expect(vm.empty).toBe(false);
    expect(vm.sessionCount).toBe(2);
  });
});
