/**
 * UZ Aero - panel: plakietka licznika w nawigacji (moduł czysty).
 *
 * Jedna reguła, cztery przypadki: **zero jest neutralne**. Mockup `A03` ma
 * `nav-count amber` z siódemką, `A03b` - goły `nav-count` z zerem.
 */

import { describe, expect, it } from 'vitest';

import { openFlagsCount } from './navCounts';

describe('openFlagsCount', () => {
  it('otwarte sprawy dostają amber - to zaległość, nie statystyka', () => {
    expect(openFlagsCount(7)).toEqual({ value: 7, tone: 'amber' });
    expect(openFlagsCount(1)).toEqual({ value: 1, tone: 'amber' });
  });

  it('zero jest NEUTRALNE - ani alarmujące, ani zielone', () => {
    // Amber przy zerze przyzwyczajałby do ignorowania koloru, a zieleń robiłaby
    // z braku spraw osiągnięcie, choć znaczy tylko tyle, że dziś nic nie doszło.
    expect(openFlagsCount(0)).toEqual({ value: 0 });
  });

  it('brak odpowiedzi to BRAK plakietki, a nie zero', () => {
    // „0 otwartych flag" jest konkretną wiadomością i nie wolno jej wypisać,
    // zanim serwer ją potwierdzi.
    expect(openFlagsCount(undefined)).toBeUndefined();
  });
});
