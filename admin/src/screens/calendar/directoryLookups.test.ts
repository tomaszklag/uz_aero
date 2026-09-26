import { describe, expect, it } from 'vitest';

import type { DirectoryDto } from '../../api/dto';
import { calendarAircraft, personLookup, regLookup } from './directoryLookups';

const SLOWNIK: DirectoryDto = {
  members: [
    { id: 'p-1', code: 'AKO', name: 'Adam Kowalski', active: true },
    { id: 'p-2', code: 'BNO', name: 'Barbara Nowak', active: false },
  ],
  aircraft: [
    { id: 'a-1', reg: 'SP-AXA', type: 'C182', serviceStatus: 'active' },
    { id: 'a-2', reg: 'SP-KWA', type: 'C172', serviceStatus: 'disabled' },
  ],
};

describe('słownik klubu → podpisy zajętości', () => {
  it('osoba z identyfikatora, także WYŁĄCZONA - jej dawna rezerwacja ma nazwisko', () => {
    const person = personLookup(SLOWNIK);
    expect(person('p-1')).toEqual({ name: 'Adam Kowalski', code: 'AKO' });
    expect(person('p-2')).toEqual({ name: 'Barbara Nowak', code: 'BNO' });
    expect(person('obcy')).toBeNull();
  });

  it('znak maszyny z identyfikatora; bez wpisu wraca identyfikator, nie pusta komórka', () => {
    const reg = regLookup(SLOWNIK);
    expect(reg('a-1')).toBe('SP-AXA');
    expect(reg('a-9')).toBe('a-9');
  });

  it('wiersze osi floty: maszyna wyłączona z użytku ZOSTAJE, tylko poza służbą', () => {
    expect(calendarAircraft(SLOWNIK)).toEqual([
      { id: 'a-1', reg: 'SP-AXA', type: 'C182', inService: true },
      { id: 'a-2', reg: 'SP-KWA', type: 'C172', inService: false },
    ]);
  });

  it('bez słownika (jeszcze się wczytuje) wszystko odpowiada pustką, nie wyjątkiem', () => {
    expect(personLookup(undefined)('p-1')).toBeNull();
    expect(regLookup(undefined)('a-1')).toBe('a-1');
    expect(calendarAircraft(undefined)).toEqual([]);
  });
});
