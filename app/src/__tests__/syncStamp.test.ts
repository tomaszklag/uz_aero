/**
 * UZ Aero - testy STEMPLA OSTATNIEJ SYNCHRONIZACJI (`ui/components/status/syncStamp.ts`).
 *
 * Od issue #12 chip łączności pokazuje się WYŁĄCZNIE offline i wtedy ten napis jest
 * jedyną odpowiedzią na pytanie „jak stare jest to, co widzę". Data znika, gdy sync był
 * dziś - i to jest właśnie ta decyzja, którą łatwo zepsuć przy północy UTC, więc ma test.
 */

import { syncStamp } from '../ui/components/status/syncStamp';

const at = (day: number, h: number, m = 0): number => Date.UTC(2026, 5, day, h, m);

describe('stempel ostatniej synchronizacji', () => {
  it('sync z tego samego dnia UTC - sama godzina', () => {
    expect(syncStamp(at(22, 17, 30), at(22, 19, 5))).toBe('SYNC 17:30 UTC');
  });

  it('sync z poprzedniego dnia - z datą, bo sama godzina kłamałaby o wieku danych', () => {
    expect(syncStamp(at(21, 17, 30), at(22, 6, 0))).toBe('SYNC 21 CZE 17:30 UTC');
  });

  it('granica doby UTC liczy się po UTC, nie po strefie telefonu', () => {
    // Cztery minuty różnicy, ale po dwóch stronach północy UTC - data musi wrócić.
    expect(syncStamp(at(21, 23, 58), at(22, 0, 2))).toBe('SYNC 21 CZE 23:58 UTC');
  });

  it('brak synchronizacji mówi to wprost - nie udaje pustego stempla', () => {
    expect(syncStamp(null, at(22, 8, 0))).toBe('BEZ SYNCA');
  });
});
