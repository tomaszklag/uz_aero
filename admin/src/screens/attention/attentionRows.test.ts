/**
 * Ninerdeck - panel 3.2: lista spraw „Do sprawdzenia" - trzy karty, wiek, linki, znikanie.
 */

import { describe, expect, it } from 'vitest';

import type { AttentionDto, ExportListItemDto, FlagDto, SessionListItemDto } from '../../api/dto';
import { attentionCards } from './attentionRows';

const DAY = Date.UTC(2026, 8, 6);
const HOUR = 3_600_000;
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

const flag = (patch: Partial<FlagDto>): FlagDto => ({
  id: 7,
  type: 'aircraft_overlap',
  status: 'open',
  aircraftId: 'SP-KLM',
  reg: 'SP-KLM',
  aircraftType: 'Cessna 182',
  mhFormat: 'hhmm',
  sessionUuids: ['a', 'b'],
  sessions: [
    {
      sessionUuid: 'a',
      signature: 'SP-KLM/2026-09-06/BNO/1',
      aircraftId: 'SP-KLM',
      reg: 'SP-KLM',
      picId: 'BNO',
      picCode: 'BNO',
      picName: 'Barbara Nowak',
      status: 'active',
      claimedAt: at(8, 15),
      closeTime: null,
      tab: '2026-09-06_SP-KLM',
    },
    {
      sessionUuid: 'b',
      signature: 'SP-KLM/2026-09-06/MZI/1',
      aircraftId: 'SP-KLM',
      reg: 'SP-KLM',
      picId: 'MZI',
      picCode: 'MZI',
      picName: 'Marta Zięba',
      status: 'closed',
      claimedAt: at(15, 40),
      closeTime: at(16, 10),
      tab: '2026-09-06_SP-KLM',
    },
  ],
  details: { openSessions: 2 },
  createdAt: new Date(at(15, 41)).toISOString(),
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
  blocksExport: true,
  ...patch,
});

const missing = (patch: Partial<ExportListItemDto>): ExportListItemDto => ({
  sessionUuid: 'e-1',
  signature: 'SP-AXA/2026-09-04/AKO/1',
  tab: '2026-09-04_SP-AXA',
  day: '2026-09-04',
  claimedAt: at(8, 0) - 2 * 24 * HOUR,
  closeTime: at(9, 52) - 2 * 24 * HOUR,
  aircraftId: 'SP-AXA',
  reg: 'SP-AXA',
  aircraftType: 'Cessna 182',
  picId: 'AKO',
  picCode: 'AKO',
  picName: 'Adam Kowalski',
  sessionStatus: 'closed',
  state: 'missing',
  revision: null,
  exportedAt: null,
  sheetUrl: null,
  blockingFlagIds: [],
  updatedAt: new Date(at(9, 53) - 2 * 24 * HOUR).toISOString(),
  overwrittenBy: null,
  ...patch,
});

const stale = (patch: Partial<SessionListItemDto>): SessionListItemDto =>
  ({
    sessionUuid: 's-1',
    signature: 'SP-KLM/2026-09-06/BNO/1',
    aircraftId: 'SP-KLM',
    reg: 'SP-KLM',
    aircraftType: 'Cessna 182',
    mhFormat: 'hhmm',
    picId: 'BNO',
    picCode: 'BNO',
    picName: 'Barbara Nowak',
    dualId: null,
    dualCode: null,
    dualName: null,
    status: 'active',
    operation: 'skoki',
    client: null,
    claimedAt: at(8, 15),
    closeTime: null,
    engineStartAt: at(8, 40),
    engineStopAt: null,
    firstTakeoffAt: null,
    lastLandingAt: null,
    departureIcao: null,
    arrivalIcao: null,
    blockMs: 0,
    flightMs: 0,
    flightsCount: 0,
    takeoffCount: null,
    landingCount: null,
    mhStart: null,
    mhEnd: null,
    fuelStartL: null,
    fuelAddedL: null,
    fuelEndL: null,
    oilLevelL: null,
    oilAddedL: null,
    oilAfterL: null,
    manualEntry: null,
    exportRevision: null,
    openFlags: [],
    updatedAt: new Date(at(11, 52)).toISOString(),
    ...patch,
  }) as SessionListItemDto;

const dto = (patch: Partial<AttentionDto>): AttentionDto => ({
  at: new Date(at(18, 0) + 24 * HOUR).toISOString(),
  correctionWindowMs: 24 * HOUR,
  counts: { openFlags: 1, exports: { total: 5, current: 3, blocked: 0, missing: 1, waiting: 1, impossible: 0, revised: 0, overwritten: 0 }, staleOpenDays: 1, attention: 3 },
  attention: { flags: [flag({})], failedExports: [missing({})], staleOpenDays: [stale({})] },
  ...patch,
});

describe('trzy karty', () => {
  it('nakładka: kto trzyma i od kiedy, kto przejął i zdał, którą kartę trzyma poza arkuszem', () => {
    const [flags] = attentionCards(dto({}));
    expect(flags?.title).toBe('Rozjazdy');
    expect(flags?.count).toBe(1);
    expect(flags?.rows[0]).toMatchObject({
      to: '/do-sprawdzenia/rozjazdy/7',
      tone: 'red',
      title: 'Dwie operacje naraz · SP-KLM',
      meta: 'B. Nowak trzyma maszynę od 6 WRZ 08:15 · M. Zięba: przejęcie 15:40, zdanie 16:10 · trzyma kartę 2026-09-06_SP-KLM poza arkuszem',
      age: '1 dzień 2 h',
      old: true,
    });
  });

  it('karta bez arkusza: nazwa karty w tytule, kto i kiedy zdał, droga do ponowienia', () => {
    const exports = attentionCards(dto({}))[1];
    expect(exports?.title).toBe('Karty bez arkusza');
    expect(exports?.rows[0]).toMatchObject({
      to: '/do-sprawdzenia/karty/e-1?stan=bez-karty',
      tone: 'red',
      title: '2026-09-04_SP-AXA nie trafiła do arkusza',
      meta: 'A. Kowalski · samolot zdany 4 WRZ 09:52 - eksport się nie zapisał · ponów w kartach dnia',
      old: true,
    });
  });

  it('operacja wisząca prowadzi na kartę operacji w dzienniku i mówi, od kiedy wisi', () => {
    const stale = attentionCards(dto({}))[2];
    expect(stale?.title).toBe('Operacje wiszące');
    expect(stale?.link).toBeNull();
    expect(stale?.rows[0]).toMatchObject({
      to: '/dziennik/SP-KLM/s-1',
      tone: 'amber',
      title: 'SP-KLM/2026-09-06/BNO/1 · B. Nowak · samolot niezdany',
      meta: 'przejęcie 6 WRZ 08:15 · silnik 08:40 → ? · ostatni zapis 6 WRZ 11:52 · zakończ w dzienniku',
      age: '1 dzień 9 h',
      old: true,
    });
  });

  it('wiek młodszy niż okno korekty nie jest czerwony', () => {
    const fresh = dto({ at: new Date(at(16, 0)).toISOString() });
    expect(attentionCards(fresh)[0]?.rows[0]).toMatchObject({ age: '19 min', old: false });
  });
});

describe('znikanie i stopka', () => {
  it('karta bez spraw NIE powstaje - także gdy inne mają sprawy', () => {
    const cards = attentionCards(
      dto({
        counts: { openFlags: 0, exports: { total: 5, current: 4, blocked: 0, missing: 1, waiting: 0, impossible: 0, revised: 0, overwritten: 0 }, staleOpenDays: 0, attention: 1 },
        attention: { flags: [], failedExports: [missing({})], staleOpenDays: [] },
      }),
    );
    expect(cards.map((card) => card.key)).toEqual(['exports']);
  });

  it('nic nie czeka = zero kart', () => {
    expect(
      attentionCards(
        dto({
          counts: { openFlags: 0, exports: { total: 0, current: 0, blocked: 0, missing: 0, waiting: 0, impossible: 0, revised: 0, overwritten: 0 }, staleOpenDays: 0, attention: 0 },
          attention: { flags: [], failedExports: [], staleOpenDays: [] },
        }),
      ),
    ).toEqual([]);
  });

  it('stopka „Pokaż wszystkie" WYŁĄCZNIE przy liście przyciętej przez serwer', () => {
    expect(attentionCards(dto({}))[0]?.more).toBeNull();
    const cut = attentionCards(dto({ counts: { ...dto({}).counts, openFlags: 12 } }))[0];
    expect(cut?.more).toEqual({ to: '/do-sprawdzenia/rozjazdy', label: 'Pokaż wszystkie 12' });
  });
});
