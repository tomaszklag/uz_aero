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
import { DUAL_REQUIRED_REASON } from '../ui/screens/logic/dualRequirement';
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
    // Paliwo: zastane 64 L, dolane 48 L przed startem, po locie 76 L (issue #62,
    // siódma tura — trzy liczby i ani jednej godziny).
    fuel: { foundL: 64, addedL: 48, afterL: 76 },
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

  /**
   * Trasa jest we wpisie ręcznym WYMAGANA (issue #58, kolejna tura): wpis opisuje
   * lot, który JUŻ się odbył, więc „jeszcze nie wiem, dokąd" tu nie istnieje.
   * Kształt wymogu idzie za rodzajem operacji (issue #13): skoki = jedno lotnisko,
   * reszta = para start → lądowanie.
   */
  it('krok 2 wymaga lotniska; przy operacji z parą — obu', () => {
    // Skoki (jedno pole): bez lotniska stoi.
    expect(manualFlightStepBlocker('task', draft({ departureIcao: null }))).toContain(
      'lotnisko',
    );
    // Para: brak startu i brak lądowania to dwa osobne, nazwane powody.
    expect(
      manualFlightStepBlocker('task', draft({ operation: 'ferry', departureIcao: null })),
    ).toContain('startu');
    expect(manualFlightStepBlocker('task', draft({ operation: 'ferry' }))).toContain(
      'lądowania',
    );
    // Komplet pary przechodzi.
    expect(
      manualFlightStepBlocker('task', draft({ operation: 'ferry', arrivalIcao: 'EPWA' })),
    ).toBeNull();
  });

  it('krok 3 wymaga biegu silnika i przynajmniej jednego lotu', () => {
    // Napis wprost ze zgłoszenia z urządzenia (issue #62, szósta tura) — nie „godziny
    // biegu silnika: uruchomienie i wyłączenie", tylko to, czego pilot ma poszukać.
    expect(manualFlightStepBlocker('times', draft({ engineStart: null }))).toBe(
      'Wpisz godzinę uruchomienia i wyłączenia silnika.',
    );
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

  it('krok 4 wymaga stanu Z OBU STRON biegu', () => {
    expect(
      manualFlightStepBlocker('readings', draft({ fuel: { foundL: null, addedL: 0, afterL: 76 } })),
    ).toContain('zastany');
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
   * DOLEWKA PRZY PRACUJĄCYM SILNIKU JEST OD SIÓDMEJ TURY NIEWYRAŻALNA (issue #62).
   *
   * Do niej dolewka niosła własną godzinę i dało się ją ustawić na środek biegu —
   * bramka musiała więc pilnować `REFUEL_ENGINE_RUNNING`. Odkąd paliwo to trzy liczby
   * bez godzin, a zdarzenie składa się przy zapisie minutę przed uruchomieniem, tego
   * stanu nie da się w ogóle zbudować. Test pilnuje właśnie tego: bramka MILCZY, bo
   * nie ma o czym mówić.
   */
  it('dolewka nie ma jak wypaść przy pracującym silniku', () => {
    expect(
      manualFlightStepBlocker('readings', draft({ fuel: { foundL: 64, addedL: 48, afterL: 76 } })),
    ).toBeNull();
  });
});

describe('wymóg załogi dwuosobowej na kroku 1 (issue #58 pkt 4)', () => {
  // Wymóg jedzie odtąd BRAMKĄ, nie osobną flagą obok niej (uwaga z urządzenia
  // 2026-08-29): powód blokady stoi w przycisku, więc musi być zdaniem, nie boolem.
  const limits = (dualRequired: boolean) => ({ capacityL: null, dualRequired });

  it('samolot z wymogiem Duala blokuje krok 1 bez drugiego pilota — i mówi czym', () => {
    // An-2 z kartki podlega temu samemu prawu, co An-2 na preflightcie (§3.1).
    expect(manualFlightStepBlocker('aircraft', draft({ dualId: null }), limits(true))).toBe(
      DUAL_REQUIRED_REASON,
    );
    expect(
      manualFlightStepBlocker('aircraft', draft({ dualId: 'ako' }), limits(true)),
    ).toBeNull();
  });

  it('bez wymogu — Dual pozostaje opcjonalny', () => {
    expect(manualFlightStepBlocker('aircraft', draft({ dualId: null }), limits(false))).toBeNull();
    // Bez podanych granic bramka wymogu nie zgaduje: nie wie, jaka to maszyna.
    expect(manualFlightStepBlocker('aircraft', draft({ dualId: null }))).toBeNull();
  });

  it('przed wyborem samolotu odpowiada o SAMOLOCIE — powody padają pojedynczo', () => {
    expect(
      manualFlightStepBlocker('aircraft', draft({ aircraftId: null, dualId: null }), limits(true)),
    ).toBe('Wybierz samolot, którego dotyczy lot.');
  });
});

describe('toManualFlightInput — szkic → wejście komendy', () => {
  it('oddaje null, dopóki blokada czegoś nie puszcza', () => {
    expect(toManualFlightInput(draft({ aircraftId: null }), ids())).toBeNull();
  });

  it('składa komplet: loty posortowane, dolewka z trójką z dwóch liczb', () => {
    const input = toManualFlightInput(
      draft({
        flights: [
          { id: 'f2', takeoff: t(10, 26), landing: t(10, 52) },
          { id: 'f1', takeoff: t(9, 48), landing: t(10, 14) },
        ],
      }),
      ids(),
    )!;

    expect(input.flights.map((f) => f.takeoff)).toEqual([t(9, 48), t(10, 26)]);
    /* Trójka `refuel` domyka się z definicji, bo wszystkie trzy liczby biorą się
       z tej samej pary: zastane (64) i dolane (48). Godzina wyprowadza się z biegu —
       minutę przed uruchomieniem, żeby odczyt przy przejęciu opisywał stan PO
       zatankowaniu. */
    expect(input.refuels).toEqual([
      { at: t(9, 41), beforeL: 64, addedL: 48, afterL: 112 },
    ]);
  });

  /**
   * ODCZYT POCZĄTKOWY TO WPROST ZASTANE — bez arytmetyki (issue #62, siódma tura).
   *
   * Do niej szkic trzymał stan PO porannym tankowaniu i rachunek musiał go cofać
   * o dolewki sprzed niego (112 − 48 = 64), inaczej litry liczyły się podwójnie: raz
   * w odczycie, raz w zdarzeniu dolewki. Odkąd pilot podaje zastane, cofać nie ma
   * czego, a cała ta pułapka zniknęła razem z polem, które ją tworzyła.
   */
  it('odczyt początkowy = zastane, wprost i bez cofania', () => {
    const input = toManualFlightInput(draft(), ids())!;
    expect(input.initialReading).toEqual({ fuelL: 64, mh: 1306.35 });
    // Zużycie z projekcji: 64 + 48 − 76 = 36 L — tyle, ile silnik naprawdę spalił.
  });

  it('bez tankowania nie ma zdarzenia dolewki — zero litrów nie jest zdarzeniem', () => {
    const input = toManualFlightInput(
      draft({ fuel: { foundL: 112, addedL: 0, afterL: 76 } }),
      ids(),
    )!;
    expect(input.refuels).toEqual([]);
    expect(input.initialReading.fuelL).toBe(112);
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
        /* 64 L, czyli ZASTANE ze szkicu — a nie 112 L, czyli stan po zatankowaniu.
           To jest cała różnica, którą wprowadziła siódma tura issue #62: łańcuch
           porównuje się z tym, co poprzedni pilot zostawił, a nie z tym, co ten
           zobaczył na paliwomierzu po dolaniu 48 L. */
        handover: { reading: { fuelL: 64, mh: 1306.3 }, byPilotId: 'inny', at: t(8) },
        fetchedAt: t(8, 14),
      }),
    ).toEqual([]);
  });

  /**
   * Ogniwem łańcucha jest ZASTANE — dokładnie to, co poprzedni pilot zostawił.
   * Do siódmej tury issue #62 trzeba je było odtwarzać z odczytu „przed uruchomieniem"
   * minus poranne dolewki; teraz szkic trzyma je wprost, więc porównanie jest jedną
   * odejmowaniem prostsze i nie ma jak się rozjechać z porannym tankowaniem.
   */
  it('łańcuch paliwa liczy się od ZASTANEGO, nie od stanu po tankowaniu', () => {
    const warnings = manualFlightWarnings(
      // Zastane 64, dolane 48 — przekazanie mówi 64, więc łańcuch się zgadza.
      draft({ fuel: { foundL: 64, addedL: 48, afterL: 76 } }),
      {
        ...emptyCtx,
        handover: { reading: { fuelL: 64, mh: 1306.35 }, byPilotId: 'inny', at: t(8) },
        fetchedAt: t(8, 14),
      },
    );

    expect(warnings.filter((w) => w.id === 'fuel-chain')).toEqual([]);
  });

  /**
   * BILANS WEWNĘTRZNY PRZESTAŁ BYĆ OSTRZEŻENIEM (issue #62, siódma tura): domena
   * odrzuca ten stan twardo przy `day_close` (`FUEL_INCREASE_WITHOUT_REFUEL`), więc
   * mówi o nim BLOKADA, a nie baner. Dwa zdania o jednej liczbie, raz miękko i raz
   * twardo, byłyby szumem.
   */
  it('paliwo, którego przybyło, jest BLOKADĄ — nie ostrzeżeniem', () => {
    const tooMuch = draft({ fuel: { foundL: 64, addedL: 48, afterL: 200 } });

    expect(manualFlightWarnings(tooMuch, emptyCtx).map((w) => w.id)).not.toContain(
      'fuel-balance',
    );
    expect(manualFlightStepBlocker('readings', tooMuch)).toContain('brakuje dolewki');
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
