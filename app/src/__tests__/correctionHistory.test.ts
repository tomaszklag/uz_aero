/**
 * UZ Aero — test HISTORII ZMIAN zdarzenia (issue #43, arkusz `design/10i`).
 *
 * Historia nie jest osobnym dziennikiem, tylko odczytem rejestru — i to jest cała
 * odpowiedź na pytanie z issue („czy architektura nam na to pozwala?"). Testy pilnują,
 * żeby ten odczyt mówił dokładnie to, co policzyła projekcja:
 *  • wartość „przed" bierze się z POPRZEDNIEJ korekty, nie z oryginału,
 *  • kolejne poprawki różnych wymiarów nie zjadają się nawzajem,
 *  • korekta nieczytelna nie pojawia się w historii, bo nic nie zmieniła.
 */

import { correctionHistory, type CorrectionFields, type Event, type EventOf } from '../domain';

const DAY = Date.UTC(2026, 7, 6);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event(type: Event['type'], time: number, payload: unknown = {}): Event {
  seq += 1;
  return {
    uuid: `e-${seq}-${type}`,
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

type CorrectionAction =
  | { action: 'retime'; newTime: number }
  | { action: 'void' }
  | { action: 'amend'; fields: CorrectionFields };

function correction(
  target: Event,
  recordedAt: number,
  action: CorrectionAction,
  options: { reason?: string; picId?: string } = {},
): EventOf<'event_correction'> {
  seq += 1;
  return {
    uuid: `c-${seq}`,
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    picId: options.picId ?? 'TMK',
    dualId: null,
    type: 'event_correction',
    deviceTime: recordedAt,
    gpsTime: recordedAt,
    payload: {
      targetUuid: target.uuid,
      ...action,
      ...(options.reason != null ? { reason: options.reason } : {}),
    },
    schemaVersion: 1,
    syncedAt: null,
  } as EventOf<'event_correction'>;
}

const landing = (): Event => event('landing', at(8, 58), { method: 'auto' });

describe('historia zmian — czas zdarzenia', () => {
  it('pusta, dopóki nikt nie poprawiał', () => {
    const target = landing();
    expect(correctionHistory([target], target.uuid)).toEqual([]);
  });

  it('pierwsza poprawka odnosi się do zapisu pierwotnego', () => {
    const target = landing();
    const stream = [
      target,
      correction(target, at(11, 42), { action: 'retime', newTime: at(9, 1) }, {
        reason: 'GPS wykrył lądowanie za późno.',
      }),
    ];

    const history = correctionHistory(stream, target.uuid);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      field: 'time',
      kind: 'retime',
      from: at(8, 58),
      to: at(9, 1),
      byPilotId: 'TMK',
      reason: 'GPS wykrył lądowanie za późno.',
    });
  });

  it('druga poprawka odnosi się do PIERWSZEJ, nie do oryginału', () => {
    const target = landing();
    const stream = [
      target,
      correction(target, at(11, 42), { action: 'retime', newTime: at(9, 1) }),
      correction(target, at(12, 5), { action: 'retime', newTime: at(9, 0) }, {
        picId: 'AKO',
        reason: 'Zgodnie z zapisem w dzienniku lotniska.',
      }),
    ];

    const history = correctionHistory(stream, target.uuid);
    expect(history).toHaveLength(2);
    // Chronologicznie: ekran odwraca kolejność u siebie (najnowsza na górze).
    expect(history[0]?.to).toBe(at(9, 1));
    expect(history[1]).toMatchObject({ from: at(9, 1), to: at(9, 0), byPilotId: 'AKO' });
  });

  it('brak powodu zostaje jawnym `null`, nie pustym napisem', () => {
    const target = landing();
    const stream = [target, correction(target, at(11, 42), { action: 'void' })];
    expect(correctionHistory(stream, target.uuid)[0]?.reason).toBeNull();
  });
});

describe('historia zmian — unieważnienie i powrót', () => {
  it('void jest wpisem o FAKCIE, bez pary wartości', () => {
    const target = landing();
    const stream = [target, correction(target, at(11, 38), { action: 'void' })];
    expect(correctionHistory(stream, target.uuid)[0]).toMatchObject({
      kind: 'void',
      field: null,
      from: null,
      to: null,
    });
  });

  it('poprawka po unieważnieniu dokłada osobny wpis „przywrócone"', () => {
    const target = landing();
    const stream = [
      target,
      correction(target, at(11, 38), { action: 'void' }),
      correction(target, at(11, 42), { action: 'retime', newTime: at(9, 1) }),
    ];

    const history = correctionHistory(stream, target.uuid);
    expect(history.map((h) => h.kind)).toEqual(['void', 'unvoid', 'retime']);
  });

  it('powtórzone unieważnienie nie produkuje drugiego wpisu — nic się nie zmieniło', () => {
    const target = landing();
    const stream = [
      target,
      correction(target, at(11, 38), { action: 'void' }),
      correction(target, at(11, 39), { action: 'void' }),
    ];
    expect(correctionHistory(stream, target.uuid)).toHaveLength(1);
  });
});

describe('historia zmian — wartości', () => {
  const dayClose = (): Event =>
    event('day_close', at(11, 20), { finalReading: { fuelL: 171, mh: 1236.1 } });

  it('korekta dwóch pól daje DWA wpisy — każdy ze swoją parą wartości', () => {
    const target = dayClose();
    const stream = [
      target,
      correction(target, at(11, 40), {
        action: 'amend',
        fields: { fuelL: 168, mh: 1236.5 },
      }),
    ];

    const history = correctionHistory(stream, target.uuid);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ field: 'fuelL', from: 171, to: 168 });
    expect(history[1]).toMatchObject({ field: 'mh', from: 1236.1, to: 1236.5 });
    // Oba wpisy pochodzą z JEDNEJ korekty — ekran może je pogrupować.
    expect(history[0]?.correctionUuid).toBe(history[1]?.correctionUuid);
  });

  it('skład zrzutu wchodzi jako trójka, a `null` znaczy „niepodany"', () => {
    const target = event('drop', at(8, 52), {
      dropNumber: 1,
      jumpers: { tandem: 2, aff: 1, solo: 1 },
    });
    const stream = [
      target,
      correction(target, at(11, 40), {
        action: 'amend',
        fields: { jumpers: { tandem: 2, aff: 1, solo: 2 } },
      }),
      correction(target, at(11, 45), { action: 'amend', fields: { jumpers: null } }),
    ];

    const history = correctionHistory(stream, target.uuid);
    expect(history[0]).toMatchObject({
      field: 'jumpers',
      from: { tandem: 2, aff: 1, solo: 1 },
      to: { tandem: 2, aff: 1, solo: 2 },
    });
    expect(history[1]).toMatchObject({ from: { tandem: 2, aff: 1, solo: 2 }, to: null });
  });

  it('czas i wartość mieszają się w jednej liście, każde ze swoim łańcuchem', () => {
    const target = event('drop', at(8, 52), { dropNumber: 1, jumpers: null });
    const stream = [
      target,
      correction(target, at(11, 40), {
        action: 'amend',
        fields: { jumpers: { tandem: 1, aff: 0, solo: 0 } },
      }),
      correction(target, at(11, 45), { action: 'retime', newTime: at(9, 29) }),
    ];

    const history = correctionHistory(stream, target.uuid);
    expect(history[0]).toMatchObject({ field: 'jumpers', from: null });
    expect(history[1]).toMatchObject({ field: 'time', from: at(8, 52), to: at(9, 29) });
  });
});

describe('historia zmian — wpisy nieczytelne', () => {
  it('korekta bez rozpoznanego pola nie trafia do historii', () => {
    const target = event('day_close', at(11, 20), {
      finalReading: { fuelL: 171, mh: 1236.1 },
    });
    const broken = correction(target, at(11, 44), { action: 'amend', fields: {} });
    (broken as { payload: unknown }).payload = {
      targetUuid: target.uuid,
      action: 'amend',
      fields: { capacityL: 999 },
    };

    expect(correctionHistory([target, broken], target.uuid)).toEqual([]);
  });

  it('korekta cudzego zdarzenia nie zanieczyszcza historii', () => {
    const target = landing();
    const other = event('takeoff', at(8, 20), { method: 'auto' });
    const stream = [
      target,
      other,
      correction(other, at(11, 42), { action: 'retime', newTime: at(8, 22) }),
    ];
    expect(correctionHistory(stream, target.uuid)).toEqual([]);
  });
});
