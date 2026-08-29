/**
 * UZ Aero - klucz składu w zależnościach prefillu (issue #28).
 *
 * Arkusze skokowe dostają skład z PROJEKCJI, a ta wraca ze strumienia po każdym
 * zdarzeniu sesji - więc te same liczby przychodzą jako nowy obiekt. Gdyby effect
 * prefillu zależał od identyczności, kołowanie wykryte w chwili, gdy pilot ustawia
 * liczniki, skasowałoby mu je do wartości z deklaracji.
 */

import { jumpersKey } from '../ui/components/sheets/jumpersKey';

describe('jumpersKey', () => {
  it('ten sam skład w nowym obiekcie daje ten sam klucz', () => {
    expect(jumpersKey({ tandem: 2, aff: 1, solo: 1 })).toBe(
      jumpersKey({ tandem: 2, aff: 1, solo: 1 }),
    );
  });

  it('zmiana choćby jednego typu zmienia klucz - prefill ma się przeładować', () => {
    expect(jumpersKey({ tandem: 2, aff: 1, solo: 1 })).not.toBe(
      jumpersKey({ tandem: 2, aff: 2, solo: 1 }),
    );
  });

  it('brak deklaracji to inny stan niż zadeklarowane zero', () => {
    expect(jumpersKey(null)).not.toBe(jumpersKey({ tandem: 0, aff: 0, solo: 0 }));
  });
});
