/**
 * UZ Aero — test LOGIKI TRYBU EDYCJI (issue #43, mockupy `design/10d`–`10h`).
 *
 * Trzy rozstrzygnięcia, z których każde jest regułą, a nie wyglądem — i dlatego każde
 * ma tu swój test:
 *  • KTÓRY arkusz otwiera wiersz osi (czas / odczyt / zrzut),
 *  • KTÓRY wiersz jest podejrzany (niespójności przypięte do konkretnego zdarzenia),
 *  • CO wolno dopisać (zależy od rodzaju operacji, issue #19).
 *
 * Osobno pilnujemy ADRESU korekty: końce osi (przejęcie, zdanie) pochodzą z projekcji,
 * a poprawia się w nich payload `preflight_confirm` i `day_close`. Pomyłka w tym miejscu
 * jest niewidoczna na ekranie i kosztowna w rejestrze — arkusz otwarłby się na cudzym
 * zdarzeniu.
 */

import { projectSession, type Event, type EventOf, type EventType, type RuleViolation } from '../domain';
import { buildSessionAxis, type AxisRow } from '../ui/screens/logic/sessionAxis';
import {
  addableTypes,
  editTargetFor,
  issueHints,
  withIssues,
} from '../ui/screens/logic/sessionEdit';

const DAY = Date.UTC(2026, 7, 6);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event<T extends EventType>(
  type: T,
  time: number,
  payload: EventOf<T>['payload'],
  uuid?: string,
): Event {
  seq += 1;
  return {
    uuid: uuid ?? `e-${seq}`,
    type,
    sessionUuid: 's-1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    deviceTime: time,
    gpsTime: time,
    schemaVersion: 1,
    syncedAt: null,
    payload,
  } as Event;
}

/** Sesja z mockupu 10D: jeden lot, jeden zrzut, komplet odczytów. */
function sessionEvents(): Event[] {
  seq = 0;
  return [
    event('session_claim', at(8, 4), { mode: 'free' }, 'claim-1'),
    event(
      'preflight_confirm',
      at(8, 4),
      {
        operation: 'skoki',
        departureIcao: 'EPZG',
        reading: { fuelL: 150, mh: 1234.5 },
        mhFormat: 'decimal',
      },
      'preflight-1',
    ),
    event('engine_start', at(8, 12), {}, 'engine-on'),
    event('taxi', at(8, 16), { method: 'auto' }, 'taxi-1'),
    event('takeoff', at(8, 20), { method: 'auto' }, 'to-1'),
    event('drop', at(8, 52), { dropNumber: 1, jumpers: null, altitudeFt: 12_800 }, 'drop-1'),
    event('landing', at(9, 1), { method: 'auto' }, 'ldg-1'),
    event('engine_stop', at(9, 55), {}, 'engine-off'),
    event('day_close', at(11, 20), { finalReading: { fuelL: 123, mh: 1236.1 } }, 'close-1'),
  ];
}

function rowsOf(events: Event[]): AxisRow[] {
  return buildSessionAxis(projectSession(events), events, at(12, 0)).rows;
}

const rowByKind = (rows: AxisRow[], kind: string): AxisRow =>
  rows.find((r) => r.kind === kind)!;

describe('adres korekty na osi', () => {
  it('przejęcie celuje w preflight, a zdanie w zdanie samolotu — nie w claim', () => {
    const rows = rowsOf(sessionEvents());
    expect(rowByKind(rows, 'claim').targetUuid).toBe('preflight-1');
    expect(rowByKind(rows, 'release').targetUuid).toBe('close-1');
  });

  it('zdarzenia operacyjne celują same w siebie', () => {
    const rows = rowsOf(sessionEvents());
    expect(rowByKind(rows, 'takeoff').targetUuid).toBe('to-1');
    expect(rowByKind(rows, 'landing').targetUuid).toBe('ldg-1');
    expect(rowByKind(rows, 'drop').targetUuid).toBe('drop-1');
    expect(rowByKind(rows, 'engineStart').targetUuid).toBe('engine-on');
  });

  it('przejęcie sesji BEZ preflightu nie ma czego adresować', () => {
    const events = sessionEvents().filter((e) => e.type !== 'preflight_confirm');
    expect(rowByKind(rowsOf(events), 'claim').targetUuid).toBeNull();
  });
});

describe('wybór arkusza', () => {
  it('odczyty przy przejęciu i zdaniu → arkusz ODCZYTU', () => {
    const events = sessionEvents();
    const rows = rowsOf(events);
    expect(editTargetFor(rowByKind(rows, 'claim'), events)?.sheet).toBe('reading');
    expect(editTargetFor(rowByKind(rows, 'release'), events)?.sheet).toBe('reading');
  });

  it('zrzut → arkusz ZRZUTU (czas i skład razem)', () => {
    const events = sessionEvents();
    expect(editTargetFor(rowByKind(rowsOf(events), 'drop'), events)?.sheet).toBe('drop');
  });

  it('reszta faktów operacyjnych → arkusz CZASU', () => {
    const events = sessionEvents();
    const rows = rowsOf(events);
    for (const kind of ['engineStart', 'taxi', 'takeoff', 'landing', 'engineStop']) {
      expect(editTargetFor(rowByKind(rows, kind), events)?.sheet).toBe('time');
    }
  });

  it('nazwa celu niesie kontekst lotu i numer zrzutu', () => {
    const events = sessionEvents();
    const rows = rowsOf(events);
    expect(editTargetFor(rowByKind(rows, 'landing'), events)?.label).toBe('Lądowanie · lot 1');
    expect(editTargetFor(rowByKind(rows, 'drop'), events)?.label).toBe('Zrzut 1');
    expect(editTargetFor(rowByKind(rows, 'release'), events)?.label).toBe('Zdanie samolotu');
  });

  it('wiersz bez adresu nie otwiera niczego', () => {
    const events = sessionEvents().filter((e) => e.type !== 'preflight_confirm');
    expect(editTargetFor(rowByKind(rowsOf(events), 'claim'), events)).toBeNull();
  });
});

describe('niespójności przypięte do wierszy', () => {
  const issue = (code: string, uuid?: string): RuleViolation => ({
    code: code as RuleViolation['code'],
    severity: 'warning',
    message: 'komunikat pełny',
    ...(uuid != null ? { details: { uuid } } : {}),
  });

  it('podpis wiersza zamienia się w powód, a wiersz dostaje znacznik', () => {
    const rows = rowsOf(sessionEvents());
    const marked = withIssues(rows, [issue('DROP_ON_GROUND', 'drop-1')]);
    const drop = rowByKind(marked, 'drop');

    expect(drop.warned).toBe(true);
    expect(drop.sub).toBe('na ziemi — sprawdź czas');
    // Podpis ZASTĘPUJE dotychczasowy: w chwili, gdy coś się nie zgadza, ważniejsze
    // jest to, co się nie zgadza, niż wysokość zrzutu.
    expect(drop.sub).not.toContain('ft');
  });

  it('pozostałe wiersze zostają nietknięte', () => {
    const rows = rowsOf(sessionEvents());
    const marked = withIssues(rows, [issue('DROP_ON_GROUND', 'drop-1')]);
    expect(rowByKind(marked, 'landing').warned).toBeUndefined();
    expect(rowByKind(marked, 'claim').sub).toBe(rowByKind(rows, 'claim').sub);
  });

  it('niespójność BEZ adresu nie oznacza żadnego wiersza — zostaje w banerze', () => {
    const rows = rowsOf(sessionEvents());
    const marked = withIssues(rows, [issue('FUEL_INCREASE_WITHOUT_REFUEL')]);
    expect(marked.every((row) => row.warned !== true)).toBe(true);
  });

  it('kod bez skrótu nie produkuje podpisu „nieznany problem"', () => {
    expect(issueHints([issue('CLOCK_DRIFT', 'to-1')]).size).toBe(0);
  });

  it('pusta lista zwraca te same wiersze, bez kopiowania', () => {
    const rows = rowsOf(sessionEvents());
    expect(withIssues(rows, [])).toBe(rows);
  });
});

describe('co wolno dopisać', () => {
  it('dzień skokowy ma zrzut i załadunek', () => {
    expect(addableTypes('skoki').map((t) => t.type)).toEqual([
      'takeoff',
      'landing',
      'taxi',
      'drop',
      'boarding',
      'refuel',
    ]);
  });

  it('przelot ich NIE MA — to brak akcji, nie blokada z powodem (issue #19)', () => {
    expect(addableTypes('ferry').map((t) => t.type)).toEqual([
      'takeoff',
      'landing',
      'taxi',
      'refuel',
    ]);
  });

  it('klamry silnika nie ma na żadnej liście — sesja ma jeden bieg', () => {
    for (const operation of ['skoki', 'ferry', 'egzamin', 'techniczny', 'inne'] as const) {
      const types = addableTypes(operation).map((t) => t.type as string);
      expect(types).not.toContain('engine_start');
      expect(types).not.toContain('engine_stop');
    }
  });

  it('bez znanej operacji zostaje sam rdzeń — nie zgadujemy dnia skokowego', () => {
    expect(addableTypes(null).map((t) => t.type)).toEqual([
      'takeoff',
      'landing',
      'taxi',
      'refuel',
    ]);
  });
});
