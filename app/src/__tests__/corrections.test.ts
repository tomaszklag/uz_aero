/**
 * UZ Aero - test KOREKT ZDARZEŃ (04c) w modelu append-only.
 *
 * Korekta to jedyne miejsce, gdzie „prawda" projekcji odkleja się od surowego rejestru
 * - i właśnie dlatego musi być żelazna: unieważnione lądowanie, które dalej liczyłoby
 * czas lotu, albo poprawiony czas, który nie przestawia porządku cykli, to błędy
 * niewidoczne na ekranie, a widoczne w arkuszu na koniec miesiąca.
 */

import {
  applyCorrections,
  buildEventIndex,
  checkAppend,
  projectSession,
  type Event,
  type EventOf,
} from '../domain';

const DAY = Date.UTC(2026, 5, 22);
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

/** Korekta zapisana o `recordedAt`, celująca w `target`. */
function correction(
  target: Event,
  recordedAt: number,
  payload: { action: 'retime'; newTime: number } | { action: 'void' },
): EventOf<'event_correction'> {
  seq += 1;
  return {
    uuid: `c-${seq}`,
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type: 'event_correction',
    deviceTime: recordedAt,
    gpsTime: null,
    payload: { targetUuid: target.uuid, ...payload },
    schemaVersion: 1,
    syncedAt: null,
  } as EventOf<'event_correction'>;
}

/**
 * Korekta o SUROWYM, niesprawdzonym payloadzie - tak, jak potrafi leżeć w bazie:
 * `events.payload` to `JSONB` bez `CHECK`-a, więc wiersz wpisany ręcznie w psql,
 * odtworzony ze zrzutu albo przysłany przez starszą wersję telefonu może mieć
 * dowolny kształt. Typ jest obietnicą WEJŚCIA, nie faktem odczytu.
 */
function rawCorrection(payload: unknown, recordedAt: number): Event {
  seq += 1;
  return {
    uuid: `craw-${seq}`,
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type: 'event_correction',
    deviceTime: recordedAt,
    gpsTime: null,
    payload,
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

/** Cykl z mockupu: start silnika, lot 08:25 → 09:18, stop. */
function day(): { events: Event[]; landing: Event; takeoff: Event } {
  const takeoff = event('takeoff', at(8, 25), { method: 'auto' });
  const landing = event('landing', at(9, 18), { method: 'auto' });
  return {
    events: [event('engine_start', at(8, 12)), takeoff, landing, event('engine_stop', at(10, 34))],
    landing,
    takeoff,
  };
}

describe('nakładanie korekt na strumień', () => {
  it('retime zmienia czas efektywny, oryginał w rejestrze zostaje nietknięty', () => {
    const { events, landing } = day();
    const stream = [...events, correction(landing, at(10, 40), { action: 'retime', newTime: at(9, 21) })];

    const effective = applyCorrections(stream);
    const corrected = effective.find((e) => e.uuid === landing.uuid)!;
    expect(corrected.gpsTime).toBe(at(9, 21));
    // `deviceTime` zostaje - to ślad chwili pierwotnego zapisu (§5.1, dwa zegary).
    expect(corrected.deviceTime).toBe(at(9, 18));
    // Rejestr wejściowy nienaruszony.
    expect(landing.gpsTime).toBe(at(9, 18));
  });

  it('void wyłącza zdarzenie z projekcji, ale nie z indeksu celów', () => {
    const { events, landing } = day();
    const stream = [...events, correction(landing, at(10, 40), { action: 'void' })];

    expect(applyCorrections(stream).some((e) => e.uuid === landing.uuid)).toBe(false);
    // Unieważnione wciąż jest celem - ponowna korekta może je przywrócić.
    expect(buildEventIndex(stream)[landing.uuid]?.type).toBe('landing');
    // Indeks niesie też CZAS - reguła okna korekty potrzebuje go, żeby ustalić,
    // do którego wzlotu należy korygowane zdarzenie (§3.6a).
    expect(buildEventIndex(stream)[landing.uuid]?.at).toBe(landing.gpsTime ?? landing.deviceTime);
  });

  it('ostatnia korekta wygrywa - retime po void przywraca zdarzenie', () => {
    const { events, landing } = day();
    const stream = [
      ...events,
      correction(landing, at(10, 40), { action: 'void' }),
      correction(landing, at(10, 45), { action: 'retime', newTime: at(9, 25) }),
    ];

    const resurrected = applyCorrections(stream).find((e) => e.uuid === landing.uuid);
    expect(resurrected?.gpsTime).toBe(at(9, 25));
  });

  it('projekcja liczy czas lotu z czasów PO korekcie', () => {
    const { events, landing } = day();
    // Mockup: lądowanie 09:18 → 09:21, czas lotu 0:53 → 0:56.
    const stream = [...events, correction(landing, at(10, 40), { action: 'retime', newTime: at(9, 21) })];

    expect(projectSession(events).flightTimeMs).toBe(53 * 60_000);
    expect(projectSession(stream).flightTimeMs).toBe(56 * 60_000);
  });

  it('lot w projekcji niesie uuid zdarzeń źródłowych - adres dla ołówka korekty', () => {
    const { events, takeoff, landing } = day();
    const flight = projectSession(events).flights[0]!;
    expect(flight.takeoffUuid).toBe(takeoff.uuid);
    expect(flight.landingUuid).toBe(landing.uuid);
  });

  it('unieważnione lądowanie znika z liczników lotów', () => {
    const { events, landing } = day();
    const stream = [...events, correction(landing, at(10, 40), { action: 'void' })];

    const state = projectSession(stream);
    expect(state.landingCount).toBe(0);
    expect(state.takeoffCount).toBe(1); // start pozostał - pilot uzupełni albo unieważni osobno
  });
});

/**
 * Wiersz `event_correction`, którego payloadu nie da się przeczytać, jest POMIJANY -
 * nie wywraca strumienia i nie zgaduje się za niego akcji.
 *
 * To nie jest przypadek teoretyczny: `applyCorrections` jest jedyną drogą, którą
 * rejestr zdarzeń panelu (`A04`) nakłada korekty na CAŁĄ stronę naraz. Wyjątek na
 * jednym wierszu znaczył tam 500 z całej listy - narzędzie śledcze przestawało się
 * otwierać przez własną historię, dokładnie wtedy, gdy było potrzebne.
 */
describe('korekta nieczytelna jest pomijana, a nie wywraca strumienia', () => {
  it('korekta, która nie adresuje celu, nie rzuca - strumień wraca w całości', () => {
    const { events, landing } = day();
    // Payload równy JSON-owemu `null` to ten kształt, który wywracał CAŁY rejestr:
    // sięgnięcie po `targetUuid` dawało `TypeError`, czyli 500 z listy.
    const nullPayload = [...events, rawCorrection(null, at(10, 40))];
    expect(() => applyCorrections(nullPayload)).not.toThrow();
    expect(applyCorrections(nullPayload).map((e) => e.uuid)).toEqual(events.map((e) => e.uuid));

    // Ten sam wniosek dla payloadu z akcją, ale bez celu: nie ma czego poprawiać.
    const noTarget = [...events, rawCorrection({ action: 'void' }, at(10, 40))];
    expect(applyCorrections(noTarget).find((e) => e.uuid === landing.uuid)?.gpsTime).toBe(
      at(9, 18),
    );
  });

  it('NIEZNANA akcja nie jest po cichu traktowana jak `retime`', () => {
    // Gałąź „wszystko, co nie jest `void`" brała `newTime` z KAŻDEJ akcji - więc
    // kształt z przyszłej wersji telefonu przestawiłby czas lądowania, choć nikt
    // nie wie, co ta akcja miała znaczyć.
    const { events, landing } = day();
    const stream = [
      ...events,
      rawCorrection(
        { targetUuid: landing.uuid, action: 'przesun_o_strefe', newTime: at(9, 21) },
        at(10, 40),
      ),
    ];

    const corrected = applyCorrections(stream).find((e) => e.uuid === landing.uuid);
    expect(corrected?.gpsTime).toBe(at(9, 18));
  });

  it('`retime` bez liczbowego `newTime` nie wpisuje zdarzeniu czasu, którego nikt nie podał', () => {
    const { events, landing } = day();
    const stream = [
      ...events,
      rawCorrection({ targetUuid: landing.uuid, action: 'retime' }, at(10, 40)),
    ];

    const corrected = applyCorrections(stream).find((e) => e.uuid === landing.uuid);
    expect(corrected?.gpsTime).toBe(at(9, 18));
  });

  it('nieczytelna korekta NIE KASUJE wcześniejszej czytelnej korekty tego samego celu', () => {
    // „Ostatnia wygrywa" znaczy „ostatnia, którą da się przeczytać". Inaczej jeden
    // popsuty wiersz cofałby skutek korekty, którą ktoś świadomie zapisał.
    const { events, landing } = day();
    const stream = [
      ...events,
      correction(landing, at(10, 40), { action: 'retime', newTime: at(9, 21) }),
      rawCorrection({ targetUuid: landing.uuid }, at(10, 45)),
    ];

    const corrected = applyCorrections(stream).find((e) => e.uuid === landing.uuid);
    expect(corrected?.gpsTime).toBe(at(9, 21));
  });
});

describe('reguły korekty', () => {
  const nowStamp = at(11, 0);

  function candidateFor(
    stream: Event[],
    targetUuid: string,
    payload: { action: 'retime'; newTime: number } | { action: 'void' },
    recordedAt: number = nowStamp,
  ): Event {
    return {
      uuid: 'cand',
      sessionUuid: 's1',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      type: 'event_correction',
      deviceTime: recordedAt,
      gpsTime: null,
      payload: { targetUuid, ...payload },
      schemaVersion: 1,
      syncedAt: null,
    } as Event;
  }

  it('odrzuca cel spoza operacji', () => {
    const { events } = day();
    const v = checkAppend(projectSession(events), candidateFor(events, 'ghost', { action: 'void' }));
    expect(v.some((x) => x.code === 'CORRECTION_TARGET_NOT_FOUND')).toBe(true);
  });

  it('odrzuca korektę zdarzeń cyklu życia operacji (preflight, day_close)', () => {
    const preflight = event('preflight_confirm', at(8, 0), {
      operation: 'skoki',
      reading: { fuelL: 150, mh: 1234.5 },
      mhFormat: 'hhmm',
    });
    const stream = [preflight, ...day().events];
    const v = checkAppend(
      projectSession(stream),
      candidateFor(stream, preflight.uuid, { action: 'void' }),
    );
    expect(v.some((x) => x.code === 'CORRECTION_TARGET_NOT_ALLOWED')).toBe(true);
  });

  it('odrzuca poprawiony czas z przyszłości', () => {
    const { events, landing } = day();
    const v = checkAppend(
      projectSession(events),
      candidateFor(events, landing.uuid, { action: 'retime', newTime: nowStamp + 60_000 }),
    );
    expect(v.some((x) => x.code === 'CORRECTION_TIME_IN_FUTURE')).toBe(true);
  });

  it('okno 24 h po zamknięciu: korekta przechodzi w oknie i pada po jego upływie', () => {
    const { events, landing } = day();
    const closedAt = at(16, 45);
    const closed = [
      ...events,
      event('day_close', closedAt, {
        finalReading: { fuelL: 88, mh: 1241.15 },
      }),
    ];
    const state = projectSession(closed);
    const retime = { action: 'retime', newTime: at(9, 21) } as const;

    // 15 minut po zamknięciu - dokładnie po to okno istnieje (decyzja 2026-07-23).
    const inWindow = checkAppend(
      state,
      candidateFor(closed, landing.uuid, retime, closedAt + 15 * 60_000),
    );
    expect(inWindow.filter((x) => x.severity === 'error')).toHaveLength(0);

    // 25 godzin po zamknięciu - samodzielna korekta już niedostępna (tylko administrator).
    const afterWindow = checkAppend(
      state,
      candidateFor(closed, landing.uuid, retime, closedAt + 25 * 3_600_000),
    );
    expect(afterWindow.some((x) => x.severity === 'error')).toBe(true);
  });
});
