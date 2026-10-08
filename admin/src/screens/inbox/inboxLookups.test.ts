import { describe, expect, it } from 'vitest';

import type { DirectoryDto } from '../../api/dto';
import { inboxLookups } from './inboxLookups';

const DIRECTORY: DirectoryDto = {
  members: [
    { id: 'p1', code: 'AKO', name: 'Adam Kowalski', active: true },
    { id: 'p2', code: 'PLI', name: 'Piotr Lis', active: false },
  ],
  aircraft: [
    { id: 'a1', reg: 'SP-KKD', type: 'Cessna 152', serviceStatus: 'active', dualRequired: false, mhFormat: 'decimal' },
  ],
};

describe('słownik klubu dla skrzynki', () => {
  it('nazwisko, znak i format licznika z identyfikatora - także członka wyłączonego', () => {
    const lookups = inboxLookups(DIRECTORY);
    expect(lookups.nameOf('p1')).toBe('Adam Kowalski');
    // Dawna wiadomość o wyłączonym członku dalej ma nazwisko.
    expect(lookups.nameOf('p2')).toBe('Piotr Lis');
    expect(lookups.regOf('a1')).toBe('SP-KKD');
    expect(lookups.mhFormatOf('a1')).toBe('decimal');
  });

  it('spoza słownika wraca null, nigdy identyfikator - wiersz mówi wtedy ogólnie', () => {
    const lookups = inboxLookups(DIRECTORY);
    expect(lookups.nameOf('obcy')).toBeNull();
    expect(lookups.regOf('obca')).toBeNull();
    expect(lookups.mhFormatOf('obca')).toBeNull();
  });

  it('słownik jeszcze nieprzyszły - wszystko nieznane, bez wywrotki', () => {
    const lookups = inboxLookups(undefined);
    expect(lookups.nameOf('p1')).toBeNull();
    expect(lookups.regOf('a1')).toBeNull();
  });
});
