/**
 * UZ Aero — panel: wiersze ujęcia „per pilot".
 *
 * Atrybucja po PIC-u; kolumny „Blok jako Dual" NIE MA (backend nie ma jej z czego
 * uczciwie policzyć) i przypis pod tabelą mówi to wprost.
 */

import { describe, expect, it } from 'vitest';

import { statsFixture } from '../../../test/fixtures/stats';
import { pilotRows, PILOTS_HINT } from './statsPilotRows';

describe('pilotRows', () => {
  const data = statsFixture();
  const rows = pilotRows(data.pilots, data.totals);

  it('wiersz pilota: blok jako PIC, starty przypisane PIC-owi, jednostki po kropce', () => {
    expect(rows[0]).toMatchObject({
      name: 'Anna Wrzosek',
      code: 'AWR',
      days: '19',
      blockPic: '84:22',
      flight: '54:38',
      takeoffsLandings: '131 / 131',
      regs: 'SP-ABC · SP-KLM',
    });
  });

  it('konto skasowane zostaje w tabeli z identyfikatorem, nie znika', () => {
    const data = statsFixture();
    data.pilots[0]!.code = null;
    data.pilots[0]!.name = null;
    const row = pilotRows(data.pilots, data.totals)[0]!;
    expect(row.name).toBe('AWR');
    expect(row.code).toBe('—');
  });

  it('RAZEM: dni i blok z `totals` serwera; liczba pilotów = wiersze TABELI (PIC-owie)', () => {
    const total = rows[rows.length - 1]!;
    expect(total).toMatchObject({
      total: true,
      name: 'RAZEM',
      // Trzej PIC-owie w tabeli — kafel „5 pilotów" liczy TAKŻE dualów i różnica
      // jest opisana w przypisie, nie sklejona w jedną liczbę.
      code: '3 pilotów',
      days: '53',
      blockPic: '186:39',
      takeoffsLandings: '356 / 356',
      regs: '3 samoloty',
    });
  });

  it('przypis mówi PRAWDĘ o kaflu „piloci": ostatni dual dnia, nie każdy dual', () => {
    expect(PILOTS_HINT).toContain('Blok jako Dual');
    expect(PILOTS_HINT).toContain('ostatniego duala dnia');
    // Kafel liczy PIC-ów i OSTATNIEGO duala każdego dnia — obietnica „pilot latający
    // wyłącznie jako Dual liczy się do kafla" byłaby fałszywa dla duala zastąpionego
    // w środku dnia (ta sama granica projekcji, co brak kolumny Duala).
    expect(PILOTS_HINT).toContain('OSTATNIEGO duala każdego dnia');
    expect(PILOTS_HINT).toContain('zastąpiony w środku dnia może nie być policzony');
    expect(PILOTS_HINT).not.toContain('wyłącznie jako Dual liczy się do kafla');
  });
});
