/**
 * UZ Aero - `AuthService` po wejściu Google: trzy wyjścia logowania i sprawdzanie
 * zgłoszenia, na atrapach portów (serwer, magazyn) - zero sieci, zero natywnych modułów.
 *
 * Własności, które muszą przetrwać każdą zmianę:
 *  1. zgłoszenie NIGDY nie ląduje w `StoredCredentials` - to nie jest tożsamość;
 *  2. provisioning (także z `checkRegistration`) czyści zgłoszenie i ZERUJE PIN;
 *  3. brak sieci nie rusza magazynu, odmowa 401/404 go czyści.
 */

import { AuthService } from '../application/auth/authService';
import type {
  AuthTokens,
  CredentialsPort,
  GoogleLoginResult,
  PinCryptoPort,
  RegistrationStatusResult,
  RemoteRegistration,
  ServerPort,
  StoredCredentials,
  StoredRegistration,
} from '../application/ports';
import { ServerRejectedError, ServerUnreachableError } from '../application/ports';

const tokens: AuthTokens = {
  token: 'jwt-1',
  refreshToken: 'refresh-1',
  pilot: { id: 'p1', code: 'TMK', name: 'Tomasz' },
};

const registration: RemoteRegistration = {
  provider: 'google',
  name: 'Jan Nowak',
  email: 'nowak@gmail.com',
  status: 'pending',
  rejectReason: null,
  createdAt: '2026-09-04T09:00:00.000Z',
  decidedAt: null,
};

class FakeCredentials implements CredentialsPort {
  credentials: StoredCredentials | null = null;
  registration: StoredRegistration | null = null;
  async load() {
    return this.credentials;
  }
  async save(c: StoredCredentials) {
    this.credentials = c;
  }
  async clear() {
    this.credentials = null;
  }
  async loadRegistration() {
    return this.registration;
  }
  async saveRegistration(r: StoredRegistration) {
    this.registration = r;
  }
  async clearRegistration() {
    this.registration = null;
  }
}

/** Serwer scenariuszowy: odpowiada tym, co mu wpiszemy, albo rzuca tym, co mu wpiszemy. */
function fakeServer(script: {
  login?: GoogleLoginResult | Error;
  status?: RegistrationStatusResult | Error;
}): ServerPort {
  const answer = <T>(value: T | Error | undefined): Promise<T> =>
    value instanceof Error
      ? Promise.reject(value)
      : value == null
        ? Promise.reject(new Error('nieoczekiwane wywołanie'))
        : Promise.resolve(value);
  return {
    loginWithGoogle: () => answer(script.login),
    registrationStatus: () => answer(script.status),
  } as unknown as ServerPort;
}

const pinCrypto: PinCryptoPort = {
  create: async () => ({ salt: 's', hash: 'h' }),
  verify: async () => true,
};

describe('loginWithGoogle', () => {
  it('konto zatwierdzone: provisioning - tokeny w magazynie, PIN wyzerowany, zgłoszenie wyczyszczone', async () => {
    const creds = new FakeCredentials();
    creds.registration = { registrationToken: 'stary', registration };
    const auth = new AuthService(fakeServer({ login: { kind: 'signed_in', tokens } }), creds, pinCrypto);

    const outcome = await auth.loginWithGoogle('id-token');

    expect(outcome.kind).toBe('signed_in');
    expect(creds.credentials).toEqual({ ...tokens, pin: null });
    expect(creds.registration).toBeNull();
  });

  it('zgłoszenie czeka: token rejestracyjny do OSOBNEGO magazynu, poświadczeń brak', async () => {
    const creds = new FakeCredentials();
    const auth = new AuthService(
      fakeServer({ login: { kind: 'pending', registration, registrationToken: 'reg-1' } }),
      creds,
      pinCrypto,
    );

    const outcome = await auth.loginWithGoogle('id-token');

    expect(outcome).toEqual({ kind: 'pending', registration });
    expect(creds.credentials).toBeNull();
    expect(creds.registration).toEqual({ registrationToken: 'reg-1', registration });
  });

  it('odrzucone: zapis BEZ tokenu, żeby 00d pokazało powód także po restarcie', async () => {
    const creds = new FakeCredentials();
    const rejected = { ...registration, status: 'rejected' as const, rejectReason: 'nie z klubu' };
    const auth = new AuthService(fakeServer({ login: { kind: 'rejected', registration: rejected } }), creds, pinCrypto);

    const outcome = await auth.loginWithGoogle('id-token');

    expect(outcome).toEqual({ kind: 'rejected', registration: rejected });
    expect(creds.registration).toEqual({ registrationToken: null, registration: rejected });
    expect(creds.credentials).toBeNull();
  });

  it('odmowa serwera i brak sieci PROPAGUJĄ - ekran nazywa powód, magazyn nietknięty', async () => {
    const creds = new FakeCredentials();
    await expect(
      new AuthService(fakeServer({ login: new ServerRejectedError(401, 'invalid_token') }), creds, pinCrypto).loginWithGoogle('x'),
    ).rejects.toBeInstanceOf(ServerRejectedError);
    await expect(
      new AuthService(fakeServer({ login: new ServerUnreachableError() }), creds, pinCrypto).loginWithGoogle('x'),
    ).rejects.toBeInstanceOf(ServerUnreachableError);
    expect(creds.registration).toBeNull();
  });
});

describe('checkRegistration', () => {
  const waiting = (): FakeCredentials => {
    const creds = new FakeCredentials();
    creds.registration = { registrationToken: 'reg-1', registration };
    return creds;
  };

  it('zatwierdzono w międzyczasie: provisioning BEZ Google od nowa, zgłoszenie znika', async () => {
    const creds = waiting();
    const auth = new AuthService(fakeServer({ status: { kind: 'approved', tokens } }), creds, pinCrypto);

    const check = await auth.checkRegistration();

    expect(check.kind).toBe('signed_in');
    expect(creds.credentials).toEqual({ ...tokens, pin: null });
    expect(creds.registration).toBeNull();
  });

  it('nadal czeka: magazyn odświeżony danymi z serwera, token zostaje', async () => {
    const creds = waiting();
    const fresh = { ...registration, name: 'Jan K. Nowak' };
    const auth = new AuthService(fakeServer({ status: { kind: 'pending', registration: fresh } }), creds, pinCrypto);

    expect(await auth.checkRegistration()).toEqual({ kind: 'pending', registration: fresh });
    expect(creds.registration).toEqual({ registrationToken: 'reg-1', registration: fresh });
  });

  it('odrzucono w międzyczasie: powód dojeżdża do magazynu', async () => {
    const creds = waiting();
    const rejected = { ...registration, status: 'rejected' as const, rejectReason: 'nie z klubu' };
    const auth = new AuthService(fakeServer({ status: { kind: 'rejected', registration: rejected } }), creds, pinCrypto);

    expect(await auth.checkRegistration()).toEqual({ kind: 'rejected', registration: rejected });
    expect(creds.registration?.registration.rejectReason).toBe('nie z klubu');
  });

  it('brak sieci: `unreachable`, a zapisane zgłoszenie NIETKNIĘTE (§4.1)', async () => {
    const creds = waiting();
    const auth = new AuthService(fakeServer({ status: new ServerUnreachableError() }), creds, pinCrypto);

    expect(await auth.checkRegistration()).toEqual({ kind: 'unreachable' });
    expect(creds.registration).toEqual({ registrationToken: 'reg-1', registration });
  });

  it('serwer zgłoszenia nie zna (401/404): `gone` i pusty magazyn - droga wraca na logowanie', async () => {
    for (const status of [401, 404]) {
      const creds = waiting();
      const auth = new AuthService(fakeServer({ status: new ServerRejectedError(status, 'unauthorized') }), creds, pinCrypto);
      expect(await auth.checkRegistration()).toEqual({ kind: 'gone' });
      expect(creds.registration).toBeNull();
    }
  });

  it('zgłoszenie odrzucone przy logowaniu (bez tokenu) nie pyta serwera - stan jest znany', async () => {
    const creds = new FakeCredentials();
    const rejected = { ...registration, status: 'rejected' as const, rejectReason: 'x' };
    creds.registration = { registrationToken: null, registration: rejected };
    const auth = new AuthService(fakeServer({}), creds, pinCrypto);

    expect(await auth.checkRegistration()).toEqual({ kind: 'rejected', registration: rejected });
  });

  it('bez zapisanego zgłoszenia: `gone`', async () => {
    const auth = new AuthService(fakeServer({}), new FakeCredentials(), pinCrypto);
    expect(await auth.checkRegistration()).toEqual({ kind: 'gone' });
  });
});

describe('abandonRegistration', () => {
  it('„Zaloguj innym kontem" czyści zgłoszenie na tym telefonie', async () => {
    const creds = new FakeCredentials();
    creds.registration = { registrationToken: 'reg-1', registration };
    await new AuthService(fakeServer({}), creds, pinCrypto).abandonRegistration();
    expect(creds.registration).toBeNull();
  });
});
