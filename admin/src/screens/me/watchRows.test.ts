import { describe, expect, it } from 'vitest';

import type { AircraftNowDto, WatchListDto } from '../../api/dto';
import type { Person } from '../calendar/bookingLabels';
import { nowLine, termMoment, untilMoment, watchRows } from './watchRows';

const TZ = 'Europe/Warsaw';
// Czwartek 24 września 2026, 10:00 czasu klubu (08:00 UTC).
const NOW = Date.UTC(2026, 8, 24, 8, 0);
const H = 3_600_000;
const iso = (t: number): string => new Date(t).toISOString();

const PEOPLE: Readonly<Record<string, Person>> = {
  jno: { name: 'Jan Nowak', code: 'JNO' },
  ako: { name: 'Adam Kowalski', code: 'AKO' },
};
const opts = { person: (id: string): Person | null => PEOPLE[id] ?? null, me: 'ako', now: NOW };

const held = (
  kind: 'flying' | 'claimed' | 'after_flight',
  pilotId: string,
  since: number | null,
): AircraftNowDto => ({
  kind,
  sessionUuid: 's-1',
  pilotId,
  dualId: null,
  operation: 'skoki',
  departureIcao: 'EPZG',
  since: since == null ? null : iso(since),
});

describe('stan „teraz" jednym zdaniem - to samo brzmienie, co w ustawieniach telefonu', () => {
  it('operacja w toku: nagłówek stanu, osoba i chwila z rejestru w UTC', () => {
    expect(nowLine(held('flying', 'jno', Date.UTC(2026, 8, 24, 8, 12)), TZ, opts)).toBe(
      'W locie · J. Nowak · od 08:12 UTC',
    );
    expect(nowLine(held('after_flight', 'jno', Date.UTC(2026, 8, 24, 9, 40)), TZ, opts)).toBe(
      'Po locie · J. Nowak · od 09:40 UTC',
    );
  });

  it('zalogowany czyta się jako „Ty"; osoba spoza listy członków - milczeniem, nie identyfikatorem', () => {
    expect(nowLine(held('flying', 'ako', Date.UTC(2026, 8, 24, 8, 12)), TZ, opts)).toBe(
      'W locie · Ty · od 08:12 UTC',
    );
    expect(nowLine(held('claimed', 'nikt', null), TZ, opts)).toBe('Przejęta');
  });

  it('wyłączona z użytku: powód małą literą i koniec dobą klubu; powód „inny" nie powtarza nagłówka', () => {
    const dzis = {
      kind: 'blocked',
      bookingId: 'b-1',
      reason: 'maintenance',
      until: iso(Date.UTC(2026, 8, 24, 16, 0)),
    } as const;
    expect(nowLine(dzis, TZ, opts)).toBe('Wyłączona z użytku · przegląd · do 18:00');
    const pozniej = { ...dzis, reason: 'other', until: iso(Date.UTC(2026, 9, 2, 16, 0)) } as const;
    expect(nowLine(pozniej, TZ, opts)).toBe('Wyłączona z użytku · do 2 paź 18:00');
  });

  it('wolna: sam nagłówek albo następny termin dobą klubu („dziś", „jutro", data)', () => {
    expect(nowLine({ kind: 'free', next: null }, TZ, opts)).toBe('Wolna');
    const next = (startsAt: number, kind: 'flight' | 'block'): AircraftNowDto => ({
      kind: 'free',
      next: { bookingId: 'b-2', kind, startsAt: iso(startsAt) },
    });
    expect(nowLine(next(NOW + 4 * H, 'flight'), TZ, opts)).toBe('Wolna · następny termin dziś 14:00');
    expect(nowLine(next(NOW + 23 * H, 'block'), TZ, opts)).toBe('Wolna · wyłączenie jutro 09:00');
    expect(nowLine(next(Date.UTC(2026, 8, 26, 7, 0), 'flight'), TZ, opts)).toBe(
      'Wolna · następny termin 26 wrz 09:00',
    );
  });

  it('zarezerwowana i wycofana', () => {
    expect(
      nowLine(
        { kind: 'booked', bookingId: 'b-3', pilotId: 'jno', startsAt: iso(NOW - H), endsAt: iso(NOW + H) },
        TZ,
        opts,
      ),
    ).toBe('Zarezerwowana · J. Nowak');
    expect(nowLine({ kind: 'retired' }, TZ, opts)).toBe('Wycofana z użytku');
  });
});

describe('chwile terminów dobą klubu', () => {
  it('termMoment: dziś / jutro / data; untilMoment: sama godzina w tej dobie', () => {
    expect(termMoment(NOW + H, TZ, NOW)).toBe('dziś 11:00');
    expect(termMoment(NOW + 24 * H, TZ, NOW)).toBe('jutro 10:00');
    expect(termMoment(NOW + 48 * H, TZ, NOW)).toBe('26 wrz 10:00');
    expect(untilMoment(NOW + H, TZ, NOW)).toBe('do 11:00');
    expect(untilMoment(NOW + 24 * H, TZ, NOW)).toBe('do 25 wrz 10:00');
  });

  it('doba klubu, nie UTC: 23:30 czasu klubu jest jeszcze „dziś"', () => {
    // 21:30 UTC = 23:30 w Warszawie (CEST) - tej samej doby klubu, co NOW.
    expect(termMoment(Date.UTC(2026, 8, 24, 21, 30), TZ, NOW)).toBe('dziś 23:30');
  });
});

describe('wiersze karty', () => {
  it('nazwa = znak i typ, opis = stan, zaznaczenie = obserwuję; wycofana z floty mówi „wycofana" niezależnie od stanu', () => {
    const list: WatchListDto = {
      timezone: TZ,
      items: [
        {
          aircraftId: 'a-1',
          reg: 'SP-AXA',
          type: 'Cessna 172',
          serviceStatus: 'active',
          watching: true,
          now: held('flying', 'jno', Date.UTC(2026, 8, 24, 8, 12)),
        },
        {
          aircraftId: 'a-2',
          reg: 'SP-DKM',
          type: 'Cessna 152',
          serviceStatus: 'disabled',
          watching: false,
          now: { kind: 'free', next: null },
        },
      ],
    };
    expect(watchRows(list, opts)).toEqual([
      { aircraftId: 'a-1', name: 'SP-AXA · Cessna 172', desc: 'W locie · J. Nowak · od 08:12 UTC', on: true },
      { aircraftId: 'a-2', name: 'SP-DKM · Cessna 152', desc: 'Wycofana z użytku', on: false },
    ]);
  });
});
