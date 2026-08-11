/**
 * UZ Aero — test czasu pracy silnika i czasu lotu w oknie.
 *
 * Ten plik istnieje przez konkretną awarię (2026-08-05). Ekran 06 liczył czas pracy
 * silnika wyłącznie z `state.legs`, a `projectSession` obsługuje `manual_log_entry`
 * inaczej niż parę `engine_start`/`engine_stop`: dokłada czas off-block→on-block wprost
 * do `blockTimeMs` i NIE tworzy wpisu w `legs`. W dniu z wpisem ręcznym mianownik
 * był więc za mały, a średnia L/h — zawyżona. Nie było tego jak zauważyć: zła średnia
 * wygląda dokładnie tak samo jak dobra.
 *
 * Pierwszy test poniżej jest testem REGRESYJNYM na tę wadę. Drugi blok pilnuje rzeczy,
 * której stara implementacja nie umiała w ogóle: odcinków, które na siebie nachodzą.
 */

import {
  blockSpans,
  flightSpans,
  mergeSpans,
  projectSession,
  spanTimeInWindow,
  type Event,
} from '../domain';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
const minutes = (n: number): number => n * 60_000;

let seq = 0;
function event<T extends Event['type']>(type: T, time: number, payload: unknown = {}): Event {
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

describe('czas pracy silnika obejmuje wpis ręczny (regresja z 2026-08-05)', () => {
  it('liczy ręczny off/on-block, którego NIE MA w legs', () => {
    const events = [
      event('manual_log_entry', at(12, 0), {
        offBlock: at(9, 0),
        onBlock: at(10, 30),
        takeoff: at(9, 15),
        landing: at(10, 15),
      }),
    ];
    const state = projectSession(events);

    // Dowód, że wada była realna: projekcja zna ten czas, ale `legs` jest puste,
    // więc każdy, kto liczy z samych cykli, dostanie zero.
    expect(state.legs).toHaveLength(0);
    expect(state.blockTimeMs).toBe(minutes(90));

    const spans = blockSpans(state, events);
    expect(spanTimeInWindow(spans, at(0, 0), at(23, 59))).toBe(minutes(90));
  });

  it('bierze też loty z wpisu ręcznego', () => {
    const events = [
      event('manual_log_entry', at(12, 0), {
        offBlock: at(9, 0),
        onBlock: at(10, 30),
        takeoff: at(9, 15),
        landing: at(10, 15),
      }),
    ];
    const state = projectSession(events);

    expect(spanTimeInWindow(flightSpans(state), at(0, 0), at(23, 59))).toBe(minutes(60));
  });

  it('pomija wpis ręczny bez pełnej pary off/on-block', () => {
    // Sam start bez końca nie wyznacza odcinka. Domknięcie go zgadywanym czasem
    // byłoby zmyśleniem czasu pracy silnika.
    const events = [
      event('manual_log_entry', at(12, 0), { offBlock: at(9, 0), onBlock: null }),
    ];
    const state = projectSession(events);

    expect(blockSpans(state, events)).toHaveLength(0);
  });

  it('nie liczy wpisu unieważnionego korektą', () => {
    const manual = event('manual_log_entry', at(12, 0), {
      offBlock: at(9, 0),
      onBlock: at(10, 30),
    });
    const events = [
      manual,
      event('event_correction', at(13, 0), { targetUuid: manual.uuid, action: 'void' }),
    ];
    const state = projectSession(events);

    expect(blockSpans(state, events)).toHaveLength(0);
  });
});

describe('odcinki nakładające się scalamy, a nie sumujemy', () => {
  it('nie liczy tych samych minut dwa razy', () => {
    // Pilot dopisał ręcznie wzlot, który aplikacja też zarejestrowała. Suma długości
    // dałaby 4 h, a silnik pracował 3 h — mianownik zawyżony, L/h zaniżone.
    const manual = event('manual_log_entry', at(12, 0), {
      offBlock: at(9, 0),
      onBlock: at(11, 0),
    });
    const events = [
      event('engine_start', at(8, 0)),
      event('engine_stop', at(10, 0)),
      manual,
    ];
    const state = projectSession(events);

    // Projekcja sumuje oba źródła bez scalania — i to jest jej definicja („ile czasu
    // zaraportowano"). Nasza miara odpowiada na inne pytanie: „ile silnik pracował".
    expect(state.blockTimeMs).toBe(minutes(240));
    expect(spanTimeInWindow(blockSpans(state, events), at(0, 0), at(23, 59))).toBe(
      minutes(180),
    );
  });

  it('scala odcinki stykające się końcami', () => {
    const merged = mergeSpans([
      { from: at(8, 0), to: at(9, 0) },
      { from: at(9, 0), to: at(10, 0) },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.to - merged[0]!.from).toBe(minutes(120));
  });

  it('zostawia rozłączne odcinki osobno i porządkuje je rosnąco', () => {
    const merged = mergeSpans([
      { from: at(11, 0), to: at(12, 0) },
      { from: at(8, 0), to: at(9, 0) },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]!.from).toBe(at(8, 0));
  });
});

describe('przycinanie do okna', () => {
  it('liczy część cyklu wpadającą w okno, gdy okno zaczyna się w jego środku', () => {
    const events = [event('engine_start', at(8, 0)), event('engine_stop', at(10, 0))];
    const state = projectSession(events);

    expect(spanTimeInWindow(blockSpans(state, events), at(9, 0), at(11, 0))).toBe(
      minutes(60),
    );
  });

  it('cykl otwarty domyka do końca okna — „licz do teraz"', () => {
    const events = [event('engine_start', at(8, 0))];
    const state = projectSession(events);

    expect(spanTimeInWindow(blockSpans(state, events), at(8, 0), at(8, 45))).toBe(
      minutes(45),
    );
  });

  it('okno zerowej albo ujemnej długości daje zero, nie liczbę ujemną', () => {
    const events = [event('engine_start', at(8, 0)), event('engine_stop', at(10, 0))];
    const state = projectSession(events);
    const spans = blockSpans(state, events);

    expect(spanTimeInWindow(spans, at(9, 0), at(9, 0))).toBe(0);
    expect(spanTimeInWindow(spans, at(10, 0), at(9, 0))).toBe(0);
  });
});
