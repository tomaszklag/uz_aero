import { describe, expect, it } from 'vitest';

import type { LogPilotDto } from '../../api/dto';
import { idleFoldLabels, idlePilotRow, logbookPilotRow, pilotRangeSummary } from './logbookRows';

const MIN = 60_000;

const pilot: LogPilotDto = {
  pilotId: 'p-1',
  code: 'AKO',
  name: 'Adam Kowalski',
  active: true,
  activeDays: 4,
  sessions: 4,
  openSessions: 0,
  flights: 15,
  blockMs: 460 * MIN,
  flightMs: 380 * MIN,
  dual: { operations: 1, blockMs: 132 * MIN },
  regs: ['SP-AXA', 'SP-KLM'],
  open: null,
};

describe('wiersz osi pilotów', () => {
  it('nalot dowódcy w HH:MM, prawy fotel OSOBNO z liczbą operacji', () => {
    const row = logbookPilotRow(pilot);
    expect(row).toMatchObject({ code: 'AKO', days: '4', operations: '4', flights: '15', block: '07:40', flight: '06:20' });
    expect(row.dual).toEqual({ block: '02:12', note: '1 operacja' });
    expect(row.now).toBeNull();
    expect(row.note).toBeNull();
  });

  it('uczeń bez operacji jako dowódca: zera w nalocie i podpis, dlaczego', () => {
    const row = logbookPilotRow({ ...pilot, sessions: 0, flights: 0, blockMs: 0, flightMs: 0, dual: { operations: 2, blockMs: 232 * MIN } });
    expect(row.block).toBe('00:00');
    expect(row.note).toBe('tylko jako drugi pilot');
    expect(row.dual).toEqual({ block: '03:52', note: '2 operacje' });
  });

  it('zera przy operacji dowódcy W TOKU tłumaczy sygnał „teraz", nie podpis o prawym fotelu', () => {
    const open = { reg: 'SP-AXA', claimedAt: Date.UTC(2026, 8, 6, 8, 15), engineRunning: true };
    const row = logbookPilotRow({ ...pilot, sessions: 0, openSessions: 1, blockMs: 0, dual: { operations: 2, blockMs: 232 * MIN }, open });
    expect(row.now).toBe('leci teraz · SP-AXA');
    expect(row.note).toBeNull();
  });

  it('sygnał „teraz" bez formy z płcią: leci albo trzyma maszynę od kiedy', () => {
    const at = Date.UTC(2026, 8, 6, 8, 15);
    expect(logbookPilotRow({ ...pilot, open: { reg: 'SP-AXA', claimedAt: at, engineRunning: true } }).now).toBe('leci teraz · SP-AXA');
    expect(logbookPilotRow({ ...pilot, open: { reg: 'SP-KLM', claimedAt: at, engineRunning: false } }).now).toBe('trzyma SP-KLM od 06 WRZ 08:15');
    expect(logbookPilotRow({ ...pilot, open: { reg: null, claimedAt: null, engineRunning: false } }).now).toBe('trzyma —');
  });

  it('wyłączony członek, który latał, zostaje z podpisem', () => {
    expect(logbookPilotRow({ ...pilot, active: false }).note).toBe('członkostwo wyłączone');
  });

  it('członek bez lotów po rozwinięciu to wiersz zer', () => {
    expect(idlePilotRow({ pilotId: 'p-9', code: 'ESO', name: 'Ewa Sokół' })).toMatchObject({
      name: 'Ewa Sokół',
      operations: '0',
      block: '00:00',
      dual: null,
      regs: [],
    });
  });
});

describe('napisy poziomu 1 i 2', () => {
  it('wiersz zwinięcia liczy członków słowem odmienionym', () => {
    expect(idleFoldLabels(1).closed).toBe('+1 członek bez lotów w tym zakresie');
    expect(idleFoldLabels(3)).toEqual({
      closed: '+3 członków bez lotów w tym zakresie',
      open: 'Zwiń · 3 członków bez lotów w tym zakresie',
    });
  });

  it('podtytuł pilota niesie liczby z wiersza osi, prawy fotel tylko gdy jest', () => {
    expect(pilotRangeSummary(pilot)).toBe('w zakresie 4 operacje · 07:40 blok · jako drugi pilot 02:12');
    expect(pilotRangeSummary({ ...pilot, sessions: 1, dual: null })).toBe('w zakresie 1 operacja · 07:40 blok');
  });

  it('podtytuł nazywa operację w toku POZA sumami, jak nagłówek doby', () => {
    expect(pilotRangeSummary({ ...pilot, openSessions: 1 })).toBe(
      'w zakresie 4 operacje · 07:40 blok · 1 w toku · jako drugi pilot 02:12',
    );
    expect(pilotRangeSummary({ ...pilot, sessions: 0, blockMs: 0, openSessions: 1, dual: null })).toBe(
      'w zakresie 0 operacji · 00:00 blok · 1 w toku',
    );
  });
});
