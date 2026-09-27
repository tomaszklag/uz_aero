/**
 * Ninerdeck - panel 3.2: karty dnia - stan po polsku, podtytuły, zdania po ponowieniu
 * i po zamknięciu sprawy.
 */

import { describe, expect, it } from 'vitest';

import type { ExportListItemDto, ExportRetryResultDto } from '../../api/dto';
import {
  alreadyResolvedText,
  EXPORT_CHIPS,
  exportRow,
  exportsSubtitle,
  exportStateOfSlug,
  flagsSubtitle,
  resolveNotice,
  retryNotice,
} from './exportRows';

const DAY = Date.UTC(2026, 8, 6);
const HOUR = 3_600_000;
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

const item = (patch: Partial<ExportListItemDto>): ExportListItemDto => ({
  sessionUuid: 'x',
  signature: 'SP-AXA/2026-09-06/AKO/1',
  tab: '2026-09-06_SP-AXA',
  day: '2026-09-06',
  claimedAt: at(8, 20),
  closeTime: at(11, 12),
  aircraftId: 'SP-AXA',
  reg: 'SP-AXA',
  aircraftType: 'Cessna 182',
  picId: 'AKO',
  picCode: 'AKO',
  picName: 'Adam Kowalski',
  sessionStatus: 'closed',
  state: 'current',
  revision: 2,
  exportedAt: new Date(at(12, 5) + 24 * HOUR).toISOString(),
  sheetUrl: 'https://app.ninerdeck.pl/sheets/x/2026-09-06_SP-AXA?k=1',
  blockingFlagIds: [],
  updatedAt: new Date(at(12, 5) + 24 * HOUR).toISOString(),
  overwrittenBy: null,
  ...patch,
});

const NOW = at(18, 0) + 2 * 24 * HOUR;

describe('wiersz monitora', () => {
  it('nazywa kartę dobą samolotu, operację sygnaturą, a rewizję ponad pierwszą - podpisem', () => {
    const row = exportRow(item({}), NOW, 24 * HOUR);
    expect(row).toMatchObject({
      tab: '2026-09-06_SP-AXA',
      cardSub: '6 września · SP-AXA',
      operation: 'SP-AXA/2026-09-06/AKO/1',
      pilot: 'A. Kowalski',
      stateLabel: 'W arkuszu',
      stateTone: 'green',
      stateNote: 'wysłana ponownie',
      revision: '2',
      exportedAt: '7 WRZ 12:05',
      action: 'retry',
      revised: true,
    });
  });

  it('operacja wisząca: czeka na zdanie z bursztynowym podpisem, od kiedy wisi', () => {
    const row = exportRow(item({ state: 'waiting', sessionStatus: 'active', closeTime: null, revision: null, exportedAt: null }), NOW, 24 * HOUR);
    expect(row).toMatchObject({ stateLabel: 'Czeka na zdanie', stateNote: 'operacja wisi od 2 dni 9 h', stateNoteWarn: true, action: null, revision: '—' });
  });

  it('wstrzymana flagą prowadzi do sprawy, nie do ponowienia', () => {
    const row = exportRow(item({ state: 'blocked', revision: null, exportedAt: null, blockingFlagIds: [1046] }), NOW, 24 * HOUR);
    expect(row).toMatchObject({ stateLabel: 'Wstrzymana flagą', stateNote: 'dwie operacje naraz', action: 'flag', blockingFlagId: 1046 });
  });

  it('wpis unieważniony nie ma sygnatury - ma stan', () => {
    const row = exportRow(item({ state: 'impossible', sessionStatus: 'voided', signature: null }), NOW, 24 * HOUR);
    expect(row).toMatchObject({ operation: 'wpis unieważniony', stateLabel: 'Unieważniona', voided: true, action: null });
  });
});

describe('chipy i podtytuły', () => {
  it('slug stanu wraca do stanu serwera; „rewizje" jest wymiarem bez stanu', () => {
    expect(exportStateOfSlug('bez-karty')).toBe('missing');
    expect(exportStateOfSlug('rewizje')).toBeNull();
    expect(exportStateOfSlug(null)).toBeNull();
    expect(EXPORT_CHIPS.map((chip) => chip.label)).toEqual(['Bez karty', 'Wstrzymane', 'Czekają na zdanie', 'W arkuszu', 'Rewizje']);
  });

  it('podtytuł kart pomija zera i odmienia', () => {
    expect(exportsSubtitle({ total: 14, current: 9, blocked: 1, missing: 1, waiting: 2, impossible: 0, revised: 1, overwritten: 0 })).toBe(
      '14 operacji w zakresie · 9 w arkuszu · 1 bez karty · 1 wstrzymana · 2 czekają na zdanie',
    );
    expect(exportsSubtitle({ total: 1, current: 1, blocked: 0, missing: 0, waiting: 0, impossible: 0, revised: 0, overwritten: 0 })).toBe(
      '1 operacja w zakresie · 1 w arkuszu',
    );
  });

  it('podtytuł skrzynki mówi, ile spraw trzyma kartę poza arkuszem', () => {
    expect(flagsSubtitle(3, 1, false)).toBe('3 otwarte · 1 trzyma kartę poza arkuszem');
    expect(flagsSubtitle(5, 0, false)).toBe('5 otwartych');
    expect(flagsSubtitle(2, 0, true)).toBe('2 rozstrzygnięte');
  });
});

describe('zdania po ponowieniu', () => {
  const result = (patch: Partial<ExportRetryResultDto>): ExportRetryResultDto => ({
    sessionUuid: 'x',
    tab: '2026-09-04_SP-AXA',
    revisionBefore: null,
    revisionAfter: null,
    outcome: null,
    failure: null,
    retriedAt: new Date(at(19, 12) + 24 * HOUR).toISOString(),
    ...patch,
  });

  it('sukces mówi kartę, rewizję i chwilę', () => {
    expect(retryNotice(result({ outcome: { exported: true, tab: '2026-09-04_SP-AXA', revision: 1, url: 'u' }, revisionAfter: 1 }))).toEqual({
      tone: 'ok',
      text: 'Karta 2026-09-04_SP-AXA w arkuszu · rewizja 1 · 7 WRZ 19:12 UTC.',
    });
  });

  it('odmowa jest stanem świata - ton informacyjny z powodem', () => {
    expect(retryNotice(result({ outcome: { exported: false, reason: 'session_open' } })).tone).toBe('status');
    expect(retryNotice(result({ outcome: { exported: false, reason: 'overlap_flag' } })).text).toContain('zamknij sprawę');
  });

  it('awaria arkusza każe spróbować za chwilę; awaria po naszej stronie - nie', () => {
    expect(retryNotice(result({ failure: 'sheets_adapter' }))).toEqual({
      tone: 'danger',
      text: 'Arkusz nie odpowiedział. Spróbuj za chwilę - dane w dzienniku są kompletne.',
    });
    const ours = retryNotice(result({ failure: 'unexpected' }));
    expect(ours.tone).toBe('danger');
    expect(ours.text).toContain('2026-09-04_SP-AXA');
    expect(ours.text).toContain('Ponowienie tego nie naprawi');
  });
});

describe('zdania po zamknięciu sprawy', () => {
  const base = { flagId: 1, type: 'aircraft_overlap' as const, resolvedAt: '2026-09-07T12:40:00.000Z' };

  it('flaga trzymająca kartę: rewizja arkusza w zdaniu', () => {
    expect(resolveNotice({ ...base, exports: [{ sessionUuid: 'a', outcome: { exported: true, tab: '2026-09-06_SP-KLM', revision: 1, url: 'u' } }] })).toEqual({
      tone: 'ok',
      text: 'Sprawa zamknięta. Karta 2026-09-06_SP-KLM (rewizja 1) poszła do arkusza.',
    });
  });

  it('pozostałe rodzaje: samo zamknięcie - re-eksport przy nich nie zachodzi', () => {
    expect(resolveNotice({ ...base, type: 'mh_gap', exports: [] })).toEqual({ tone: 'ok', text: 'Sprawa zamknięta.' });
  });

  it('karta dalej odbita (operacja w toku) - zdanie mówi dlaczego; arkusz padł - każe ponowić', () => {
    expect(resolveNotice({ ...base, exports: [{ sessionUuid: 'a', outcome: { exported: false, reason: 'session_open' } }] }).text).toContain(
      'operacja trwa',
    );
    expect(resolveNotice({ ...base, exports: [{ sessionUuid: 'a', outcome: null }] }).tone).toBe('danger');
  });

  it('odmowa „już rozstrzygnięta" nazywa osobę i chwilę', () => {
    expect(alreadyResolvedText('B. Nowak', '2026-09-07T12:40:00.000Z')).toBe('Ta sprawa jest już rozstrzygnięta - przez B. Nowak, 7 WRZ 12:40 UTC.');
    expect(alreadyResolvedText(null, null)).toBe('Ta sprawa jest już rozstrzygnięta.');
  });
});
