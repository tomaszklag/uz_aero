import { describe, expect, it } from 'vitest';
import type { Event, SessionState } from '@ninerdeck/domain';

import type { RuleViolationDto, TimelineEntryDto } from '../../api/dto';
import {
  addEffectRows,
  addableTypes,
  correctedUuids,
  editTargetOf,
  historyOf,
  issueHints,
  issueLines,
  runHint,
  shiftHint,
  timeEffectRows,
  timeOnDay,
  voidLabelOf,
} from './sessionEdit';

const DAY = Date.UTC(2026, 8, 6);
const at = (h: number, m: number, s = 0): number => DAY + ((h * 60 + m) * 60 + s) * 1000;

function ev(uuid: string, type: Event['type'], t: number, payload: Record<string, unknown> = {}): Event {
  return {
    uuid,
    sessionUuid: 's-1',
    aircraftId: 'SP-AXA',
    picId: 'AKO',
    dualId: null,
    type,
    payload,
    deviceTime: t,
    gpsTime: t,
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

const entry = (event: Event, extra: Partial<TimelineEntryDto> = {}): TimelineEntryDto => ({
  event,
  voided: false,
  correctedTime: null,
  adminCorrected: false,
  adminAuthorId: null,
  ...extra,
});

/** Stan z DWOMA lotami - drugi bez lądowania. Liczby jak z projekcji, tu wpisane wprost. */
function state(over: Partial<SessionState> = {}): SessionState {
  return {
    legs: [{ index: 1, startedAt: at(8, 42), stoppedAt: at(11, 4), durationMs: 0 }],
    flights: [
      {
        index: 1,
        method: 'auto',
        takeoffAt: at(9, 1),
        landingAt: at(9, 17),
        durationMs: 16 * 60_000,
        takeoffUuid: 't1',
        landingUuid: 'l1',
      },
      {
        index: 2,
        method: 'auto',
        takeoffAt: at(9, 20),
        landingAt: null,
        durationMs: 0,
        takeoffUuid: 't2',
        landingUuid: null,
      },
    ],
    flightTimeMs: 16 * 60_000,
    blockTimeMs: 142 * 60_000,
    fuel: { startL: 185, addedL: 0, endL: 108, consumedL: 77, lastReadingL: 108 },
    mh: { start: 1236.5, end: 1238.87, deltaH: 2.37 },
    ...over,
  } as SessionState;
}

describe('który wiersz ma ołówek i jaką szufladę', () => {
  it('start i lądowanie: czas z numerem lotu; zrzut: własna szuflada z numerem', () => {
    const s = state();
    expect(editTargetOf(entry(ev('l1', 'landing', at(9, 17), { method: 'auto' })), s)).toMatchObject({
      kind: 'time',
      title: 'Lądowanie · lot 1',
      sub: 'zapis 09:17:00 UTC · automatycznie, GPS',
      canRetime: true,
      canVoid: true,
    });
    expect(editTargetOf(entry(ev('d1', 'drop', at(9, 12), { dropNumber: 2 })), s)).toMatchObject({
      kind: 'drop',
      title: 'Zrzut 2',
    });
  });

  it('przejęcie: sam czas bez kosza; zadanie i zdanie: odczyty bez czasu i bez kosza', () => {
    const s = state();
    expect(editTargetOf(entry(ev('c', 'session_claim', at(8, 31))), s)).toMatchObject({
      kind: 'time',
      canRetime: true,
      canVoid: false,
    });
    expect(editTargetOf(entry(ev('p', 'preflight_confirm', at(8, 33))), s)).toMatchObject({
      kind: 'reading',
      canRetime: false,
      canVoid: false,
    });
    expect(editTargetOf(entry(ev('z', 'day_close', at(11, 9))), s)).toMatchObject({
      kind: 'reading',
      title: 'Zdanie samolotu',
    });
  });

  it('korekta, unieważnienie i zakończenie operacji NIE mają ołówka', () => {
    const s = state();
    expect(editTargetOf(entry(ev('x', 'event_correction', at(12, 0))), s)).toBeNull();
    expect(editTargetOf(entry(ev('x', 'session_void', at(12, 0))), s)).toBeNull();
    expect(editTargetOf(entry(ev('x', 'session_close', at(12, 0))), s)).toBeNull();
  });

  it('wiersz unieważniony mówi to w podtytule', () => {
    const target = editTargetOf(entry(ev('l1', 'landing', at(9, 17), { method: 'manual' }), { voided: true }), state());
    expect(target?.sub).toBe('unieważnione · zapis 09:17:00 UTC · ręcznie');
  });

  it('kosz nazywa zdarzenie w dopełniaczu', () => {
    expect(voidLabelOf('landing')).toBe('Tego lądowania nie było');
    expect(voidLabelOf('oil_add')).toBe('Tej dolewki nie było');
    expect(voidLabelOf('day_close')).toBe('Tego zdarzenia nie było');
  });
});

describe('zegar: pole czasu na dobę operacji', () => {
  it('godzina z pola ląduje w dobie kotwicy, z sekundami albo bez', () => {
    expect(timeOnDay(at(9, 17), '10:14:40')).toBe(at(10, 14, 40));
    expect(timeOnDay(at(9, 17), '10:14')).toBe(at(10, 14));
  });

  it('operacja spod północy: godzina odległa o ponad pół doby przeskakuje na sąsiedni dzień', () => {
    const lateAnchor = at(23, 10);
    expect(timeOnDay(lateAnchor, '00:20:00')).toBe(at(24, 20));
    const earlyAnchor = at(0, 30);
    expect(timeOnDay(earlyAnchor, '23:50:00')).toBe(at(23, 50) - 24 * 3600 * 1000);
  });

  it('wpis nieczytelny to null, nie zero', () => {
    expect(timeOnDay(at(9, 0), '')).toBeNull();
    expect(timeOnDay(at(9, 0), '25:00')).toBeNull();
    expect(timeOnDay(at(9, 0), '9:5')).toBeNull();
  });

  it('podpis przesunięcia pojawia się TYLKO przy zmianie i mówi w godzinach, minutach, sekundach', () => {
    expect(shiftHint(at(10, 16, 22), at(10, 16, 22))).toBeNull();
    expect(shiftHint(at(10, 16, 22), at(10, 14, 40))).toBe('−1 min 42 s względem zapisu (10:16:22)');
    expect(shiftHint(at(10, 16, 22), at(11, 21, 22))).toBe('+1 h 5 min względem zapisu (10:16:22)');
  });
});

describe('niespójności: baner i podpis wiersza', () => {
  const issues: RuleViolationDto[] = [
    {
      code: 'FLIGHT_WITHOUT_LANDING',
      severity: 'warning',
      message: 'Lot 2 nie ma lądowania - start o 09:20, a silnik już nie pracuje.',
      details: { uuid: 't2', flight: 2 },
    },
    { code: 'NEW_CODE_FROM_FUTURE', severity: 'warning', message: 'Coś nowego.', details: { uuid: 'l1' } },
  ];

  it('baner: zdanie domeny plus instrukcja; kod nowszy niż słownik zostaje bez instrukcji', () => {
    expect(issueLines(issues)).toEqual([
      {
        message: 'Lot 2 nie ma lądowania - start o 09:20, a silnik już nie pracuje.',
        fix: 'Dopisz lądowanie ostatnim wierszem osi.',
      },
      { message: 'Coś nowego.', fix: null },
    ]);
  });

  it('podpis przypina się do wiersza po uuid; nieznany kod nie oznacza wiersza', () => {
    const hints = issueHints(issues);
    expect(hints.get('t2')).toBe('bez lądowania');
    expect(hints.has('l1')).toBe(false);
  });
});

describe('co wolno dopisać', () => {
  it('zrzut i załadunek WYŁĄCZNIE w dniu skokowym', () => {
    expect(addableTypes('skoki').map((t) => t.type)).toEqual([
      'takeoff',
      'landing',
      'taxi',
      'refuel',
      'drop',
      'boarding',
      'oil_add',
    ]);
    expect(addableTypes('ferry').map((t) => t.type)).toEqual(['takeoff', 'landing', 'taxi', 'refuel', 'oil_add']);
    expect(addableTypes(null)).toHaveLength(5);
  });

  it('podpis pod polem czasu mówi granice biegu, a przy silniku w pracy - od kiedy', () => {
    expect(runHint({ from: at(8, 42, 11), to: at(11, 4, 37) })).toBe(
      'W granicach biegu silnika: 08:42:11 – 11:04:37 UTC.',
    );
    expect(runHint({ from: at(8, 42, 11), to: null })).toBe('Silnik pracuje od 08:42:11 UTC.');
    expect(runHint(null)).toBeNull();
  });
});

describe('skutek przed → po - same pary, zero liczenia', () => {
  it('korekta czasu lądowania: czas lotu, czas w powietrzu, blok bez zmian', () => {
    const before = state();
    const after = state({ flightTimeMs: 14 * 60_000 });
    expect(timeEffectRows(before, after, 1)).toEqual([
      { label: 'Czas lotu 1', was: '0:16', now: '0:16', same: true },
      { label: 'Czas w powietrzu operacji', was: '0:16', now: '0:14', same: false },
      { label: 'Czas blokowy', was: '2:22', now: '2:22', same: true },
    ]);
  });

  it('dopisane lądowanie domyka lot i liczy niespójności 1 → 0', () => {
    const before = state();
    const after = state({
      flights: [
        before.flights[0]!,
        { ...before.flights[1]!, landingAt: at(9, 40), durationMs: 20 * 60_000, landingUuid: 'new' },
      ],
      flightTimeMs: 36 * 60_000,
    });
    const candidate = ev('new', 'landing', at(9, 40), { method: 'manual' });
    expect(addEffectRows(candidate, before, after, { before: 1, after: 0 })).toEqual([
      { label: 'Domyka lot', was: null, now: 'lot 2 · start 09:20:00', same: false },
      { label: 'Czas lotu 2', was: '—', now: '0:20', same: false },
      { label: 'Czas w powietrzu operacji', was: '0:16', now: '0:36', same: false },
      { label: 'Czas blokowy', was: '2:22', now: '2:22', same: true },
      { label: 'Niespójności', was: '1', now: '0', same: false },
    ]);
  });
});

describe('historia zmian celu', () => {
  const landing = ev('l1', 'landing', at(10, 16, 22), { method: 'auto' });
  const timeline: TimelineEntryDto[] = [
    entry(landing),
    entry(
      ev('c1', 'event_correction', at(11, 20), {
        targetUuid: 'l1',
        action: 'retime',
        newTime: at(10, 14, 40),
        reason: 'wg dziennika lotniska',
        source: 'admin',
      }),
      { adminAuthorId: 'AKO' },
    ),
    entry(ev('c2', 'event_correction', at(12, 0), { targetUuid: 'l1', action: 'void' })),
    entry(ev('c3', 'event_correction', at(12, 5), { targetUuid: 'other', action: 'void' })),
  ];

  it('najnowsza pierwsza; para czasu liczy się od poprzedniej poprawki; autor z panelu', () => {
    expect(historyOf(timeline, 'l1')).toEqual([
      { at: at(12, 0), action: 'void', change: null, fields: null, reason: null, adminAuthorId: null },
      {
        at: at(11, 20),
        action: 'retime',
        change: { from: '10:16:22', to: '10:14:40' },
        fields: null,
        reason: 'wg dziennika lotniska',
        adminAuthorId: 'AKO',
      },
    ]);
  });

  it('plakietka „popr." przy każdym poprawionym celu', () => {
    expect([...correctedUuids(timeline)].sort()).toEqual(['l1', 'other']);
  });
});
