/**
 * Ninerdeck (serwer) - chwila ostrzeżenia „Zlecenie bez kompletu załogi" (#245,
 * `docs/zlecenia.md` §5.5, pkt 45): 18:00 czasu klubu w przeddzień doby terminu.
 *
 * Asercje kotwiczą się w CZASIE LOKALNYM zapisanym wprost w UTC - latem Warszawa to +2,
 * zimą +1 - bo to jest jedyny niezależny sprawdzian: ta sama formuła po obu stronach
 * asercji byłaby kołem.
 */

import { describe, expect, it } from 'vitest';

import { unfilledWarnAt, warnDecision } from '../src/domain/orderDeadlines.ts';

const ZONE = 'Europe/Warsaw';
const at = (iso: string): number => Date.parse(iso);

describe('chwila ostrzeżenia', () => {
  it('lato: lot w środę 12:00 czasu klubu - ostrzeżenie we wtorek 18:00 (16:00 UTC)', () => {
    expect(unfilledWarnAt(ZONE, at('2026-06-24T10:00:00Z'))).toBe(at('2026-06-23T16:00:00Z'));
  });

  it('lot o 00:30 należy do NASTĘPNEJ doby - ostrzeżenie o 18:00 dnia, który trwa', () => {
    expect(unfilledWarnAt(ZONE, at('2026-06-24T22:30:00Z'))).toBe(at('2026-06-24T16:00:00Z'));
  });

  it('dzień zmiany czasu jesienią: przeddzień w czasie letnim, dzień po - w zimowym', () => {
    // 25 października 2026 zegar cofa się o 03:00. Lot tego dnia o 12:00 (CET, 11:00 UTC):
    // przeddzień 24 X jest jeszcze letni - 18:00 CEST = 16:00 UTC.
    expect(unfilledWarnAt(ZONE, at('2026-10-25T11:00:00Z'))).toBe(at('2026-10-24T16:00:00Z'));
    // Lot 26 X o 10:00 (CET, 09:00 UTC): przeddzień to doba 25-godzinna, a ostrzeżenie
    // i tak pada o 18:00 czasu zimowego = 17:00 UTC.
    expect(unfilledWarnAt(ZONE, at('2026-10-26T09:00:00Z'))).toBe(at('2026-10-25T17:00:00Z'));
  });

  it('dzień zmiany czasu wiosną: przeddzień 23-godzinny, ostrzeżenie o 18:00 CEST', () => {
    // 29 marca 2026 zegar przesuwa się o 02:00. Lot 30 III o 10:00 (CEST, 08:00 UTC).
    expect(unfilledWarnAt(ZONE, at('2026-03-30T08:00:00Z'))).toBe(at('2026-03-29T16:00:00Z'));
  });
});

describe('rozstrzygnięcie raz, o 18:00 (decyzja 2026-09-29)', () => {
  const order = {
    createdAt: at('2026-06-22T08:00:00Z'),
    startsAt: at('2026-06-24T10:00:00Z'),
    decidedAt: null,
    complete: false,
  };

  it('dopiero od chwili ostrzeżenia, raz, i nigdy po początku terminu', () => {
    expect(warnDecision(order, ZONE, at('2026-06-23T15:59:00Z'))).toBeNull();
    expect(warnDecision(order, ZONE, at('2026-06-23T16:00:00Z'))).toBe('warn');
    expect(warnDecision({ ...order, decidedAt: at('2026-06-23T16:00:00Z') }, ZONE, at('2026-06-23T17:00:00Z'))).toBeNull();
    expect(warnDecision(order, ZONE, at('2026-06-24T10:00:00Z'))).toBeNull();
  });

  it('komplet o 18:00 rozstrzyga ostrzeżenie BEZ wiadomości - późniejsza rezygnacja już nie ostrzega', () => {
    expect(warnDecision({ ...order, complete: true }, ZONE, at('2026-06-23T16:05:00Z'))).toBe('quiet');
  });

  it('zlecenie wysłane po chwili ostrzeżenia rozstrzyga się bez wiadomości (pkt 45)', () => {
    const late = { ...order, createdAt: at('2026-06-23T18:30:00Z') };
    expect(warnDecision(late, ZONE, at('2026-06-23T19:00:00Z'))).toBe('quiet');
  });
});
