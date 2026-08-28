/**
 * UZ Aero (serwer) — test ciągłości paliwa wokół chwili (issue #62, piąta tura).
 *
 * Czysta funkcja na wierszach projekcji, więc test nie potrzebuje bazy ani serwera.
 */

import { describe, expect, it } from 'vitest';

import { fuelChainNeighbours } from '../src/domain/fuelChain.ts';
import type { SessionRow } from '../src/application/common/ports.ts';

const DAY = Date.UTC(2026, 7, 16);
const at = (h: number, m = 0): number => DAY + (h * 60 + m) * 60_000;

/** Wiersz projekcji z tylko tymi polami, które czyta łańcuch paliwa. */
function session(over: Partial<SessionRow> & { sessionUuid: string }): SessionRow {
  return {
    aircraftId: 'sp-axa',
    picId: 'tmk',
    dualId: null,
    status: 'closed',
    claimTime: null,
    closeTime: null,
    operation: null,
    client: null,
    notes: null,
    mhStart: null,
    mhEnd: null,
    fuelStartL: null,
    fuelEndL: null,
    ...over,
  } as SessionRow;
}

/** Trzy sesje jednej maszyny: rano, w południe, wieczorem. */
const HISTORY: SessionRow[] = [
  session({
    sessionUuid: 'rano',
    picId: 'ako',
    claimTime: at(7),
    closeTime: at(9),
    fuelStartL: 180,
    fuelEndL: 140,
    mhStart: 1230,
    mhEnd: 1232,
  }),
  session({
    sessionUuid: 'wieczor',
    picId: 'jkw',
    claimTime: at(15),
    closeTime: at(17),
    fuelStartL: 96,
    fuelEndL: 60,
    mhStart: 1240,
    mhEnd: 1242,
  }),
];

describe('sąsiedztwo w łańcuchu paliwa', () => {
  it('podaje, czym maszyna została ZDANA przed tą chwilą i co zastał NASTĘPNY pilot', () => {
    const { before, after } = fuelChainNeighbours(HISTORY, at(12));

    expect(before).toEqual({
      sessionUuid: 'rano',
      picId: 'ako',
      at: at(9),
      fuelL: 140,
      mh: 1232,
    });
    expect(after).toEqual({
      sessionUuid: 'wieczor',
      picId: 'jkw',
      at: at(15),
      fuelL: 96,
      mh: 1240,
    });
  });

  it('brak sąsiada to NORMALNY stan, nie brak danych', () => {
    // Pierwszy lot maszyny nie ma poprzednika, najnowszy nie ma następcy.
    expect(fuelChainNeighbours(HISTORY, at(6)).before).toBeNull();
    expect(fuelChainNeighbours(HISTORY, at(20)).after).toBeNull();
    expect(fuelChainNeighbours([], at(12))).toEqual({ before: null, after: null });
  });

  it('bierze NAJBLIŻSZYCH sąsiadów, nie pierwszego z brzegu', () => {
    const dense = [
      ...HISTORY,
      session({
        sessionUuid: 'poludnie',
        picId: 'zzz',
        claimTime: at(10),
        closeTime: at(11),
        fuelStartL: 140,
        fuelEndL: 120,
        mhStart: 1232,
        mhEnd: 1233,
      }),
    ];
    const { before } = fuelChainNeighbours(dense, at(12));
    expect(before?.sessionUuid).toBe('poludnie');
  });

  it('pomija sesje BEZ odczytów — zero udające odczyt jest gorsze od milczenia', () => {
    const withOpen = [
      ...HISTORY,
      // Sesja trwająca: zamknięcia i odczytu końcowego jeszcze nie ma.
      session({ sessionUuid: 'trwa', status: 'active', claimTime: at(10), fuelStartL: 140 }),
      // Sesja zamknięta, ale bez odczytu — rejestr niekompletny.
      session({ sessionUuid: 'bezodczytu', claimTime: at(10), closeTime: at(11) }),
    ];
    const { before } = fuelChainNeighbours(withOpen, at(12));
    expect(before?.sessionUuid).toBe('rano');
  });

  it('WYKLUCZA wskazaną sesję — poprawiany wpis nie może być sobie punktem odniesienia', () => {
    // Bez wykluczenia sesja „rano" byłaby własnym poprzednikiem przy jej poprawianiu.
    const { before } = fuelChainNeighbours(HISTORY, at(12), 'rano');
    expect(before).toBeNull();
  });

  it('granice są DOMKNIĘTE — zdanie i przejęcie co do minuty to normalny dzień', () => {
    // Zetknięcie sesji co do minuty nie jest nakładką (§3.6a), więc odczyt z tej samej
    // chwili jest właściwym sąsiadem, a nie przypadkiem do pominięcia.
    expect(fuelChainNeighbours(HISTORY, at(9)).before?.sessionUuid).toBe('rano');
    expect(fuelChainNeighbours(HISTORY, at(15)).after?.sessionUuid).toBe('wieczor');
  });
});
