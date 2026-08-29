/**
 * UZ Aero (serwer) - test ciągłości odczytów wokół chwili (issue #62, piąta tura).
 *
 * Czysta funkcja na wierszach projekcji, więc test nie potrzebuje bazy ani serwera.
 */

import { describe, expect, it } from 'vitest';

import { readingsChainNeighbours } from '../src/domain/readingsChain.ts';
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
    oilLevelL: null,
    oilAddedL: null,
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

describe('sąsiedztwo w łańcuchu odczytów', () => {
  it('podaje, czym maszyna została ZDANA przed tą chwilą i co zastał NASTĘPNY pilot', () => {
    const { before, after } = readingsChainNeighbours(HISTORY, at(12));

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
    expect(readingsChainNeighbours(HISTORY, at(6)).before).toBeNull();
    expect(readingsChainNeighbours(HISTORY, at(20)).after).toBeNull();
    expect(readingsChainNeighbours([], at(12))).toEqual({
      before: null,
      after: null,
      oil: null,
    });
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
    const { before } = readingsChainNeighbours(dense, at(12));
    expect(before?.sessionUuid).toBe('poludnie');
  });

  it('pomija sesje BEZ odczytów - zero udające odczyt jest gorsze od milczenia', () => {
    const withOpen = [
      ...HISTORY,
      // Sesja trwająca: zamknięcia i odczytu końcowego jeszcze nie ma.
      session({ sessionUuid: 'trwa', status: 'active', claimTime: at(10), fuelStartL: 140 }),
      // Sesja zamknięta, ale bez odczytu - rejestr niekompletny.
      session({ sessionUuid: 'bezodczytu', claimTime: at(10), closeTime: at(11) }),
    ];
    const { before } = readingsChainNeighbours(withOpen, at(12));
    expect(before?.sessionUuid).toBe('rano');
  });

  it('WYKLUCZA wskazaną sesję - poprawiany wpis nie może być sobie punktem odniesienia', () => {
    // Bez wykluczenia sesja „rano" byłaby własnym poprzednikiem przy jej poprawianiu.
    const { before } = readingsChainNeighbours(HISTORY, at(12), 'rano');
    expect(before).toBeNull();
  });

  it('granice są DOMKNIĘTE - zdanie i przejęcie co do minuty to normalny dzień', () => {
    // Zetknięcie sesji co do minuty nie jest nakładką (§3.6a), więc odczyt z tej samej
    // chwili jest właściwym sąsiadem, a nie przypadkiem do pominięcia.
    expect(readingsChainNeighbours(HISTORY, at(9)).before?.sessionUuid).toBe('rano');
    expect(readingsChainNeighbours(HISTORY, at(15)).after?.sessionUuid).toBe('wieczor');
  });

  it('niesie MOTOGODZINY obu sąsiadów - łańcuch MH jest osią samolotu (§4.5)', () => {
    const { before, after } = readingsChainNeighbours(HISTORY, at(12));
    expect(before?.mh).toBe(1232);
    expect(after?.mh).toBe(1240);
  });
});

describe('olej idzie WŁASNĄ osią - pomiar żyje tylko przy przejęciu', () => {
  /**
   * Bagnet tuż po locie kłamie, więc zdanie samolotu oleju NIE MIERZY (issue #60):
   * interwał biegnie pomiar→pomiar przez wiele sesji, z kotwicą w liczniku. Olej nie
   * ma więc pary „przed/po" - ma kotwicę i sumę dolewek od niej.
   */
  const WITH_OIL: SessionRow[] = [
    session({
      sessionUuid: 'pomiar',
      picId: 'ako',
      claimTime: at(7),
      closeTime: at(9),
      mhStart: 1230,
      mhEnd: 1232,
      fuelStartL: 180,
      fuelEndL: 140,
      oilLevelL: 9.2,
      oilAddedL: 0,
    }),
    session({
      sessionUuid: 'dolewka',
      picId: 'zzz',
      claimTime: at(10),
      closeTime: at(11),
      mhStart: 1232,
      mhEnd: 1233,
      fuelStartL: 140,
      fuelEndL: 120,
      // Sesja bez pomiaru, ale z dolewką - wchodzi SUMĄ do kotwicy sprzed niej.
      oilAddedL: 1,
    }),
    session({
      sessionUuid: 'pozniejszy-pomiar',
      picId: 'jkw',
      claimTime: at(15),
      closeTime: at(17),
      mhStart: 1240,
      mhEnd: 1242,
      fuelStartL: 96,
      fuelEndL: 60,
      oilLevelL: 8.1,
      oilAddedL: 2,
    }),
  ];

  it('kotwicą jest ostatni pomiar NIE PÓŹNIEJSZY niż pytana chwila', () => {
    const { oil } = readingsChainNeighbours(WITH_OIL, at(12));
    expect(oil).toMatchObject({ levelL: 9.2, atMh: 1230, byPilotId: 'ako' });
    // Dolewka z sesji „dolewka" (10:00) jest po kotwicy i przed pytaną chwilą.
    expect(oil?.addedSinceL).toBe(1);
  });

  it('NIE liczy dolewek zapisanych PO pytanej chwili', () => {
    // 2 L z sesji o 15:00 opisuje stan, którego pilot wpisujący lot z południa
    // nie mógł zastać - a pomiar 8,1 L tym bardziej nie jest jego kotwicą.
    const { oil } = readingsChainNeighbours(WITH_OIL, at(12));
    expect(oil?.addedSinceL).not.toBe(3);
    expect(oil?.levelL).not.toBe(8.1);
  });

  it('bez pomiaru przed tą chwilą olej milczy', () => {
    expect(readingsChainNeighbours(WITH_OIL, at(6)).oil).toBeNull();
    expect(readingsChainNeighbours(HISTORY, at(12)).oil).toBeNull();
  });

  it('pytanie o „teraz" widzi cały łańcuch - zachowanie sprzed issue #62', () => {
    const { oil } = readingsChainNeighbours(WITH_OIL, at(23));
    expect(oil).toMatchObject({ levelL: 8.1, atMh: 1240 });
    expect(oil?.addedSinceL).toBe(2);
  });
});
