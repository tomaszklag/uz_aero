import { describe, expect, it } from 'vitest';


import type { SessionListItemDto } from '../../api/dto';
import { voidFacts } from './sessionVoid';

const DAY = Date.UTC(2026, 7, 12);
const at = (h: number, m: number): number => DAY + h * 3600_000 + m * 60_000;

const session: SessionListItemDto = {
  sessionUuid: 's-1',
  signature: 'SP-KLM/2026-08-12/TMK/1',
  aircraftId: 'a-1',
  reg: 'SP-KLM',
  aircraftType: 'Cessna 182',
  mhFormat: 'decimal',
  picId: 'p-1',
  picCode: 'TMK',
  picName: 'Tomasz Małkiewicz',
  dualCode: null,
  dualName: null,
  status: 'closed',
  operation: 'ferry',
  client: null,
  claimedAt: at(7, 50),
  closeTime: at(16, 45),
  engineStartAt: at(8, 42),
  engineStopAt: at(10, 22),
  firstTakeoffAt: at(9, 1),
  lastLandingAt: at(10, 14),
  departureIcao: 'EPKK',
  arrivalIcao: 'EPBA',
  blockMs: 100 * 60_000,
  flightMs: 73 * 60_000,
  flightsCount: 3,
  takeoffCount: 3,
  landingCount: 3,
  mhStart: 1284.6,
  mhEnd: 1286.1,
  fuelStartL: 112,
  fuelAddedL: 40,
  fuelEndL: 98,
  oilLevelL: 10.2,
  oilAddedL: 1,
  oilAfterL: 11.2,
  manualEntry: false,
  updatedAt: '2026-08-12T16:45:00.000Z',
};

describe('potwierdzenie nazywa KONKRETNY wpis', () => {
  it('zaczyna się od NAZWY operacji, potem dzień, silnik, pilot i rachunki', () => {
    // Dwa wpisy tej samej maszyny w dobie różnią się wyłącznie godzinami - bez nich
    // pytanie „unieważnić?" nie ma jak odróżnić porannej zmiany od popołudniowej.
    // Od issue #68 odróżnia je JEDEN napis i dlatego stoi pierwszy.
    expect(voidFacts(session)).toEqual([
      { label: 'Operacja', value: 'SP-KLM/2026-08-12/TMK/1' },
      { label: 'Dzień', value: '12 AUG 2026' },
      { label: 'Silnik', value: '08:42 → 10:22' },
      { label: 'Pilot', value: 'T. Małkiewicz' },
      { label: 'Loty', value: '3' },
      { label: 'Czas blokowy', value: '1:40' },
    ]);
  });

  it('operacja W TOKU mówi „w toku", a nie kreskę przy godzinie wyłączenia', () => {
    // „W dowolnym momencie" obejmuje maszynę, którą ktoś właśnie trzyma - to jest
    // dokładnie ta sytuacja, w której wpis otwarty przez pomyłkę trzeba wycofać.
    const running = { ...session, status: 'active' as const, engineStopAt: null };
    expect(voidFacts(running)[2]).toEqual({ label: 'Silnik', value: '08:42 → w toku' });
  });

  it('operacja bez biegu silnika: kreska, nigdy zero', () => {
    // `0:00` czytałoby się jak zmierzone zero, a tu nikt niczego nie zmierzył.
    const noRun = { ...session, engineStartAt: null, engineStopAt: null, blockMs: 0 };
    expect(voidFacts(noRun)).toContainEqual({ label: 'Czas blokowy', value: '—' });
  });
});
