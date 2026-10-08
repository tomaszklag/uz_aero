/**
 * Ninerdeck - testy TRASY, NA KTÓREJ PILOT STOI (`ui/navigation/activeRoute.ts`).
 *
 * Od zakładek (3.0.0) czubek stosu bywa nawigatorem, nie ekranem, więc trasa schodzi do
 * najgłębszego stanu - razem z PARAMETRAMI, bo baner w aplikacji (kanał klubu, K5) pyta
 * nie tylko o nazwę ekranu, ale o rzecz, którą ekran pokazuje.
 */

import { activeRoute } from '../ui/navigation/activeRoute';

describe('trasa, na której pilot stoi', () => {
  it('schodzi do najgłębszego stanu - zakładki to nawigator, nie ekran', () => {
    const state = {
      index: 0,
      routes: [
        {
          name: 'Tabs',
          state: { index: 1, routes: [{ name: 'Dashboard' }, { name: 'Calendar' }] },
        },
      ],
    };
    expect(activeRoute(state)).toEqual({ name: 'Calendar', params: undefined });
  });

  it('niesie parametry ekranu na czubku stosu', () => {
    const state = {
      index: 1,
      routes: [{ name: 'Tabs' }, { name: 'BookingDetails', params: { bookingId: 'b1' } }],
    };
    expect(activeRoute(state)).toEqual({ name: 'BookingDetails', params: { bookingId: 'b1' } });
  });

  it('bez indeksu bierze pierwszą trasę; bez stanu - nic', () => {
    expect(activeRoute({ routes: [{ name: 'Settings' }] })).toEqual({ name: 'Settings', params: undefined });
    expect(activeRoute(undefined)).toBeNull();
    expect(activeRoute({ routes: [] })).toBeNull();
  });
});
