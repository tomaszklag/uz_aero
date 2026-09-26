/**
 * Ninerdeck - testy WIERSZY „Obserwowane samoloty" (13C, obserwowanie 3.2.0).
 *
 * Pod obserwacją: podpis stanu „teraz" w tonie stanu, „Ty" dla patrzącego, termin
 * dobą klubu, maszyna wycofana wygrywa z każdym stanem.
 */

import type { RemoteWatchList } from '../application';
import { watchRows } from '../ui/screens/logic/watchList';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';

const H = 3_600_000;
const DAY = 24 * H;
// Piątek 25 września 2026, 09:54 UTC; doba klubu (UTC+2) zaczęła się 24.09 22:00Z.
const NOW = Date.UTC(2026, 8, 25, 9, 54);
const TODAY = Date.parse('2026-09-24T22:00:00Z');
const iso = (t: number): string => new Date(t).toISOString();

const dayAt = (at: number): ClubDayBounds => {
  const shift = Math.floor((at - TODAY) / DAY) * DAY;
  return { date: new Date(TODAY + shift + 2 * H).toISOString().slice(0, 10), startsAt: TODAY + shift, endsAt: TODAY + shift + DAY };
};
const opts = { now: NOW, pilotId: 'me', shortNameOf: (id: string) => ({ ako: 'A. Kowalski' })[id] ?? null, dayAt };

function list(items: RemoteWatchList['items']): RemoteWatchList {
  return { timezone: 'Europe/Warsaw', viewer: { watch: true }, items };
}

describe('wiersze listy obserwowanych', () => {
  it('stan „teraz" jednym zdaniem w tonie stanu; przełącznik z odpowiedzi', () => {
    const rows = watchRows(
      list([
        { aircraftId: 'a1', reg: 'SP-AXA', type: 'C172', serviceStatus: 'active', watching: true, now: { kind: 'flying', sessionUuid: 's', pilotId: 'ako', dualId: null, operation: 'skoki', departureIcao: null, since: iso(Date.UTC(2026, 8, 25, 8, 12)) } },
        { aircraftId: 'a2', reg: 'SP-BKL', type: 'PA-28', serviceStatus: 'active', watching: true, now: { kind: 'free', next: { bookingId: 'b', kind: 'flight', startsAt: iso(TODAY + 14 * H) } } },
        { aircraftId: 'a3', reg: 'SP-DKM', type: 'C152', serviceStatus: 'active', watching: false, now: { kind: 'free', next: null } },
        { aircraftId: 'a4', reg: 'SP-ELG', type: 'Aquila', serviceStatus: 'active', watching: false, now: { kind: 'free', next: { bookingId: 'b2', kind: 'flight', startsAt: iso(TODAY + DAY + 9 * H) } } },
        { aircraftId: 'a5', reg: 'SP-CDR', type: 'AN-2', serviceStatus: 'active', watching: true, now: { kind: 'blocked', bookingId: 'blk', reason: 'maintenance', until: iso(TODAY + 7 * DAY + 18 * H) } },
        { aircraftId: 'a6', reg: 'SP-FGK', type: 'C182', serviceStatus: 'active', watching: false, now: { kind: 'booked', bookingId: 'b3', pilotId: 'me', startsAt: iso(NOW - H), endsAt: iso(NOW + H) } },
      ]),
      opts,
    );
    expect(rows.map((r) => [r.reg, r.sub, r.tone, r.on])).toEqual([
      ['SP-AXA', 'W locie · A. Kowalski · od 08:12 UTC', 'green', true],
      ['SP-BKL', 'Wolna · następny termin dziś 14:00', null, true],
      ['SP-DKM', 'Wolna', null, false],
      ['SP-ELG', 'Wolna · następny termin jutro 09:00', null, false],
      ['SP-CDR', 'Wyłączona z użytku · przegląd do 02 PAŹ', 'amber', true],
      ['SP-FGK', 'Zarezerwowana · Ty', null, false],
    ]);
  });

  it('maszyna wycofana z floty mówi to niezależnie od rejestru', () => {
    const [row] = watchRows(
      list([{ aircraftId: 'a1', reg: 'SP-AXA', type: 'C172', serviceStatus: 'disabled', watching: true, now: { kind: 'free', next: null } }]),
      opts,
    );
    expect(row).toMatchObject({ sub: 'Wycofana z użytku', tone: 'amber' });
  });
});
