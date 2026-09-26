/**
 * Ninerdeck - testy ZGŁOSZENIA TOKENU PUSH (`application/sync/pushTokenSync.ts`, epik R-J).
 *
 * Pod obserwacją: jeden `POST` na parę (poświadczenia, token) w jednym uruchomieniu,
 * ponowna rejestracja po zmianie poświadczeń (nowa sesja logowania), a brak tokenu,
 * profilu albo sieci to cisza, nie wyjątek.
 */

import { AuthService } from '../application/auth/authService';
import type { PushDevicePort, ServerPort, StoredCredentials } from '../application/ports';
import { ServerUnreachableError } from '../application/ports';
import { PushTokenSync } from '../application/sync/pushTokenSync';
import { PinCrypto } from '../infrastructure/auth/pinCrypto';

const PILOT = { id: 'AKO', code: 'AKO', name: 'Adam Kowalski' };
const ORG = { id: 'org-a', slug: 'alfa', name: 'Aeroklub Alfa' };
const creds = (refreshToken: string): StoredCredentials => ({
  token: 'jwt',
  refreshToken,
  pilot: PILOT,
  org: ORG,
  memberships: [],
});

class MemoryCredentials {
  loadPerson = async (): Promise<null> => null;
  savePerson = async (_person: unknown): Promise<void> => {};
  clearPerson = async (): Promise<void> => {};
  constructor(public stored: StoredCredentials | null) {}
  load = async () => this.stored;
  save = async (c: StoredCredentials) => {
    this.stored = c;
  };
  clear = async () => {
    this.stored = null;
  };
}

/** Serwer-skrypt: liczy rejestracje; potrafi udawać brak sieci. */
function fakeServer(offline = false) {
  const registered: string[] = [];
  const server = {
    async registerPushToken(_token: string, deviceToken: string): Promise<void> {
      if (offline) throw new ServerUnreachableError('offline');
      registered.push(deviceToken);
    },
  } as unknown as ServerPort;
  return { server, registered };
}

const device = (token: string | null): PushDevicePort => ({ token: async () => token });

function harness(input: { token: string | null; stored?: StoredCredentials | null; offline?: boolean }) {
  const { server, registered } = fakeServer(input.offline);
  const credentials = new MemoryCredentials(input.stored === undefined ? creds('r1') : input.stored);
  const auth = new AuthService(server, credentials, new PinCrypto());
  return { sync: new PushTokenSync(device(input.token), server, auth), registered, credentials };
}

describe('PushTokenSync', () => {
  it('rejestruje RAZ na uruchomienie; kolejne okazje nie rozmawiają z serwerem', async () => {
    const { sync, registered } = harness({ token: 'ExponentPushToken[abc]' });
    expect(await sync.register()).toBe('registered');
    expect(await sync.register()).toBe('fresh');
    expect(await sync.register()).toBe('fresh');
    expect(registered).toEqual(['ExponentPushToken[abc]']);
  });

  it('nowe poświadczenia (nowa sesja logowania) znaczą nową rejestrację', async () => {
    const { sync, registered, credentials } = harness({ token: 'ExponentPushToken[abc]' });
    await sync.register();
    credentials.stored = creds('r2');
    expect(await sync.register()).toBe('registered');
    expect(registered).toHaveLength(2);
  });

  it('bez tokenu urządzenia - `unavailable`, bez profilu - `skipped`; żadne nie woła serwera', async () => {
    const bezTokenu = harness({ token: null });
    expect(await bezTokenu.sync.register()).toBe('unavailable');
    expect(bezTokenu.registered).toEqual([]);

    const bezProfilu = harness({ token: 'ExponentPushToken[abc]', stored: null });
    expect(await bezProfilu.sync.register()).toBe('skipped');
    expect(bezProfilu.registered).toEqual([]);
  });

  it('brak sieci to `skipped` bez wyjątku - następna okazja spróbuje znowu', async () => {
    const { sync, registered } = harness({ token: 'ExponentPushToken[abc]', offline: true });
    expect(await sync.register()).toBe('skipped');
    expect(await sync.register()).toBe('skipped');
    expect(registered).toEqual([]);
  });
});
