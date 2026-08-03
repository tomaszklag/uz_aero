/**
 * UZ Aero — panel: podtytuł i chip zakresu statystyk.
 */

import { describe, expect, it } from 'vitest';

import { statsFixture } from '../../../test/fixtures/stats';
import { rangeChipLabel, rangeChipTitle, statsPageSub } from './statsSummary';

describe('statsPageSub', () => {
  it('konstytucja ekranu + zdanie o dniach otwartych POZA zakresem', () => {
    const sub = statsPageSub(statsFixture().totals);
    expect(sub).toContain('panel sumuje gotowe wyniki, nie liczy własnych metryk');
    expect(sub).toContain('2 dni jeszcze otwarte są celowo poza zakresem');
  });

  it('zero dni otwartych jest powiedziane wprost, a brak danych bez zmyślania', () => {
    const totals = statsFixture().totals;
    totals.openSessionsInRange = 0;
    expect(statsPageSub(totals)).toContain('nie ma dni jeszcze otwartych');
    expect(statsPageSub(null)).not.toContain('otwart');
  });

  it('podtytuł mówi, że sumy liczą się po dniu ZAMKNIĘCIA — inna oś niż lista dni', () => {
    // Ta sama para dat na A02 (oś duty startu) i A10 (oś zamknięcia) może dać INNY
    // zbiór dni — bez tego zdania rozjazd wyglądałby na błąd którejś z list.
    expect(statsPageSub(null)).toContain('po dniu zamknięcia');
    expect(statsPageSub(statsFixture().totals)).toContain('może różnić się od listy dni');
  });

  it('dni otwarte BEZ duty startu (sam claim) są odróżnione od otwartych w zakresie', () => {
    const totals = statsFixture().totals;
    totals.openSessionsUndated = 1;
    const sub = statsPageSub(totals);
    expect(sub).toContain('2 dni jeszcze otwarte są celowo poza zakresem');
    expect(sub).toContain('1 dzień jeszcze otwarty nie ma duty startu');

    // Zero sesji bez daty nie dokleja zdania o niczym.
    totals.openSessionsUndated = 0;
    expect(statsPageSub(totals)).not.toContain('nie ma duty startu');
  });
});

describe('rangeChipLabel', () => {
  it('jeden rok raz, dwa lata jawnie', () => {
    expect(rangeChipLabel(statsFixture().range)).toBe('01 JUL → 30 JUL 2026');
    const range = statsFixture().range;
    range.fromDay = '2025-12-01';
    expect(rangeChipLabel(range)).toBe('01 DEC 2025 → 30 JUL 2026');
  });

  it('tytuł chipa mówi o zakresie domyślnym serwera', () => {
    const range = statsFixture().range;
    range.defaulted = true;
    expect(rangeChipTitle(range)).toContain('ostatnie 30 dni');
    expect(rangeChipTitle(statsFixture().range)).toContain('wraca do zakresu domyślnego');
  });
});
