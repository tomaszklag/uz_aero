/**
 * UZ Aero - test bramki kroku 4 i werdyktu normy (issue #62, piąta tura).
 *
 * ══ CO TU JEST SPRAWDZANE, A CO ŚWIADOMIE NIE ══
 * Zgłoszenie prosiło, żeby „nic nie blokowało - tylko ostrzeżenia wymagające reakcji".
 * Reguła obowiązuje wszystko, co jest OCENĄ danych (ciągłość paliwa, łańcuch MH, norma)
 * i to mieszka w `manualFlightWarnings.ts`. Blokada zostaje wyłącznie tam, gdzie DOMENA
 * I TAK ODMÓWI - bo komenda robi próbę generalną całej sekwencji i przy pierwszym
 * twardym naruszeniu rzuca, nie zapisując ani jednego zdarzenia. Wybór nie jest więc
 * między „zablokować a wpuścić", tylko między „powiedzieć teraz" a „wywalić się po
 * tapnięciu w ZAPISZ". Ten test pilnuje, że blokujemy DOKŁADNIE te przypadki.
 */

import {
  manualFlightStepBlocker,
  emptyManualFlightDraft,
  type ManualFlightDraft,
} from '../ui/screens/logic/manualFlight';
import {
  manualFuelBalanceView,
  manualMhBalanceView,
  manualPhaseTimes,
} from '../ui/screens/logic/manualFlightBalance';
import type { ConsumptionNorm } from '../domain';

const DAY = Date.UTC(2026, 7, 16);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

/** Sesja poprawna: bieg 09:42 → 11:18 (1,6 h), jeden lot 09:48 → 10:14. */
function draft(over: Partial<ManualFlightDraft> = {}): ManualFlightDraft {
  return {
    ...emptyManualFlightDraft(DAY),
    engineStart: at(9, 42),
    engineStop: at(11, 18),
    flights: [{ id: 'f1', takeoff: at(9, 48), landing: at(10, 14) }],
    // Paliwo: zastane 112 L, bez tankowania, po locie 84 L (issue #62, siódma tura).
    fuel: { foundL: 112, addedL: 0, afterL: 84 },
    mhBefore: 1236.5,
    mhAfter: 1238.0,
    ...over,
  };
}

const gate = (d: ManualFlightDraft, capacityL: number | null = 180) =>
  manualFlightStepBlocker('readings', d, { capacityL });

describe('bramka odczytów - blokuje TYLKO to, co domena odrzuci', () => {
  it('puszcza komplet poprawnych odczytów', () => {
    expect(gate(draft())).toBeNull();
  });

  it('żąda stanu z obu stron - `initialReading` i `finalReading` są w komendzie wymagane', () => {
    expect(gate(draft({ fuel: { foundL: null, addedL: 0, afterL: 84 } }))).toContain(
      'zastany',
    );
    expect(gate(draft({ mhAfter: null }))).toContain('po locie');
  });

  it('łapie wartości UJEMNE (FUEL_NEGATIVE / MH_NEGATIVE)', () => {
    expect(gate(draft({ fuel: { foundL: -5, addedL: 0, afterL: 84 } }))).toBe(
      'Stan paliwa nie może być ujemny.',
    );
    expect(gate(draft({ fuel: { foundL: 112, addedL: -20, afterL: 84 } }))).toBe(
      'Dolane paliwo nie może być ujemne.',
    );
    expect(gate(draft({ mhAfter: -1 }))).toBe(
      'Odczyt licznika motogodzin nie może być ujemny.',
    );
  });

  it('sufitem pojemności jest stan PO ZATANKOWANIU (FUEL_OVER_CAPACITY)', () => {
    // 112 zastane + 80 dolane = 192 L, czyli ponad zbiornik - i to jest liczba,
    // którą niesie odczyt przy przejęciu, więc to ją domena sprawdza.
    expect(gate(draft({ fuel: { foundL: 112, addedL: 80, afterL: 84 } }), 180)).toBe(
      'Stan 192 L przekracza pojemność zbiorników (180 L).',
    );
    // Bez znanej pojemności reguła ŚPI - dokładnie jak `checkCapacity` w domenie.
    expect(gate(draft({ fuel: { foundL: 112, addedL: 80, afterL: 84 } }), null)).toBeNull();
  });

  it('łapie cofnięty licznik (MH_REGRESSION)', () => {
    expect(gate(draft({ mhAfter: 1236.0 }))).toContain('nie może się cofnąć');
  });

  it('łapie paliwo, które przybyło samo (FUEL_INCREASE_WITHOUT_REFUEL)', () => {
    // 112 L przed startem, 140 L po locie, bez tankowania - tolerancja max(10, 5% z 180) = 10.
    expect(gate(draft({ fuel: { foundL: 112, addedL: 0, afterL: 140 } }))).toContain(
      'brakuje dolewki',
    );
    // W granicach tolerancji milczymy: paliwomierz nie jest dokładniejszy niż podziałka.
    expect(gate(draft({ fuel: { foundL: 112, addedL: 0, afterL: 118 } }))).toBeNull();
    // Z zatankowaniem ten sam stan końcowy jest poprawny - sufit rośnie o dolane litry.
    expect(gate(draft({ fuel: { foundL: 112, addedL: 60, afterL: 140 } }))).toBeNull();
  });
});

describe('werdykt normy', () => {
  /** Stawki dobrane tak, żeby 1,6 h bloku i 0,43 h lotu dały okrągłe liczby. */
  const norm = {
    blockLPerH: 20,
    blockLPerHLow: 18,
    blockLPerHHigh: 22,
    groundLPerH: 10,
    airLPerH: 30,
    fuelRatioLow: 0.8,
    fuelRatioHigh: 1.2,
    mh: { perFlightHour: 1, perGroundHour: 0.6, ratioLow: 0.9, ratioHigh: 1.1 },
  } as unknown as ConsumptionNorm;

  it('czasy faz biorą się z biegu silnika i sumy lotów', () => {
    expect(manualPhaseTimes(draft())).toEqual({
      blockMs: 96 * 60_000,
      flightMs: 26 * 60_000,
    });
  });

  it('odwrócony bieg silnika NIE produkuje oczekiwania z bzdury', () => {
    expect(manualPhaseTimes(draft({ engineStop: at(9, 0) }))).toBeNull();
    expect(manualFuelBalanceView(draft({ engineStop: at(9, 0) }), norm, null)).toBeNull();
  });

  /**
   * TEN SAM RACHUNEK, CO PO ZAPISANIU (uwaga z urządzenia, 2026-08-29): krok 4 woła
   * rdzeń `sessionBalance`, więc dostaje pełny `BalanceView` - wiersze działania,
   * sumę, plakietkę werdyktu i ARKUSZ SZCZEGÓŁÓW pod nią. Wcześniej miał sam werdykt
   * i pilot nie miał jak sprawdzić, z czego wyszedł.
   */
  it('rachunek ma wiersze działania i sumę, tak jak ekran rozliczenia', () => {
    const view = manualFuelBalanceView(draft(), norm, null)!;

    expect(view.rows.map((r) => r.id)).toEqual(['start', 'added', 'end']);
    expect(view.totalLabel).toBe('Zużyte');
    expect(view.totalValue).toBe('28 L');
  });

  it('bez normy maszyny werdyktu nie ma, ale wynik i POWÓD braku są', () => {
    const view = manualFuelBalanceView(draft(), null, null)!;

    expect(view.totalValue).toBe('28 L');
    expect(view.verdict).toBeNull();
    expect(view.details).toBeNull();
    // „-" bez wyjaśnienia wygląda jak awaria aplikacji (§6 pkt 3).
    expect(view.naNote).toContain('normy');
  });

  it('z normą podaje werdykt I szczegóły pod plakietką', () => {
    const view = manualFuelBalanceView(draft(), norm, null)!;

    expect(view.verdict).not.toBeNull();
    expect(view.details).not.toBeNull();
    expect(view.details!.title).toBe('NORMA PALIWA');
    // Arkusz ma odpowiadać „dlaczego tak", więc niesie rozpisane działanie.
    expect(view.details!.note).not.toBe('');
    expect(view.details!.rows.length).toBeGreaterThan(1);
  });

  it('wynik poza pasmem jest BURSZTYNOWY, nie czerwony - do sprawdzenia, nie błędny', () => {
    // 300 L z tej sesji jest poza każdym rozsądnym pasmem.
    const view = manualFuelBalanceView(
      draft({ fuel: { foundL: 300, addedL: 0, afterL: 0 } }),
      norm,
      null,
    )!;

    expect(view.verdict!.label).not.toContain('W NORMIE');
    expect(view.verdict!.tone).toBe('amber');
  });

  it('bez kompletu odczytów werdyktu nie ma - i mówi, czego brakuje', () => {
    const view = manualFuelBalanceView(draft({ fuel: { foundL: 112, addedL: 0, afterL: null } }), norm, null)!;
    expect(view.verdict).toBeNull();
    expect(view.naNote).toContain('odczytu');

    const mh = manualMhBalanceView(draft({ mhBefore: null }), norm, 'decimal')!;
    expect(mh.verdict).toBeNull();
  });

  it('przyrost licznika porównuje się z NORMĄ, a nie z czasem blokowym', () => {
    // Δ MH = 1,5 h przy bloku 1,6 h - obrotomierz chodzi wolniej niż zegar i to jest
    // normalne (issue #38). Werdykt ma pochodzić z normy maszyny, nie z tej różnicy.
    const view = manualMhBalanceView(draft(), norm, 'decimal')!;

    expect(view.totalLabel).toBe('Przyrost');
    expect(view.details).not.toBeNull();
    expect(view.details!.title).toBe('NORMA MOTOGODZIN');
  });
});
