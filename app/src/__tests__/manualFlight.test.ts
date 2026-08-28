/**
 * UZ Aero — testy logiki wpisu ręcznego (ekrany 15 → 15C, przebudowa 2026-08-16).
 *
 * Dwa moduły, dwa pytania:
 *  • `manualFlight.ts` — „czy zapis w ogóle przejdzie przez domenę" (blokada
 *    z powodem przy przycisku, budowa wejścia komendy);
 *  • `manualFlightWarnings.ts` — „czy dane wyglądają na prawdziwe" (ostrzeżenia,
 *    które NIGDY nie blokują).
 * Granica między nimi jest treścią decyzji z 2026-08-16: twarde reguły domeny
 * mówią przy przycisku, wszystko miękkie jest amber banerem na kroku 4.
 */

import {
  emptyManualFlightDraft,
  manualFlightBlocker,
  manualFlightStepBlocker,
  sortedFlights,
  toManualFlightInput,
  type ManualFlightDraft,
} from '../ui/screens/logic/manualFlight';
import {
  manualFlightWarnings,
  type ManualFlightWarningContext,
} from '../ui/screens/logic/manualFlightWarnings';
import { emptyPilotDay, utcDayStart, type PilotDay } from '../domain';

const DAY = Date.UTC(2026, 7, 16); // 16 SIE 2026, północ UTC
const t = (h: number, m = 0): number => DAY + (h * 60 + m) * 60_000;

/** Szkic kompletny — punkt wyjścia; testy psują pojedyncze pola. */
function draft(over: Partial<ManualFlightDraft> = {}): ManualFlightDraft {
  return {
    ...emptyManualFlightDraft(t(16)),
    aircraftId: 'sp-axa',
    operation: 'skoki',
    departureIcao: 'EPZG',
    engineStart: t(9, 42),
    engineStop: t(11, 18),
    flights: [
      { id: 'f1', takeoff: t(9, 48), landing: t(10, 14) },
      { id: 'f2', takeoff: t(10, 26), landing: t(10, 52) },
    ],
    fuelBeforeL: 112,
    fuelAfterL: 76,
    mhBefore: 1306.35,
    mhAfter: 1307.88,
    ...over,
  };
}

const emptyCtx: ManualFlightWarningContext = {
  pilotDay: null,
  handover: null,
  mhFormat: 'hhmm',
  fetchedAt: null,
};

describe('emptyManualFlightDraft — wartości startowe', () => {
  it('data lotu jest DOMYŚLNIE dzisiejsza (dobą UTC), reszta pusta', () => {
    const d = emptyManualFlightDraft(t(16, 20));

    expect(d.day).toBe(utcDayStart(t(16, 20)));
    expect(d.aircraftId).toBeNull();
    // Operacja bez wartości podstawionej — wybór ma być świadomy.
    expect(d.operation).toBeNull();
    expect(d.flights).toEqual([]);
  });
});

describe('manualFlightStepBlocker — bramki kroków', () => {
  it('krok 1 wymaga samolotu', () => {
    expect(manualFlightStepBlocker('aircraft', draft({ aircraftId: null }))).toContain('samolot');
    expect(manualFlightStepBlocker('aircraft', draft())).toBeNull();
  });

  it('krok 2 wymaga rodzaju operacji', () => {
    expect(manualFlightStepBlocker('task', draft({ operation: null }))).toContain('operacji');
    expect(manualFlightStepBlocker('task', draft())).toBeNull();
  });

  it('krok 3 wymaga biegu silnika i przynajmniej jednego lotu', () => {
    expect(manualFlightStepBlocker('times', draft({ engineStart: null }))).toContain('biegu');
    expect(manualFlightStepBlocker('times', draft({ flights: [] }))).toContain(
      'przynajmniej jeden lot',
    );
    expect(manualFlightStepBlocker('times', draft())).toBeNull();
  });

  it('krok 3 pilnuje kolejności: wyłączenie po uruchomieniu, lądowanie po starcie', () => {
    expect(
      manualFlightStepBlocker('times', draft({ engineStop: t(9, 0) })),
    ).toContain('po uruchomieniu');
    expect(
      manualFlightStepBlocker(
        'times',
        draft({ flights: [{ id: 'f1', takeoff: t(10, 14), landing: t(9, 48) }] }),
      ),
    ).toContain('po starcie');
  });

  it('krok 3 odrzuca lot poza biegiem silnika i loty nachodzące na siebie', () => {
    expect(
      manualFlightStepBlocker(
        'times',
        draft({ flights: [{ id: 'f1', takeoff: t(9, 0), landing: t(10, 0) }] }),
      ),
    ).toContain('poza biegiem');
    expect(
      manualFlightStepBlocker(
        'times',
        draft({
          flights: [
            { id: 'f1', takeoff: t(9, 48), landing: t(10, 30) },
            { id: 'f2', takeoff: t(10, 26), landing: t(10, 52) },
          ],
        }),
      ),
    ).toContain('nakładają');
  });

  it('krok 4 wymaga odczytów Z OBU STRON biegu', () => {
    expect(manualFlightStepBlocker('readings', draft({ fuelBeforeL: null }))).toContain(
      'sprzed uruchomienia',
    );
    expect(manualFlightStepBlocker('readings', draft({ mhAfter: null }))).toContain(
      'po locie',
    );
    expect(manualFlightStepBlocker('readings', draft())).toBeNull();
  });

  it('krok 4 blokuje cofnięty licznik — twarda reguła domeny mówi przy przycisku', () => {
    expect(
      manualFlightStepBlocker('readings', draft({ mhAfter: 1306.0 })),
    ).toContain('cofnąć');
  });

  /**
   * Dolewka w środku biegu to twardy błąd (`REFUEL_ENGINE_RUNNING`) — bez tej bramki
   * pilot dowiedziałby się o nim dopiero z odrzuconego zapisu na końcu formularza.
   */
  it('krok 4 blokuje dolewkę przy pracującym silniku', () => {
    const blocked = manualFlightStepBlocker(
      'readings',
      draft({ refuels: [{ id: 'r1', at: t(10, 56), addedL: 48, afterL: 123 }] }),
    );
    expect(blocked).toContain('pracującym silniku');

    // Przed uruchomieniem i po wyłączeniu — wolno.
    expect(
      manualFlightStepBlocker(
        'readings',
        draft({
          refuels: [
            { id: 'r1', at: t(9, 30), addedL: 48, afterL: 112 },
            { id: 'r2', at: t(11, 30), addedL: 20, afterL: 96 },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe('toManualFlightInput — szkic → wejście komendy', () => {
  it('oddaje null, dopóki blokada czegoś nie puszcza', () => {
    expect(toManualFlightInput(draft({ aircraftId: null }), ids())).toBeNull();
  });

  it('składa komplet: loty posortowane, dolewki z wyliczonym stanem przed', () => {
    const input = toManualFlightInput(
      draft({
        flights: [
          { id: 'f2', takeoff: t(10, 26), landing: t(10, 52) },
          { id: 'f1', takeoff: t(9, 48), landing: t(10, 14) },
        ],
        refuels: [{ id: 'r1', at: t(9, 30), addedL: 48, afterL: 112 }],
      }),
      ids(),
    )!;

    expect(input.flights.map((f) => f.takeoff)).toEqual([t(9, 48), t(10, 26)]);
    // Trójka refuel domyka się z pary „dolano + stan po" — before nie jest polem.
    expect(input.refuels).toEqual([
      { at: t(9, 30), beforeL: 64, addedL: 48, afterL: 112 },
    ]);
  });

  /**
   * PORANNA DOLEWKA NIE MOŻE WEJŚĆ DO RACHUNKU DWA RAZY. Pilot odczytuje „przed
   * uruchomieniem" PO tankowaniu (112 L), ale w strumieniu odczyt preflightu pada
   * PRZED dolewką — a zużycie liczy się `start + dolane − koniec`. Odczyt początkowy
   * musi się więc cofnąć o poranne dolewki (112 − 48 = 64), inaczej sesja z porannym
   * tankowaniem miałaby zużycie zawyżone dokładnie o dolewkę.
   */
  it('odczyt początkowy cofa się o poranne dolewki — bez podwójnego liczenia', () => {
    const input = toManualFlightInput(
      draft({
        fuelBeforeL: 112,
        refuels: [{ id: 'r1', at: t(9, 30), addedL: 48, afterL: 112 }],
      }),
      ids(),
    )!;

    expect(input.initialReading).toEqual({ fuelL: 64, mh: 1306.35 });
    // Zużycie z projekcji: 64 + 48 − 76 = 36 L — tyle, ile silnik naprawdę spalił.

    // Dolewka PO wyłączeniu nie cofa odczytu — stan „przed" jej nie zawierał.
    const postRun = toManualFlightInput(
      draft({
        fuelBeforeL: 112,
        refuels: [{ id: 'r1', at: t(11, 30), addedL: 48, afterL: 124 }],
      }),
      ids(),
    )!;
    expect(postRun.initialReading.fuelL).toBe(112);
  });

  it('olej wchodzi do wejścia tylko przy faktycznym wpisie (issue #60)', () => {
    const withOil = toManualFlightInput(draft({ oilL: 8.2, oilAddedL: 1.0 }), ids())!;
    expect(withOil.oilL).toBe(8.2);
    expect(withOil.oilAddedL).toBe(1.0);

    // Bez wpisu kluczy NIE MA — sesja bez pomiaru nie niesie pustych pól.
    const without = toManualFlightInput(draft(), ids())!;
    expect('oilL' in without).toBe(false);
    expect('oilAddedL' in without).toBe(false);
  });

  /**
   * Issue #13 w wpisie ręcznym: skoki startują i lądują na tym samym placu, więc
   * jedno pole trasy wypełnia OBIE role — formularz i domena nie mają jak się rozjechać.
   */
  it('operacja jednopolowa (skoki) niesie to samo lotnisko w obu rolach', () => {
    const jump = toManualFlightInput(draft(), ids())!;
    expect(jump.departureIcao).toBe('EPZG');
    expect(jump.arrivalIcao).toBe('EPZG');

    const ferry = toManualFlightInput(
      draft({ operation: 'ferry', departureIcao: 'EPZG', arrivalIcao: 'EPPO' }),
      ids(),
    )!;
    expect(ferry.arrivalIcao).toBe('EPPO');
  });

  function ids() {
    return { sessionUuid: 'sess-1', picId: 'tmk' };
  }
});

describe('manualFlightWarnings — ostrzegają, nigdy nie blokują', () => {
  it('kompletny, spójny szkic bez kontekstu = zero ostrzeżeń', () => {
    expect(manualFlightWarnings(draft(), emptyCtx)).toEqual([]);
  });

  it('kolizja czasów z własną sesją doby — z lokalnego rejestru', () => {
    const day: PilotDay = {
      ...emptyPilotDay('tmk', DAY),
      sessions: [
        {
          index: 2,
          aircraftId: 'sp-klm',
          sessionUuid: 'sess-klm',
          startedAt: t(10, 20),
          stoppedAt: t(11, 2),
          blockMs: 42 * 60_000,
          flightMs: 35 * 60_000,
          flightCount: 1,
          manualEntry: false,
        },
      ],
    };

    const warnings = manualFlightWarnings(draft(), { ...emptyCtx, pilotDay: day });

    expect(warnings.map((w) => w.id)).toContain('session-overlap');
    expect(warnings.find((w) => w.id === 'session-overlap')!.text).toContain('SESJĘ 2');
  });

  it('sesja z innej godziny doby NIE ostrzega', () => {
    const day: PilotDay = {
      ...emptyPilotDay('tmk', DAY),
      sessions: [
        {
          index: 1,
          aircraftId: 'sp-klm',
          sessionUuid: 'sess-klm',
          startedAt: t(13, 40),
          stoppedAt: t(15, 10),
          blockMs: 90 * 60_000,
          flightMs: 60 * 60_000,
          flightCount: 2,
          manualEntry: false,
        },
      ],
    };

    expect(manualFlightWarnings(draft(), { ...emptyCtx, pilotDay: day })).toEqual([]);
  });

  it('łańcuch MH wobec przekazania — z adnotacją wieku cache', () => {
    const warnings = manualFlightWarnings(draft({ mhBefore: 1306.35 }), {
      ...emptyCtx,
      handover: { reading: { fuelL: 112, mh: 1308.17 }, byPilotId: 'inny', at: t(8) },
      fetchedAt: t(8, 14),
    });

    const mh = warnings.find((w) => w.id === 'mh-chain')!;
    expect(mh.text).toContain('przekazanie');
    expect(mh.src).toContain('z cache');
  });

  it('zgodny łańcuch (w granicach podziałki licznika) milczy', () => {
    expect(
      manualFlightWarnings(draft({ mhBefore: 1306.35 }), {
        ...emptyCtx,
        handover: { reading: { fuelL: 112, mh: 1306.3 }, byPilotId: 'inny', at: t(8) },
        fetchedAt: t(8, 14),
      }),
    ).toEqual([]);
  });

  /**
   * Gdy pilot dolał PRZED uruchomieniem, ogniwem łańcucha jest stan sprzed dolewki
   * (`afterL − addedL`) — odczyt „przed uruchomieniem" jest już po tankowaniu
   * i porównywanie go z przekazaniem ostrzegałoby przy każdej porannej dolewce.
   */
  it('łańcuch paliwa liczy się od stanu SPRZED porannej dolewki', () => {
    const warnings = manualFlightWarnings(
      draft({
        fuelBeforeL: 112,
        refuels: [{ id: 'r1', at: t(9, 30), addedL: 48, afterL: 112 }],
      }),
      {
        ...emptyCtx,
        handover: { reading: { fuelL: 64, mh: 1306.35 }, byPilotId: 'inny', at: t(8) },
        fetchedAt: t(8, 14),
      },
    );

    expect(warnings.filter((w) => w.id === 'fuel-chain')).toEqual([]);
  });

  it('paliwa po locie więcej niż przed z dolewkami — brakuje dolewki', () => {
    const warnings = manualFlightWarnings(draft({ fuelAfterL: 140 }), emptyCtx);

    expect(warnings.map((w) => w.id)).toContain('fuel-balance');
  });

  it('zrzut poza każdym lotem — miękko, jak DROP_ON_GROUND w domenie', () => {
    const warnings = manualFlightWarnings(
      draft({ drops: [{ id: 'd1', at: t(10, 20), jumpers: null, altitudeFt: null }] }),
      emptyCtx,
    );

    expect(warnings.map((w) => w.id)).toContain('drop-outside-flight');
  });

  it('zrzut w locie milczy', () => {
    expect(
      manualFlightWarnings(
        draft({ drops: [{ id: 'd1', at: t(10, 0), jumpers: null, altitudeFt: 4000 }] }),
        emptyCtx,
      ),
    ).toEqual([]);
  });
});

describe('sortedFlights — kolejność dnia, nie formularza', () => {
  it('sortuje po starcie niezależnie od kolejności dopisywania', () => {
    const d = draft({
      flights: [
        { id: 'f2', takeoff: t(10, 26), landing: t(10, 52) },
        { id: 'f1', takeoff: t(9, 48), landing: t(10, 14) },
      ],
    });

    expect(sortedFlights(d).map((f) => f.id)).toEqual(['f1', 'f2']);
  });
});

describe('manualFlightBlocker — bramka zapisu widzi wszystkie kroki', () => {
  it('błąd wcześniejszego kroku blokuje też zapis na ostatnim', () => {
    expect(manualFlightBlocker(draft({ operation: null }))).toContain('operacji');
    expect(manualFlightBlocker(draft())).toBeNull();
  });
});
