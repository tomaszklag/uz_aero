/**
 * UZ Aero — test osi wpisu ręcznego (issue #62 pkt 8, 9 i 10).
 *
 * Trzy rzeczy, o które prosiło zgłoszenie z urządzenia, i wszystkie trzy da się
 * sprawdzić bez urządzenia — bo są kształtem danych, nie rysunkiem:
 *  • zrzut należy do KONKRETNEGO lotu i widać do którego (pkt 9),
 *  • nowy lot dziedziczy godziny biegu silnika (pkt 8),
 *  • bez biegu silnika osi NIE MA, więc nie ma też czego do niej dodać (pkt 10).
 */

import {
  buildManualFlightAxis,
  flightNumberAt,
  nextDropAt,
  nextFlightTimes,
} from '../ui/screens/logic/manualFlightAxis';
import { emptyManualFlightDraft, type ManualFlightDraft } from '../ui/screens/logic/manualFlight';

const DAY = Date.UTC(2026, 7, 16);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

/** Bieg 09:42 → 11:18 z trzema lotami — dzień skokowy z mockupu 15B. */
function jumpDayDraft(): ManualFlightDraft {
  return {
    ...emptyManualFlightDraft(DAY),
    operation: 'skoki',
    engineStart: at(9, 42),
    engineStop: at(11, 18),
    flights: [
      { id: 'f1', takeoff: at(9, 48), landing: at(10, 14) },
      { id: 'f2', takeoff: at(10, 26), landing: at(10, 52) },
      { id: 'f3', takeoff: at(11, 0), landing: at(11, 14) },
    ],
  };
}

describe('oś wpisu ręcznego', () => {
  it('bez biegu silnika NIE MA osi ani sum (pkt 10)', () => {
    const draft = emptyManualFlightDraft(DAY);
    expect(buildManualFlightAxis(draft, { jumpDay: false })).toEqual({ rows: [], foot: [] });

    // Jedna godzina to wciąż nie jest bieg — sesja ma dwa końce.
    const half = { ...draft, engineStart: at(9, 42) };
    expect(buildManualFlightAxis(half, { jumpDay: false }).rows).toHaveLength(0);
  });

  it('oś biegnie od uruchomienia do wyłączenia, a loty stoją w środku', () => {
    const { rows, foot } = buildManualFlightAxis(jumpDayDraft(), { jumpDay: false });

    expect(rows[0]).toMatchObject({ kind: 'engineStart', time: '09:42' });
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'engineStop', time: '11:18' });
    // Trzy pary start–lądowanie między końcami.
    expect(rows.filter((r) => r.kind === 'takeoff')).toHaveLength(3);
    expect(rows.filter((r) => r.kind === 'landing')).toHaveLength(3);

    // Numer lotu przy STARCIE, czas lotu przy LĄDOWANIU — prawa krawędź niesie
    // dokładnie jedną rzecz na wiersz (reguła osi z issue #40).
    expect(rows.find((r) => r.id === 'takeoff:f2')).toMatchObject({ flight: 'lot 2' });
    expect(rows.find((r) => r.id === 'landing:f2')).toMatchObject({ duration: '0:26' });

    expect(foot).toEqual([
      { key: 'Loty', value: '3' },
      { key: 'Blok', value: '1:36' },
      { key: 'Czas lotu', value: '1:06', accent: true },
    ]);
  });

  it('zrzut stoi W SWOIM locie i nosi jego numer (pkt 9)', () => {
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      drops: [
        { id: 'd1', at: at(10, 8), jumpers: null, altitudeFt: 4000 },
        { id: 'd2', at: at(10, 46), jumpers: null, altitudeFt: null },
      ],
    };
    const { rows } = buildManualFlightAxis(draft, { jumpDay: true });
    const ids = rows.map((r) => r.id);

    // Kolejność jest CAŁYM mechanizmem przynależności: zrzut wypada między startem
    // a lądowaniem swojego lotu, bo tak wynika z jego godziny.
    expect(ids).toEqual([
      'engine-start',
      'takeoff:f1',
      'drop:d1',
      'landing:f1',
      'takeoff:f2',
      'drop:d2',
      'landing:f2',
      'takeoff:f3',
      'landing:f3',
      'engine-stop',
    ]);

    expect(rows.find((r) => r.id === 'drop:d1')).toMatchObject({ flight: 'lot 1', warned: false });
    expect(rows.find((r) => r.id === 'drop:d2')).toMatchObject({ flight: 'lot 2', warned: false });
  });

  it('zrzut poza każdym lotem jest OZNACZONY, nie ukryty i nie zablokowany', () => {
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      // 10:56 — po lądowaniu lotu 2 (10:52), przed startem lotu 3 (11:00).
      drops: [{ id: 'd9', at: at(10, 56), jumpers: null, altitudeFt: null }],
    };
    const row = buildManualFlightAxis(draft, { jumpDay: true }).rows.find(
      (r) => r.id === 'drop:d9',
    );

    expect(row).toMatchObject({ flight: 'poza lotem', warned: true });
  });

  it('zrzutów nie ma na osi poza dniem skokowym (issue #19)', () => {
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      operation: 'ferry',
      drops: [{ id: 'd1', at: at(10, 8), jumpers: null, altitudeFt: null }],
    };
    const ids = buildManualFlightAxis(draft, { jumpDay: false }).rows.map((r) => r.id);
    expect(ids).not.toContain('drop:d1');
  });

  it('przynależność liczy się granicami DOMKNIĘTYMI — jak DROP_ON_GROUND w domenie', () => {
    const flights = jumpDayDraft().flights;
    expect(flightNumberAt(flights, at(9, 48))).toBe(1); // dokładnie start
    expect(flightNumberAt(flights, at(10, 14))).toBe(1); // dokładnie lądowanie
    expect(flightNumberAt(flights, at(10, 20))).toBeNull(); // między lotami
    expect(flightNumberAt(flights, at(9, 42))).toBeNull(); // uruchomienie silnika
  });
});

describe('wartości startowe dopisywanych pozycji', () => {
  it('PIERWSZY lot bierze CAŁY bieg silnika (pkt 8)', () => {
    const draft = { ...emptyManualFlightDraft(DAY), engineStart: at(9, 42), engineStop: at(11, 18) };
    expect(nextFlightTimes(draft)).toEqual({ takeoff: at(9, 42), landing: at(11, 18) });
  });

  it('kolejny lot biegnie od ostatniego lądowania do wyłączenia silnika', () => {
    // Nie „10 minut po ostatnim lądowaniu, 30 minut długości" (tak było do issue #62):
    // te liczby brały się znikąd i trzeba je było poprawiać dwoma arkuszami.
    expect(nextFlightTimes(jumpDayDraft())).toEqual({ takeoff: at(11, 14), landing: at(11, 18) });
  });

  it('bez biegu silnika nowy lot nie ma czego dziedziczyć', () => {
    expect(nextFlightTimes(emptyManualFlightDraft(DAY))).toBeNull();
  });

  it('nowy zrzut ląduje w PIERWSZYM locie, który zrzutu jeszcze nie ma', () => {
    // Do issue #62 każdy nowy zrzut trafiał w połowę OSTATNIEGO lotu, więc na dniu
    // skokowym wszystkie lądowały w tym samym — a pilot dopisuje je po kolei.
    const draft = jumpDayDraft();
    expect(nextDropAt(draft)).toBe(at(10, 1)); // środek lotu 1

    const withFirst: ManualFlightDraft = {
      ...draft,
      drops: [{ id: 'd1', at: at(10, 1), jumpers: null, altitudeFt: null }],
    };
    expect(nextDropAt(withFirst)).toBe(at(10, 39)); // środek lotu 2
  });

  it('gdy każdy lot ma już zrzut, kolejny idzie do ostatniego', () => {
    const draft: ManualFlightDraft = {
      ...jumpDayDraft(),
      drops: [
        { id: 'd1', at: at(10, 1), jumpers: null, altitudeFt: null },
        { id: 'd2', at: at(10, 39), jumpers: null, altitudeFt: null },
        { id: 'd3', at: at(11, 7), jumpers: null, altitudeFt: null },
      ],
    };
    expect(nextDropAt(draft)).toBe(at(11, 7)); // środek lotu 3
  });

  it('bez lotów zrzut nie ma gdzie stanąć', () => {
    const draft = { ...emptyManualFlightDraft(DAY), engineStart: at(9, 42), engineStop: at(11, 18) };
    expect(nextDropAt(draft)).toBeNull();
  });
});
