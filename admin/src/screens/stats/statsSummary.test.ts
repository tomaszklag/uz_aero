/**
 * UZ Aero - panel: podtytuł i chip zakresu statystyk.
 */

import { describe, expect, it } from 'vitest';

import { statsFixture } from '../../../test/fixtures/stats';
import { rangeChipLabel, rangeChipTitle, statsPageSub } from './statsSummary';

describe('statsPageSub', () => {
  it('konstytucja ekranu + zdanie o sesjach otwartych POZA zakresem', () => {
    const sub = statsPageSub(statsFixture().totals);
    expect(sub).toContain('panel sumuje gotowe wyniki, nie liczy własnych metryk');
    expect(sub).toContain('2 sesje są celowo poza zakresem');
  });

  it('zero sesji otwartych jest powiedziane wprost, a brak danych bez zmyślania', () => {
    const totals = statsFixture().totals;
    totals.openSessionsInRange = 0;
    expect(statsPageSub(totals)).toContain('nie ma sesji jeszcze otwartych');
    expect(statsPageSub(null)).not.toContain('otwart');
  });

  it('podtytuł mówi, że sumy liczą się po dniu ZDANIA - inna oś niż lista dni', () => {
    // Ta sama para dat na A02 (oś przejęcia) i A10 (oś zdania) może dać INNY zbiór
    // sesji - bez tego zdania rozjazd wyglądałby na błąd którejś z list. Po §3.6a jest
    // realny: zmiana wieczorna przejęta 30 JUL bywa zdana 31 JUL nad ranem.
    expect(statsPageSub(null)).toContain('po dniu zdania samolotu');
    expect(statsPageSub(statsFixture().totals)).toContain('może różnić się od listy dni');
  });

  it('sesje BEZ `session_claim` są odróżnione od otwartych w zakresie', () => {
    // Zmiana znaczenia z 2026-08-07: „sam claim, telefon padł przed preflightem"
    // przestało być tym licznikiem. Sesja z samym claimem MA dziś datę i jest zwykłą
    // sesją w toku; bez daty zostaje wyłącznie strumień POŁAMANY (§4.4).
    const totals = statsFixture().totals;
    totals.openSessionsUndated = 1;
    const sub = statsPageSub(totals);
    expect(sub).toContain('2 sesje są celowo poza zakresem');
    expect(sub).toContain('1 otwarta sesja nie ma zdarzenia `session_claim`');
    expect(sub).toContain('rejestr niekompletny');

    // Zero sesji bez daty nie dokleja zdania o niczym.
    totals.openSessionsUndated = 0;
    expect(statsPageSub(totals)).not.toContain('session_claim');
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
