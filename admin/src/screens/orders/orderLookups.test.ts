import { describe, expect, it } from 'vitest';

import type { DirectoryDto } from '../../api/dto';
import { orderLookups } from './orderLookups';

const SLOWNIK: DirectoryDto = {
  members: [
    { id: 'p-1', code: 'AKO', name: 'Adam Kowalski', active: true },
    { id: 'p-2', code: 'BNO', name: 'Barbara Nowak', active: false },
  ],
  aircraft: [{ id: 'a-1', reg: 'SP-ANA', type: 'AN-2', serviceStatus: 'active', dualRequired: true, mhFormat: 'hhmm' }],
};

describe('słownik klubu → podpisy zlecenia', () => {
  it('osoba i maszyna z identyfikatora; bez wpisu - `null`, nigdy surowy identyfikator', () => {
    const lookups = orderLookups(SLOWNIK);
    expect(lookups.person('p-2')).toEqual({ name: 'Barbara Nowak', code: 'BNO' });
    expect(lookups.aircraft('a-1')).toEqual({ reg: 'SP-ANA', type: 'AN-2' });
    expect(lookups.aircraft('a-9')).toBeNull();
  });

  it('pełne nazwiska członków - także wyłączonych - odróżniają osobę od grupy w etykiecie', () => {
    expect([...orderLookups(SLOWNIK).memberNames]).toEqual(['Adam Kowalski', 'Barbara Nowak']);
  });

  it('bez słownika (jeszcze się wczytuje) - pustka, nie wyjątek', () => {
    const lookups = orderLookups(undefined);
    expect(lookups.person('p-1')).toBeNull();
    expect(lookups.aircraft('a-1')).toBeNull();
    expect(lookups.memberNames.size).toBe(0);
  });
});
