/**
 * Ninerdeck - testy WYBORU KARTY ZLECENIA (`logic/orderCardMode.ts`; epik Z-C #247).
 *
 * Pod obserwacją: adresat dostaje kartę 28, prowadzący - 32, a osoba, która jest jednym
 * i drugim naraz, kartę tej połowy listy, z której przyszła. Bez wskazania wygrywa
 * adresat - zlecenie czekające na odpowiedź ma ją dostać.
 */

import { orderCardMode } from '../ui/screens/logic/orderCardMode';
import { me } from './support/orderFixtures';

const recipient = { leads: false, recipient: me() };
const leader = { leads: true, recipient: null };
const both = { leads: true, recipient: me() };

describe('karta zlecenia - adresat czy prowadzący', () => {
  it('sam kształt odpowiedzi rozstrzyga, gdy rola jest jedna', () => {
    expect(orderCardMode(recipient)).toBe('recipient');
    expect(orderCardMode(leader)).toBe('leader');
    // Wskazanie, którego odpowiedź nie potwierdza, nie zmienia karty.
    expect(orderCardMode(recipient, 'leader')).toBe('recipient');
    expect(orderCardMode(leader, 'recipient')).toBe('leader');
  });

  it('jedno i drugie naraz: decyduje połowa listy, bez wskazania - adresat', () => {
    expect(orderCardMode(both, 'leader')).toBe('leader');
    expect(orderCardMode(both, 'recipient')).toBe('recipient');
    expect(orderCardMode(both)).toBe('recipient');
  });

  it('ani adresat, ani prowadzący - karty nie ma', () => {
    expect(orderCardMode({ leads: false, recipient: null })).toBe('none');
  });
});
