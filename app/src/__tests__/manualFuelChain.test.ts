/**
 * UZ Aero — test sekwencji paliwa wpisu ręcznego (issue #62, piąta tura).
 *
 * „Najpierw podaję, ile było przed lotem, następnie ile dodałem, oraz później ile
 * zostało" — sprawdzamy, że wiersze idą w tej kolejności, że rachunek zużycia liczy
 * się z nich, i że poranna dolewka nie wchodzi do niego DWA RAZY.
 */

import {
  addedAfterReadingL,
  buildManualFuelChain,
  fuelChainTarget,
  fuelUsedL,
} from '../ui/screens/logic/manualFuelChain';
import { emptyManualFlightDraft, type ManualFlightDraft } from '../ui/screens/logic/manualFlight';

const DAY = Date.UTC(2026, 7, 16);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

/** Bieg 09:42 → 11:18, 112 L na starcie, 84 L po locie. */
function draft(over: Partial<ManualFlightDraft> = {}): ManualFlightDraft {
  return {
    ...emptyManualFlightDraft(DAY),
    engineStart: at(9, 42),
    engineStop: at(11, 18),
    fuelBeforeL: 112,
    fuelAfterL: 84,
    ...over,
  };
}

describe('sekwencja paliwa', () => {
  it('idzie w kolejności: przed → dolewki → po', () => {
    const { rows } = buildManualFuelChain(
      draft({
        refuels: [
          { id: 'r2', at: at(11, 30), addedL: 20, afterL: 104 },
          { id: 'r1', at: at(11, 20), addedL: 48, afterL: 84 },
        ],
      }),
    );

    // Dolewki sortują się CZASEM, nie kolejnością dopisywania.
    expect(rows.map((r) => r.id)).toEqual(['fuel-before', 'refuel:r1', 'refuel:r2', 'fuel-after']);
    expect(rows[0]).toMatchObject({ name: 'Przed uruchomieniem', sub: '112 L' });
    expect(rows[1]).toMatchObject({ name: 'Dolewka', sub: '+48 L → 84 L' });
    expect(rows[3]).toMatchObject({ name: 'Po locie', sub: '84 L' });
  });

  it('oba końce istnieją także BEZ wartości — wiersz jest wejściem w jej wpisanie', () => {
    const { rows, foot } = buildManualFuelChain(emptyManualFlightDraft(DAY));

    expect(rows.map((r) => ({ id: r.id, time: r.time, sub: r.sub }))).toEqual([
      { id: 'fuel-before', time: '--:--', sub: '— L' },
      { id: 'fuel-after', time: '--:--', sub: '— L' },
    ]);
    // Stopka milczy bez kompletu odczytów — zero nie jest wynikiem.
    expect(foot).toEqual([]);
  });

  it('zużycie = stan początkowy + dolewki po nim − stan końcowy', () => {
    const d = draft({ refuels: [{ id: 'r1', at: at(11, 25), addedL: 20, afterL: 104 }] });
    // 112 + 20 − 84 = 48
    expect(fuelUsedL(d)).toBe(48);
    expect(buildManualFuelChain(d).foot).toEqual([
      { key: 'Zużycie', value: '48 L', accent: true },
      { key: 'Dolane', value: '20 L' },
    ]);
  });

  it('PORANNA dolewka nie wchodzi do rachunku dwa razy', () => {
    // Odczyt „przed uruchomieniem" pilot robi PO porannym tankowaniu, więc dolewka
    // sprzed uruchomienia już w nim siedzi. Ta sama korekta, którą robi
    // `toManualFlightInput` przed zapisem.
    const d = draft({ refuels: [{ id: 'r0', at: at(9, 30), addedL: 60, afterL: 112 }] });

    expect(addedAfterReadingL(d)).toBe(0);
    expect(fuelUsedL(d)).toBe(28); // 112 − 84, bez doliczania 60 L
    // Wiersz dolewki na osi ZOSTAJE — wydarzyła się i ma swoje miejsce w czasie.
    expect(buildManualFuelChain(d).rows.map((r) => r.id)).toContain('refuel:r0');
    // …ale stopka nie mówi „Dolane", bo do zużycia nic z niej nie weszło.
    expect(buildManualFuelChain(d).foot).toEqual([
      { key: 'Zużycie', value: '28 L', accent: true },
    ]);
  });

  it('bez któregoś odczytu rachunku nie ma', () => {
    expect(fuelUsedL(draft({ fuelAfterL: null }))).toBeNull();
    expect(fuelUsedL(draft({ fuelBeforeL: null }))).toBeNull();
  });

  it('wiersz mówi, co otworzyć — i każdy wiersz coś otwiera', () => {
    expect(fuelChainTarget('fuel-before')).toEqual({ kind: 'reading', which: 'before' });
    expect(fuelChainTarget('fuel-after')).toEqual({ kind: 'reading', which: 'after' });
    expect(fuelChainTarget('refuel:r1')).toEqual({ kind: 'refuel', id: 'r1' });
    expect(fuelChainTarget('cokolwiek')).toBeNull();

    const d = draft({ refuels: [{ id: 'r1', at: at(11, 25), addedL: 20, afterL: 104 }] });
    for (const row of buildManualFuelChain(d).rows) {
      expect(fuelChainTarget(row.id)).not.toBeNull();
    }
  });
});
