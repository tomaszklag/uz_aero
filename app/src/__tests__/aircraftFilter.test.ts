/**
 * Ninerdeck - test filtra maszyn osi kalendarza (rezerwacje 3.0.0, 21D).
 *
 * Najważniejszy przypadek jest ostatni: zapis trzyma UKRYTE, więc maszyna dokupiona
 * przez klub pojawia się na osi sama. Gdyby trzymał pokazywane, każdy nowy samolot
 * byłby domyślnie niewidoczny u każdego, kto raz dotknął filtra.
 */

import type { ReferenceAircraft } from '../domain';
import {
  buildFilterRows,
  confirmLabel,
  filterLabel,
  isNarrowed,
  toggleHidden,
  visibleAircraft,
} from '../ui/screens/logic/aircraftFilter';
import type { CalendarBooking } from '../ui/screens/logic/calendarData';

const FLEET = [
  { id: 'a1', reg: 'SP-AXA', type: 'C172' },
  { id: 'a2', reg: 'SP-BKL', type: 'PA-28' },
  { id: 'a3', reg: 'SP-CDR', type: 'AN-2' },
] as ReferenceAircraft[];

const serwis = {
  id: 'b1',
  aircraftId: 'a3',
  kind: 'block',
  blockReason: 'Przegląd 100 h',
} as CalendarBooking;

describe('napis chipa', () => {
  it('bez zawężenia to sama liczba', () => {
    expect(filterLabel(12, 12)).toBe('12');
    expect(isNarrowed(12, 12)).toBe(false);
  });

  it('z zawężeniem mówi, ile z ilu - brakująca maszyna nie ma wyglądać na sprzedaną', () => {
    expect(filterLabel(6, 12)).toBe('6 z 12');
    expect(isNarrowed(6, 12)).toBe(true);
  });

  it('przycisk zatwierdzenia nazywa skutek', () => {
    expect(confirmLabel(6)).toBe('POKAŻ 6');
  });
});

describe('maszyny na osi', () => {
  it('bez zapisu widać całą flotę', () => {
    expect(visibleAircraft(FLEET, []).map((a) => a.reg)).toEqual(['SP-AXA', 'SP-BKL', 'SP-CDR']);
  });

  it('ukryte wypadają, a kolejność floty zostaje', () => {
    expect(visibleAircraft(FLEET, ['a2']).map((a) => a.reg)).toEqual(['SP-AXA', 'SP-CDR']);
  });

  it('NOWA maszyna klubu pojawia się sama - zapis trzyma ukryte, nie pokazywane', () => {
    const hidden = ['a1'];
    const powiekszona = [...FLEET, { id: 'a4', reg: 'SP-DKM', type: 'C152' } as ReferenceAircraft];
    expect(visibleAircraft(powiekszona, hidden).map((a) => a.reg)).toContain('SP-DKM');
  });

  it('maszyna skasowana z floty nie zostawia po sobie nic', () => {
    expect(visibleAircraft([FLEET[0]!], ['a2', 'a3']).map((a) => a.reg)).toEqual(['SP-AXA']);
  });
});

describe('wiersze arkusza', () => {
  it('pokazują CAŁĄ flotę, także maszyny właśnie ukryte', () => {
    const rows = buildFilterRows(FLEET, ['a2'], []);
    expect(rows.map((r) => r.reg)).toEqual(['SP-AXA', 'SP-BKL', 'SP-CDR']);
    expect(rows.map((r) => r.shown)).toEqual([true, false, true]);
  });

  it('powód wyłączenia z użytku stoi przy maszynie', () => {
    const rows = buildFilterRows(FLEET, [], [serwis]);
    expect(rows.map((r) => r.tag)).toEqual([null, null, 'Przegląd 100 h']);
  });
});

describe('przełączanie', () => {
  it('dokłada i zdejmuje z listy ukrytych', () => {
    expect(toggleHidden([], 'a1')).toEqual(['a1']);
    expect(toggleHidden(['a1', 'a2'], 'a1')).toEqual(['a2']);
  });

  it('nie rusza szkicu, który dostało - arkusz pracuje na kopii', () => {
    const hidden = ['a1'];
    toggleHidden(hidden, 'a2');
    expect(hidden).toEqual(['a1']);
  });
});
