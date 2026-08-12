/**
 * UZ Aero — test treści ekranu 16 (szczegóły jednego lotu).
 *
 * Ekran powstał z issue #25 i przestawia jedną drogę: ślad przestał być skrótem z listy
 * lotów, a stał się detalem LOTU (10 → 16 → 14). Najciekawsza jest tu przynależność
 * zrzutów: „w tym locie" znaczy „między startem a lądowaniem TEGO lotu", i to liczone
 * ze strumienia EFEKTYWNEGO — bo korekta czasu potrafi przenieść zrzut do sąsiedniego
 * lotu, a unieważnienie sprawia, że zrzutu nie było.
 *
 * Czasy scenariusza są z mockupu 16: lot 1 08:20 → 09:01 ze zrzutem o 08:52.
 */

import {
  correctionNote,
  dropRows,
  flightSubtitle,
  flightTimeCells,
  flightTitle,
  methodTag,
  missingTrackCopy,
  placeNote,
  trackMetricCells,
} from '../ui/screens/logic/flightDetails';
import type { Event, EventPayloadMap, EventType, Flight, FlightTrack } from '../domain';

const DAY = Date.UTC(2026, 7, 6);
const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY + (h! * 60 + m!) * 60_000;
};

let seq = 0;

function ev<K extends EventType>(type: K, time: string, payload: EventPayloadMap[K]): Event {
  return {
    uuid: `e-${++seq}`,
    sessionUuid: 'sess-1',
    aircraftId: 'SP-AXA',
    picId: 'tmk',
    dualId: null,
    type,
    payload,
    deviceTime: at(time),
    gpsTime: at(time),
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

function flight(from: string, to: string | null, over: Partial<Flight> = {}): Flight {
  const takeoffAt = at(from);
  const landingAt = to != null ? at(to) : null;
  return {
    index: 1,
    method: 'auto',
    takeoffAt,
    landingAt,
    durationMs: landingAt != null ? landingAt - takeoffAt : 0,
    takeoffUuid: 'to-1',
    landingUuid: landingAt != null ? 'ldg-1' : null,
    ...over,
  };
}

function track(over: Partial<FlightTrack> = {}): FlightTrack {
  return {
    line: [],
    points: [],
    distanceNm: 38.42,
    maxAltitudeFt: 12_840,
    usableCount: 1412,
    totalCount: 1508,
    ...over,
  } as FlightTrack;
}

/** Separator tysięcy zależy od ICU — porównujemy same cyfry. */
const digits = (value: string): string => value.replace(/[\s ]/g, '');

describe('nagłówek ekranu 16', () => {
  it('tytuł niesie numer lotu w sesji, podtytuł maszynę, datę i operację', () => {
    expect(flightTitle(3)).toBe('LOT 3');
    expect(flightSubtitle('SP-AXA', at('08:20'), 'skoki')).toBe('SP-AXA · 06 SIE · SKOKI');
  });

  it('brakujące części podtytułu wypadają zamiast zostawiać puste separatory', () => {
    // Sesja wczytana z innego strumienia nie zna operacji — napis ma się wtedy skrócić,
    // a nie pokazać „SP-AXA · 06 SIE · ".
    expect(flightSubtitle('SP-AXA', at('08:20'), null)).toBe('SP-AXA · 06 SIE');
    expect(flightSubtitle(null, at('08:20'), 'ferry')).toBe('06 SIE · PRZELOT');
  });

  it('plakietka mówi, SKĄD wziął się lot', () => {
    expect(methodTag('auto')).toBe('AUTO');
    expect(methodTag('manual')).toBe('RĘCZNIE');
  });
});

describe('kafle czasów lotu', () => {
  it('lot zamknięty: start, lądowanie, czas i pozycja w sesji', () => {
    const cells = flightTimeCells(flight('08:20', '09:01', { index: 1 }), 2);
    expect(cells.map((c) => c.value)).toEqual(['08:20', '09:01', '00:41', '1']);
    expect(cells[3]!.unit).toBe('z 2 lotów');
  });

  it('lot w powietrzu nie udaje, że trwał zero minut', () => {
    // Zero wyglądałoby jak lot, który trwał chwilę — a to jest lot, który JESZCZE trwa.
    const cells = flightTimeCells(flight('08:20', null), 1);
    expect(cells[1]!.value).toBe('— —');
    expect(cells[2]!.value).toBe('— —');
    expect(cells[3]!.unit).toBe('z 1 lotu');
  });

  it('jedyny lot sesji odmienia się przez przypadek („z 1 lotu")', () => {
    expect(flightTimeCells(flight('08:20', '09:01'), 5)[3]!.unit).toBe('z 5 lotów');
  });
});

describe('metryki pod miniaturą śladu', () => {
  it('te same liczby, co w nagłówku pełnego śladu (14) — bez czasu lotu', () => {
    const cells = trackMetricCells(track());
    expect(cells.map((c) => c.label)).toEqual(['Dystans', 'Max wys.', 'Punkty']);
    expect(cells[0]!.value).toBe('38.4');
    expect(digits(cells[1]!.value)).toBe('12840');
    expect(digits(cells[2]!.value)).toBe('1412');
    expect(digits(cells[2]!.unit ?? '')).toBe('z1508');
  });

  it('brak wysokości to niewiedza, nie zero', () => {
    expect(trackMetricCells(track({ maxAltitudeFt: null }))[1]!.value).toBe('— —');
  });
});

describe('zrzuty w tym locie', () => {
  const inFlight = () =>
    ev('drop', '08:52', {
      dropNumber: 1,
      altitudeFt: 12_800,
      jumpers: { tandem: 2, aff: 1, solo: 1 },
    });

  it('wiersz zrzutu niesie numer, godzinę, liczbę skoczków i wysokość + skład', () => {
    const rows = dropRows([inFlight()], flight('08:20', '09:01'));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.label).toBe('Zrzut 1 · 08:52');
    expect(digits(rows[0]!.value)).toBe('4skoczków·12800ft');
    expect(rows[1]!.label).toBe('Skład');
    expect(rows[1]!.value).toBe('2 TANDEM · 1 AFF · 1 SOLO');
  });

  it('zrzuty spoza okna lotu nie należą do tego lotu', () => {
    const events = [
      ev('drop', '08:05', { dropNumber: 1, altitudeFt: 3000, jumpers: null }),
      inFlight(),
      ev('drop', '09:30', { dropNumber: 3, altitudeFt: 3000, jumpers: null }),
    ];
    const rows = dropRows(events, flight('08:20', '09:01'));
    expect(rows.map((r) => r.label)).toEqual(['Zrzut 1 · 08:52', 'Skład']);
  });

  it('lot jeszcze w powietrzu bierze wszystko po starcie', () => {
    const rows = dropRows([inFlight()], flight('08:20', null));
    expect(rows[0]!.label).toBe('Zrzut 1 · 08:52');
  });

  it('zrzut unieważniony (04c) nie zaszedł — znika też stąd', () => {
    const drop = inFlight();
    const rows = dropRows(
      [drop, ev('event_correction', '10:00', { targetUuid: drop.uuid, action: 'void' })],
      flight('08:20', '09:01'),
    );
    expect(rows).toEqual([]);
  });

  it('zrzut przesunięty korektą przenosi się do lotu, w którym faktycznie był', () => {
    // Wprost z powodu, dla którego czytamy strumień efektywny: zapis pokazywał 09:30
    // (po lądowaniu), pilot poprawił na 08:52 — i zrzut należy do lotu 1.
    const drop = ev('drop', '09:30', { dropNumber: 1, altitudeFt: 12_800, jumpers: null });
    const events = [
      drop,
      ev('event_correction', '10:00', {
        targetUuid: drop.uuid,
        action: 'retime',
        newTime: at('08:52'),
      }),
    ];
    expect(dropRows(events, flight('08:20', '09:01'))).toHaveLength(1);
    expect(dropRows(events, flight('08:20', '09:01'))[0]!.label).toBe('Zrzut 1 · 08:52');
  });

  it('skład jest opcjonalny (issue #21) — bez niego nie ma wiersza „Skład"', () => {
    const rows = dropRows(
      [ev('drop', '08:52', { dropNumber: 1, altitudeFt: 12_800, jumpers: null })],
      flight('08:20', '09:01'),
    );
    expect(rows).toHaveLength(1);
    expect(digits(rows[0]!.value)).toBe('12800ft');
  });

  it('zrzut bez składu i bez wysokości mówi to wprost, zamiast pokazywać zera', () => {
    const rows = dropRows(
      [ev('drop', '08:52', { dropNumber: 1, altitudeFt: null, jumpers: null })],
      flight('08:20', '09:01'),
    );
    expect(rows[0]!.value).toBe('zapisany bez liczb');
  });
});

describe('przypisy ekranu', () => {
  it('skoki tłumaczą JEDNO lotnisko, operacje z trasą nie potrzebują wyjaśnień', () => {
    expect(placeNote('skoki')).toBe('skoki — start i lądowanie na tym samym placu');
    expect(placeNote('ferry')).toBeNull();
    expect(placeNote(null)).toBeNull();
  });

  it('brak śladu ma DWA różne powody i ekran ich nie zlewa', () => {
    const manual = missingTrackCopy('manual');
    const expired = missingTrackCopy('no-record');
    expect(manual.title).not.toBe(expired.title);
    expect(manual.source).toBe('wpis pilota');
    expect(expired.text).toContain('14 dni');
  });

  it('przypis korekty zawsze mówi, co dalej — także po zamknięciu okna', () => {
    expect(correctionNote({ confirmed: false, open: true, closesAt: null })).toContain(
      'bez limitu',
    );
    expect(
      correctionNote({ confirmed: true, open: true, closesAt: at('11:20') + 24 * 3_600_000 }),
    ).toBe('samodzielnie do 7 SIE 11:20 UTC · potem korektę nanosi administrator');
    expect(correctionNote({ confirmed: true, open: false, closesAt: null })).toContain(
      'administrator',
    );
  });
});
