/**
 * UZ Aero — panel: historia rewizji karty.
 *
 * Test jednej własności, dla której cały ten ekran istnieje: **N wierszy dziennika
 * i JEDEN wiersz karty**. Gdyby panel sklejał te dwie liczby w jedną, przestałby
 * pokazywać jedyny ślad rozjazdu arkusz↔rejestr.
 */

import { describe, expect, it } from 'vitest';

import type { ExportHistoryDto, ExportRevisionDto } from '../../api/dto';
import {
  currentRevisionLabel,
  historySummary,
  overwrittenNotice,
  revisionEntries,
} from './exportsHistory';

const revision = (n: number, at: string): ExportRevisionDto => ({
  revision: n,
  day: '2026-07-30',
  sheetUrl: 'http://uzaero.test/sheets/2026-07-30_SP-ABC',
  exportedAt: at,
});

const history = (revisions: ExportRevisionDto[], sheetRows: number): ExportHistoryDto => ({
  sessionUuid: 'sess-1',
  tab: '2026-07-30_SP-ABC',
  state: revisions.length === 0 ? 'missing' : 'current',
  revisions,
  sheetRows,
  overwrittenBy: null,
});

describe('oś rewizji karty', () => {
  it('zachowuje kolejność serwera — oś czasu jednej karty czyta się od początku', () => {
    const entries = revisionEntries([
      revision(1, '2026-07-30T18:52:14.000Z'),
      revision(2, '2026-07-30T22:07:41.000Z'),
      revision(3, '2026-07-31T06:18:09.000Z'),
    ]);

    expect(entries.map((e) => e.badge)).toEqual(['rew. 1', 'rew. 2', 'rew. 3']);
    expect(entries[0]!.name).toContain('pierwszy eksport');
    expect(entries[2]!.name).toContain('od nowa');
  });

  it('pierwsza wysyłka jest zielona, każda kolejna niebieska', () => {
    // Ta sama semantyka kolorów, co na osi dnia: zielone zaczyna, niebieskie opisuje
    // kolejny zapis w dokumencie klubu.
    const entries = revisionEntries([
      revision(1, '2026-07-30T18:52:14.000Z'),
      revision(2, '2026-07-30T22:07:41.000Z'),
    ]);
    expect(entries.map((e) => e.tone)).toEqual(['green', 'blue']);
  });

  it('nie zmyśla POWODU rewizji — `export_log` go nie ma', () => {
    // Mockup podpisuje wiersze „spóźniony sync" i „korekta zdarzenia"; dziennik ma sześć
    // kolumn i żadnej z nich nie jest powód. Wiersz mówi to, co wiadomo.
    const entry = revisionEntries([revision(2, '2026-07-30T22:07:41.000Z')])[0]!;
    expect(entry.meta).toBe('2026-07-30 · http://uzaero.test/sheets/2026-07-30_SP-ABC');
  });
});

describe('plakietka „która rewizja leży w karcie"', () => {
  it('bierze OSTATNIĄ rewizję z osi rosnącej', () => {
    // Do 2026-08-01 rozstrzygał to widok (`revisions[revisions.length - 1]`) — czyli
    // decyzja o treści mieszkała w `.tsx` i opierała się na porządku, którego widok nie
    // ustala. Odwrócenie sortowania na serwerze zmieniłoby napis, nie ruszając testów.
    const summary = currentRevisionLabel(
      history(
        [
          revision(1, '2026-07-30T18:52:14.000Z'),
          revision(2, '2026-07-30T22:07:41.000Z'),
          revision(3, '2026-07-31T06:18:09.000Z'),
        ],
        1,
      ),
    );
    expect(summary).toBe('rewizja 3');
  });

  it('pusty dziennik mówi „brak rewizji", a nie „rewizja undefined"', () => {
    expect(currentRevisionLabel(history([], 0))).toBe('brak rewizji');
  });
});

describe('ostrzeżenie „ta treść jest z innej sesji"', () => {
  it('milczy, gdy karty nikt nie nadpisał', () => {
    expect(overwrittenNotice(history([revision(1, '2026-07-30T18:52:14.000Z')], 1))).toBeNull();
  });

  it('nazywa sesję, która nadpisała, i tłumaczy DLACZEGO tak się dzieje', () => {
    // Podgląd czyta `exported_sheets` po NAZWIE karty, a nazwa nie niesie sesji — więc
    // przy dwóch zmianach tego samego dnia rozwinięcie sesji porannej wyświetla dzień
    // popołudniowy. Bez tego zdania wygląda to na treść klikniętego wiersza.
    const note = overwrittenNotice({
      ...history([revision(1, '2026-07-30T18:52:14.000Z')], 1),
      overwrittenBy: {
        sessionUuid: 'aaaabbbb-cccc-dddd-eeee-000000009999',
        exportedAt: '2026-07-30T21:14:02.000Z',
      },
    })!;

    expect(note).toContain('aaaa…9999');
    expect(note).toContain('exported_sheets');
    expect(note).toContain('nie sesję');
  });
});

describe('podsumowanie „dziennik vs karta"', () => {
  it('liczy WIERSZE OSOBNO: trzy w dzienniku, jeden w karcie', () => {
    const summary = historySummary(
      history(
        [
          revision(1, '2026-07-30T18:52:14.000Z'),
          revision(2, '2026-07-30T22:07:41.000Z'),
          revision(3, '2026-07-31T06:18:09.000Z'),
        ],
        1,
      ),
    );

    expect(summary.logLabel).toBe('export_log · 3 wiersze');
    expect(summary.sheetLabel).toBe('exported_sheets · 1 wiersz');
    expect(summary.note).toContain('append-only');
    expect(summary.note).toContain('ze strumienia zdarzeń');
  });

  it('jedna wysyłka odmienia rzeczownik poprawnie', () => {
    const summary = historySummary(history([revision(1, '2026-07-30T18:52:14.000Z')], 1));
    expect(summary.logLabel).toBe('export_log · 1 wiersz');
  });

  it('pusty dziennik tłumaczy, dlaczego porażek tam nie ma', () => {
    const summary = historySummary(history([], 0));

    expect(summary.logLabel).toBe('export_log · 0 wierszy');
    expect(summary.sheetLabel).toBe('exported_sheets · 0 wierszy');
    expect(summary.note).toContain('po udanym zapisie');
  });
});
