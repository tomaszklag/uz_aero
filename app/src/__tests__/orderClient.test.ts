/**
 * Ninerdeck - testy KLIENTA ZLECEŃ (`application/sync/orderClient.ts`; 4.0.0, epik Z-C #247).
 *
 * Pod obserwacją trzy odpowiedzi zapisu, z których każda jest inną wiadomością na ekranie:
 * zapisano (karta), odmówiono (kod z treścią - NIE `null`) i „nie wiadomo, czy zapisano"
 * (`null` bez sieci). Do tego `401` → jedna rotacja tokenu i ponowienie, a odczyt karty
 * i rozmowy jako prawda/fałsz („dojechało" / „nie dojechało").
 */

import type { AuthService } from '../application/auth/authService';
import {
  ServerRejectedError,
  ServerUnreachableError,
  type OrderServerPort,
  type OrderWriteResult,
} from '../application/ports';
import { OrderClient } from '../application/sync/orderClient';

/** Serwis poświadczeń w pamięci - `authorizedFetch` pyta wyłącznie o te dwie rzeczy. */
function fakeAuth(rotated: string | null = 'jwt-2') {
  const state = { token: 'jwt-1', rotations: 0 };
  const auth = {
    freshToken: async () => state.token,
    rotate: async () => {
      state.rotations += 1;
      if (rotated != null) state.token = rotated;
      return rotated;
    },
  } as unknown as AuthService;
  return { auth, state };
}

const REFUSED: OrderWriteResult = { ok: false, refusal: 'seat_filled', taken: null, takenAt: null };

describe('klient zleceń', () => {
  it('odmowa reguły przechodzi jako WYNIK, nie jako „nie wiem"', async () => {
    const server = { assignOrderSeat: jest.fn(async () => REFUSED) } as unknown as OrderServerPort;
    const client = new OrderClient(server, fakeAuth().auth);
    expect(await client.assign('o1', { pilotId: 'p2', seat: 'pic' })).toEqual(REFUSED);
    expect(server.assignOrderSeat).toHaveBeenCalledWith('jwt-1', 'o1', { pilotId: 'p2', seat: 'pic' });
  });

  it('bez sieci odczyt i zapis to `null` - ekran mówi „brak połączenia", nie „pusto" ani „odmowa"', async () => {
    const offline = async (): Promise<never> => {
      throw new ServerUnreachableError(new TypeError('Network request failed'));
    };
    const server = { getOrderSummary: offline, createOrder: offline } as unknown as OrderServerPort;
    const client = new OrderClient(server, fakeAuth().auth);
    expect(await client.fetchSummary()).toBeNull();
    expect(
      await client.create({
        id: 'o1',
        aircraftId: 'a1',
        startsAt: '2026-10-03T07:00:00.000Z',
        endsAt: '2026-10-03T11:00:00.000Z',
        operation: 'ferry',
        seats: { pic: 'sought', dual: 'self' },
        audience: { kind: 'shared', list: { pilotIds: ['p1'], groupIds: [] } },
      }),
    ).toBeNull();
  });

  it('`401` to jedna rotacja tokenu i ponowienie - wygasły token nie jest odmową', async () => {
    const getOrder = jest
      .fn()
      .mockRejectedValueOnce(new ServerRejectedError(401, 'unauthorized'))
      .mockResolvedValueOnce({ order: { id: 'o1' } });
    const { auth, state } = fakeAuth();
    const client = new OrderClient({ getOrder } as unknown as OrderServerPort, auth);

    expect(await client.fetchCard('o1')).toEqual({ order: { id: 'o1' } });
    expect(state.rotations).toBe(1);
    expect(getOrder.mock.calls.map((c) => c[0])).toEqual(['jwt-1', 'jwt-2']);
  });

  it('odczyt karty i rozmowy: `true` po zapisie, `false`, gdy nie dojechał', async () => {
    const markOrderSeen = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ServerUnreachableError(new TypeError('offline')));
    const markThreadRead = jest.fn().mockRejectedValueOnce(new ServerRejectedError(403, 'not_recipient'));
    const client = new OrderClient({ markOrderSeen, markThreadRead } as unknown as OrderServerPort, fakeAuth().auth);

    expect(await client.markSeen('o1')).toBe(true);
    expect(await client.markSeen('o1')).toBe(false);
    expect(await client.markThreadRead('o1', 'p2')).toBe(false);
  });
});
