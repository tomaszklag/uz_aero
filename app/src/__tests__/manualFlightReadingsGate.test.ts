/**
 * UZ Aero — test bramki kroku 4 i werdyktu normy (issue #62, piąta tura).
 *
 * ══ CO TU JEST SPRAWDZANE, A CO ŚWIADOMIE NIE ══
 * Zgłoszenie prosiło, żeby „nic nie blokowało — tylko ostrzeżenia wymagające reakcji".
 * Reguła obowiązuje wszystko, co jest OCENĄ danych (ciągłość paliwa, łańcuch MH, norma)
 * i to mieszka w `manualFlightWarnings.ts`. Blokada zostaje wyłącznie tam, gdzie DOMENA
 * I TAK ODMÓWI — bo komenda robi próbę generalną całej sekwencji i przy pierwszym
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
  manualFuelBalance,
  manualMhBalance,
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
    fuelBeforeL: 112,
    fuelAfterL: 84,
    mhBefore: 1236.5,
    mhAfter: 1238.0,
    ...over,
  };
}

const gate = (d: ManualFlightDraft, capacityL: number | null = 180) =>
  manualFlightStepBlocker('readings', d, { capacityL });

describe('bramka odczytów — blokuje TYLKO to, co domena odrzuci', () => {
  it('puszcza komplet poprawnych odczytów', () => {
    expect(gate(draft())).toBeNull();
  });

  it('żąda obu odczytów — `initialReading` i `finalReading` są w komendzie wymagane', () => {
    expect(gate(draft({ fuelBeforeL: null }))).toContain('sprzed uruchomienia');
    expect(gate(draft({ mhAfter: null }))).toContain('po locie');
  });

  it('łapie wartości UJEMNE (FUEL_NEGATIVE / MH_NEGATIVE)', () => {
    expect(gate(draft({ fuelBeforeL: -5 }))).toBe('Odczyt paliwa nie może być ujemny.');
    expect(gate(draft({ mhAfter: -1 }))).toBe(
      'Odczyt licznika motogodzin nie może być ujemny.',
    );
    expect(
      gate(draft({ refuels: [{ id: 'r1', at: at(11, 25), addedL: -20, afterL: 64 }] })),
    ).toContain('ujemną');
  });

  it('łapie odczyt ponad pojemność zbiorników (FUEL_OVER_CAPACITY)', () => {
    expect(gate(draft({ fuelBeforeL: 200 }), 180)).toBe(
      'Odczyt 200 L przekracza pojemność zbiorników (180 L).',
    );
    // Bez znanej pojemności reguła ŚPI — dokładnie jak `checkCapacity` w domenie.
    expect(gate(draft({ fuelBeforeL: 200 }), null)).toBeNull();
  });

  it('łapie cofnięty licznik (MH_REGRESSION)', () => {
    expect(gate(draft({ mhAfter: 1236.0 }))).toContain('nie może się cofnąć');
  });

  it('łapie paliwo, które przybyło samo (FUEL_INCREASE_WITHOUT_REFUEL)', () => {
    // 112 L na starcie, 140 L po locie, bez dolewki — tolerancja to max(10, 5% z 180) = 10.
    expect(gate(draft({ fuelAfterL: 140 }))).toContain('brakuje dolewki');
    // W granicach tolerancji milczymy: paliwomierz nie jest dokładniejszy niż jego podziałka.
    expect(gate(draft({ fuelAfterL: 118 }))).toBeNull();
    // Z dolewką po locie ten sam stan końcowy jest poprawny.
    expect(
      gate(draft({ fuelAfterL: 140, refuels: [{ id: 'r1', at: at(11, 30), addedL: 60, afterL: 144 }] })),
    ).toBeNull();
  });

  it('łapie dolewkę przy pracującym silniku (REFUEL_ENGINE_RUNNING)', () => {
    expect(
      gate(draft({ refuels: [{ id: 'r1', at: at(10, 0), addedL: 20, afterL: 132 }] })),
    ).toContain('pracującym silniku');
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
    expect(manualFuelBalance(draft({ engineStop: at(9, 0) }), norm)).toBeNull();
  });

  it('bez normy maszyny ekran MILCZY o oczekiwaniu, ale wynik podaje', () => {
    const balance = manualFuelBalance(draft(), null);
    expect(balance).not.toBeNull();
    expect(balance!.actual).toBe('28 L');
    expect(balance!.expected).toBeNull();
    expect(balance!.verdict).toBeNull();
  });

  it('z normą podaje oczekiwanie, pasmo i werdykt', () => {
    const balance = manualFuelBalance(draft(), norm);
    expect(balance!.expected).toMatch(/^oczekiwane .* · pasmo .* – .*$/);
    expect(balance!.verdict).not.toBeNull();
    expect(['✓ W NORMIE', '↑ POWYŻEJ NORMY', '↓ PONIŻEJ NORMY']).toContain(
      balance!.verdict!.label,
    );
  });

  it('wynik poza pasmem jest BURSZTYNOWY, nie czerwony — do sprawdzenia, nie błędny', () => {
    // 300 L z tej sesji jest poza każdym rozsądnym pasmem.
    const balance = manualFuelBalance(draft({ fuelAfterL: 0, fuelBeforeL: 300 }), norm);
    expect(balance!.verdict!.label).not.toBe('✓ W NORMIE');
    expect(balance!.verdict!.tone).toBe('amber');
  });

  it('bez kompletu odczytów nie ma czego porównywać', () => {
    expect(manualFuelBalance(draft({ fuelAfterL: null }), norm)).toBeNull();
    expect(manualMhBalance(draft({ mhBefore: null }), norm, 'decimal')).toBeNull();
  });

  it('przyrost licznika porównuje się z NORMĄ, a nie z czasem blokowym', () => {
    // Δ MH = 1,5 h przy bloku 1,6 h — obrotomierz chodzi wolniej niż zegar i to jest
    // normalne (issue #38). Werdykt ma pochodzić z normy maszyny, nie z tej różnicy.
    const balance = manualMhBalance(draft(), norm, 'decimal');
    expect(balance!.actual).toBe('1.5');
    expect(balance!.expected).not.toBeNull();
  });
});
