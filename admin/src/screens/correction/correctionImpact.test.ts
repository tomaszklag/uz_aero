/**
 * UZ Aero — panel: karta „wpływ na liczby dnia · przed → po" (moduł czysty).
 *
 * Ten plik NICZEGO nie liczy i o tym są te testy: `before` i `after` przychodzą
 * z serwera jako dwa `SessionState`, a tutaj tylko się je zestawia. Najważniejszy
 * przypadek — `void` na `engine_stop` — pokazuje, dlaczego panel nie ma prawa liczyć
 * skutku sam: cykl NIE skraca się o różnicę czasów, tylko zostaje otwarty i wypada
 * z czasu blokowego w całości.
 */

import type { SessionState } from '@uzaero/domain';
import { describe, expect, it } from 'vitest';

import { impactRows } from './correctionImpact';

const HOUR = 3_600_000;
const MIN = 60_000;
const DAY = Date.UTC(2026, 6, 30);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * MIN;

const state = (over: Partial<SessionState> = {}): SessionState =>
  ({
    blockTimeMs: 5 * HOUR + 53 * MIN,
    flightTimeMs: 3 * HOUR + 35 * MIN,
    takeoffCount: 9,
    landingCount: 9,
    flights: Array.from({ length: 9 }, () => ({})),
    engineRuns: [
      { startedAt: at(6, 0), stoppedAt: at(7, 0), durationMs: HOUR },
      { startedAt: at(8, 0), stoppedAt: at(9, 0), durationMs: HOUR },
      { startedAt: at(11, 56), stoppedAt: at(13, 13), durationMs: 77 * MIN },
    ],
    engineRunning: false,
    fuel: { startL: 500, addedL: 0, endL: 153, consumedL: 347, lastReadingL: 153 },
    mh: { start: 3902.1, end: 3907.8, deltaH: 5.7 },
    dutyStart: at(5, 45),
    dutyEnd: at(13, 20),
    eventCount: 84,
    ...over,
  }) as unknown as SessionState;

const find = (rows: ReturnType<typeof impactRows>, label: string) =>
  rows.find((row) => row.label === label)!;

describe('retime — skraca cykl i czas blokowy', () => {
  const before = state();
  const after = state({
    blockTimeMs: 5 * HOUR + 41 * MIN,
    engineRuns: [
      { startedAt: at(6, 0), stoppedAt: at(7, 0), durationMs: HOUR },
      { startedAt: at(8, 0), stoppedAt: at(9, 0), durationMs: HOUR },
      { startedAt: at(11, 56), stoppedAt: at(13, 1), durationMs: 65 * MIN },
    ],
  } as Partial<SessionState>);

  const rows = impactRows(before, after, 'decimal');

  it('pokazuje czas blokowy przed i po, w zapisie karty arkusza', () => {
    expect(find(rows, 'Czas blokowy dnia')).toMatchObject({
      before: '05:53',
      after: '05:41',
      changed: true,
    });
  });

  it('wypisuje TEN cykl, który się zmienił — i tylko jego', () => {
    const cycles = rows.filter((row) => row.label.startsWith('Cykl silnika'));
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({
      label: 'Cykl silnika 3',
      before: '01:17:00',
      after: '01:05:00',
    });
  });

  it('wielkości nietknięte zostają na karcie z adnotacją, a nie znikają', () => {
    // Administrator korygujący czas silnika musi ZOBACZYĆ, że starty, lądowania
    // i odczyt motogodzin nie drgnęły — to jest dowód, że korekta dotknęła tylko
    // tego, co miała dotknąć.
    expect(find(rows, 'Starty / lądowania').changed).toBe(false);
    expect(find(rows, 'Δ motogodzin')).toMatchObject({ changed: false, after: '5.7' });
    expect(find(rows, 'Czas służby (duty)')).toMatchObject({ changed: false, after: '07:35' });
  });

  it('motogodziny formatuje wg licznika TEGO samolotu', () => {
    const hhmmRows = impactRows(before, after, 'hhmm');
    expect(find(hhmmRows, 'Δ motogodzin').after).toBe('5:42');
  });
});

describe('void na engine_stop — cykl zostaje OTWARTY', () => {
  // Teza amber-banera z mockupu: `void` jest tu złym narzędziem. Silnik został
  // wyłączony, pomylona jest tylko godzina — a unieważnienie zdarzenia nie skraca
  // cyklu, tylko usuwa go z czasu blokowego w całości.
  const before = state();
  const after = state({
    blockTimeMs: 4 * HOUR + 36 * MIN,
    engineRunning: true,
    engineRuns: [
      { startedAt: at(6, 0), stoppedAt: at(7, 0), durationMs: HOUR },
      { startedAt: at(8, 0), stoppedAt: at(9, 0), durationMs: HOUR },
      { startedAt: at(11, 56), stoppedAt: null, durationMs: 0 },
    ],
  } as Partial<SessionState>);

  const rows = impactRows(before, after, 'decimal');

  it('nazywa cykl OTWARTYM i tłumaczy, co to znaczy dla bloku', () => {
    const cycle = find(rows, 'Cykl silnika 3');
    expect(cycle.after).toBe('otwarty');
    expect(cycle.tone).toBe('red');
    expect(cycle.note).toContain('w całości');
  });

  it('czas blokowy dostaje ton czerwony — dzień bez zamknięcia silnika jest zepsuty', () => {
    const block = find(rows, 'Czas blokowy dnia');
    expect(block).toMatchObject({ before: '05:53', after: '04:36', tone: 'red' });
    expect(block.note).toContain('zamknięcia ostatniego cyklu');
  });
});

describe('void na lądowaniu — bilans przestaje się domykać', () => {
  const before = state();
  const after = state({
    landingCount: 8,
    flightTimeMs: 3 * HOUR + 11 * MIN,
    flights: Array.from({ length: 8 }, () => ({})),
  } as Partial<SessionState>);

  it('ostrzega, że starty i lądowania się nie zgadzają', () => {
    const row = find(impactRows(before, after, 'decimal'), 'Starty / lądowania');
    expect(row).toMatchObject({ before: '9 / 9', after: '9 / 8', changed: true, tone: 'amber' });
    expect(row.note).toContain('NIE domyka');
  });

  it('odmienia liczbę lotów po polsku', () => {
    const row = find(impactRows(before, after, 'decimal'), 'Lotów w dniu');
    expect(row.before).toBe('9 lotów');
    expect(row.after).toBe('8 lotów');
  });
});

describe('czego na karcie NIE MA', () => {
  it('nie liczy „średniego zużycia" ani „blok − Δ MH" — projekcja ich nie niesie', () => {
    // Policzenie ich tutaj byłoby pierwszą liczbą na ekranie, której serwer nigdy
    // nie wysłał, i pierwszą, która rozjedzie się z arkuszem przy zmianie definicji.
    const labels = impactRows(state(), state(), 'decimal').map((row) => row.label);
    expect(labels.some((label) => label.toLowerCase().includes('zużyci'))).toBe(false);
    expect(labels.some((label) => label.includes('Blok −'))).toBe(false);
  });

  it('bez zmian = brak wierszy cykli i wszystko oznaczone jako niezmienione', () => {
    const rows = impactRows(state(), state(), 'decimal');
    expect(rows.filter((row) => row.label.startsWith('Cykl silnika'))).toEqual([]);
    expect(rows.every((row) => !row.changed)).toBe(true);
  });
});
