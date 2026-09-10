/**
 * UZ Aero - `AuthService` w świecie klubów (wielofirmowość §4-§7, issue #102), na
 * atrapach portów (serwer, magazyn) - zero sieci, zero natywnych modułów.
 *
 * Własności, które muszą przetrwać każdą zmianę:
 *  1. stan „bez klubu" NIGDY nie ląduje w `StoredCredentials` - to nie jest tożsamość;
 *  2. provisioning (także z `checkMemberships`) czyści ten stan i ZERUJE PIN;
 *  3. brak sieci nie rusza magazynu, odmowa 401/404 go czyści;
 *  4. **klub melduje się magazynowi przy KAŻDYM wydaniu pary tokenów** - logowanie,
 *     zatwierdzenie w międzyczasie, rotacja i przełączenie. Klub jest kontekstem floty
 *     i wysyłki, a para tokenów jest parą DLA KLUBU: rozjazd tych dwóch rzeczy znaczy
 *     zapisy, których nie da się wysłać;
 *  5. **przełączenie klubu NIE zeruje PIN-u** - zmienia kontekst pracy, nie tożsamość
 *     urządzenia; inaczej pilot dwóch klubów ustawiałby PIN po każdej zmianie.
 */

import { AuthService } from '../application/auth/authService';
import type {
  AuthTokens,
  ClubsView,
  CredentialsPort,
  GoogleLoginResult,
  JoinClubResult,
  MembershipStatusResult,
  OrgRef,
  PinCryptoPort,
  ServerPort,
  StoredCredentials,
  StoredPerson,
} from '../application/ports';
import { ServerRejectedError, ServerUnreachableError } from '../application/ports';

const ALFA: OrgRef = { id: 'org-a', slug: 'alfa', name: 'Aeroklub Alfa' };
const BETA: OrgRef = { id: 'org-b', slug: 'beta', name: 'Aeroklub Beta' };

const tokens: AuthTokens = {
  token: 'jwt-1',
  refreshToken: 'refresh-1',
  pilot: { id: 'p1', code: 'TMK', name: 'Tomasz' },
  org: ALFA,
  memberships: [{ org: ALFA, code: 'TMK', role: 'pilot' }],
};

const betaTokens: AuthTokens = {
  ...tokens,
  token: 'jwt-b',
  refreshToken: 'refresh-b',
  pilot: { id: 'p1', code: 'TMB', name: 'Tomasz' },
  org: BETA,
};

const person = { name: 'Jan Nowak', email: 'nowak@gmail.com' };

const waitingIn = (org: OrgRef): ClubsView => ({
  status: 'pending',
  person,
  memberships: [
    {
      org,
      clubActive: true,
      status: 'pending',
      code: null,
      role: 'pilot',
      rejectReason: null,
      createdAt: '2026-09-04T09:00:00.000Z',
      decidedAt: null,
    },
  ],
});

const noClubs: ClubsView = { status: 'none', person, memberships: [] };

class FakeCredentials implements CredentialsPort {
  credentials: StoredCredentials | null = null;
  person: StoredPerson | null = null;
  async load() {
    return this.credentials;
  }
  async save(c: StoredCredentials) {
    this.credentials = c;
  }
  async clear() {
    this.credentials = null;
  }
  async loadPerson() {
    return this.person;
  }
  async savePerson(p: StoredPerson) {
    this.person = p;
  }
  async clearPerson() {
    this.person = null;
  }
}

/** Serwer scenariuszowy: odpowiada tym, co mu wpiszemy, albo rzuca tym, co mu wpiszemy. */
function fakeServer(script: {
  login?: GoogleLoginResult | Error;
  status?: MembershipStatusResult | Error;
  join?: JoinClubResult | Error;
  switch?: AuthTokens | null | Error;
  refresh?: AuthTokens | Error;
}): ServerPort {
  const answer = <T>(value: T | Error | undefined): Promise<T> =>
    value instanceof Error
      ? Promise.reject(value)
      : value === undefined
        ? Promise.reject(new Error('nieoczekiwane wywołanie'))
        : Promise.resolve(value);
  return {
    loginWithGoogle: () => answer(script.login),
    membershipStatus: () => answer(script.status),
    joinClub: () => answer(script.join),
    switchClub: () => answer(script.switch),
    refresh: () => answer(script.refresh),
  } as unknown as ServerPort;
}

const pinCrypto: PinCryptoPort = {
  create: async () => ({ salt: 's', hash: 'h' }),
  verify: async () => true,
};

/** Magazyn klubu aktywnego - w telefonie jest nim `EventsRepo`, tu tablica meldunków. */
const clubSink = () => {
  const reported: string[] = [];
  return { reported, sink: async (org: OrgRef) => void reported.push(org.id) };
};

describe('loginWithGoogle', () => {
  it('aktywne członkostwo: provisioning - tokeny z KLUBEM, PIN wyzerowany, stan osoby wyczyszczony', async () => {
    const creds = new FakeCredentials();
    creds.person = { personToken: 'stary', clubs: waitingIn(ALFA) };
    const club = clubSink();
    const auth = new AuthService(
      fakeServer({ login: { kind: 'signed_in', tokens } }),
      creds,
      pinCrypto,
      club.sink,
    );

    const outcome = await auth.loginWithGoogle('id-token');

    expect(outcome.kind).toBe('signed_in');
    expect(creds.credentials).toEqual({ ...tokens, pin: null });
    expect(creds.person).toBeNull();
    // Bez tego meldunku magazyn stemplowałby operacje pustym klubem - a takich zapisów
    // nie da się wysłać ŻADNYM tokenem.
    expect(club.reported).toEqual([ALFA.id]);
  });

  it('bez klubu: token OSOBY do OSOBNEGO magazynu, poświadczeń brak', async () => {
    const creds = new FakeCredentials();
    const clubs = waitingIn(ALFA);
    const auth = new AuthService(
      fakeServer({ login: { kind: 'no_club', personToken: 'person-1', clubs } }),
      creds,
      pinCrypto,
    );

    const outcome = await auth.loginWithGoogle('id-token');

    expect(outcome).toEqual({ kind: 'no_club', clubs });
    expect(creds.credentials).toBeNull();
    expect(creds.person).toEqual({ personToken: 'person-1', clubs });
  });

  it('odmowa serwera i brak sieci PROPAGUJĄ - ekran nazywa powód, magazyn nietknięty', async () => {
    const creds = new FakeCredentials();
    await expect(
      new AuthService(fakeServer({ login: new ServerRejectedError(401, 'invalid_token') }), creds, pinCrypto).loginWithGoogle('x'),
    ).rejects.toBeInstanceOf(ServerRejectedError);
    await expect(
      new AuthService(fakeServer({ login: new ServerUnreachableError() }), creds, pinCrypto).loginWithGoogle('x'),
    ).rejects.toBeInstanceOf(ServerUnreachableError);
    expect(creds.person).toBeNull();
  });
});

describe('checkMemberships', () => {
  const waiting = (): FakeCredentials => {
    const creds = new FakeCredentials();
    creds.person = { personToken: 'person-1', clubs: waitingIn(ALFA) };
    return creds;
  };

  it('zatwierdzono w międzyczasie: provisioning BEZ Google od nowa, stan osoby znika', async () => {
    const creds = waiting();
    const club = clubSink();
    const auth = new AuthService(
      fakeServer({ status: { kind: 'approved', tokens } }),
      creds,
      pinCrypto,
      club.sink,
    );

    const check = await auth.checkMemberships();

    expect(check.kind).toBe('signed_in');
    expect(creds.credentials).toEqual({ ...tokens, pin: null });
    expect(creds.person).toBeNull();
    expect(club.reported).toEqual([ALFA.id]);
  });

  it('nadal czeka: magazyn odświeżony danymi z serwera, token osoby zostaje', async () => {
    const creds = waiting();
    const fresh = waitingIn(BETA);
    const auth = new AuthService(fakeServer({ status: { kind: 'clubs', clubs: fresh } }), creds, pinCrypto);

    expect(await auth.checkMemberships()).toEqual({ kind: 'clubs', clubs: fresh });
    expect(creds.person).toEqual({ personToken: 'person-1', clubs: fresh });
  });

  it('brak sieci: `unreachable`, a zapisany stan NIETKNIĘTY (§4.1)', async () => {
    const creds = waiting();
    const auth = new AuthService(fakeServer({ status: new ServerUnreachableError() }), creds, pinCrypto);

    expect(await auth.checkMemberships()).toEqual({ kind: 'unreachable' });
    expect(creds.person).toEqual({ personToken: 'person-1', clubs: waitingIn(ALFA) });
  });

  it('serwer za tokenem nikogo nie widzi (401/404): `gone` i pusty magazyn - droga na logowanie', async () => {
    for (const status of [401, 404]) {
      const creds = waiting();
      const auth = new AuthService(fakeServer({ status: new ServerRejectedError(status, 'unauthorized') }), creds, pinCrypto);
      expect(await auth.checkMemberships()).toEqual({ kind: 'gone' });
      expect(creds.person).toBeNull();
    }
  });

  it('bez zapisanego stanu osoby: `gone`', async () => {
    const auth = new AuthService(fakeServer({}), new FakeCredentials(), pinCrypto);
    expect(await auth.checkMemberships()).toEqual({ kind: 'gone' });
  });
});

describe('joinClub - kod klubu', () => {
  it('zgłoszenie przyjęte: nowy stan osoby w magazynie (00C przeżywa restart)', async () => {
    const creds = new FakeCredentials();
    creds.person = { personToken: 'person-1', clubs: noClubs };
    const clubs = waitingIn(ALFA);
    const auth = new AuthService(
      fakeServer({ join: { kind: 'pending', org: ALFA, clubs } }),
      creds,
      pinCrypto,
    );

    expect(await auth.joinClub('AZG-7K4M')).toEqual({ kind: 'pending', org: ALFA, clubs });
    expect(creds.person).toEqual({ personToken: 'person-1', clubs });
  });

  it('odmowa klubu: powód ląduje w magazynie, żeby 00D przeżyło restart', async () => {
    const creds = new FakeCredentials();
    creds.person = { personToken: 'person-1', clubs: noClubs };
    const auth = new AuthService(
      fakeServer({
        join: { kind: 'rejected', org: ALFA, rejectReason: 'To konto prywatne', decidedAt: null },
      }),
      creds,
      pinCrypto,
    );

    const result = await auth.joinClub('AZG-7K4M');

    expect(result.kind).toBe('rejected');
    expect(creds.person?.clubs.status).toBe('rejected');
    expect(creds.person?.clubs.memberships[0]?.rejectReason).toBe('To konto prywatne');
    // Plakietka konta przeżywa odmowę - to wciąż ta sama osoba pod tym samym adresem.
    expect(creds.person?.clubs.person).toEqual(person);
  });

  it('pilot, który JUŻ lata w klubie, dołącza WŁASNYM tokenem i magazynu osoby nie dostaje', async () => {
    const creds = new FakeCredentials();
    creds.credentials = { ...tokens, pin: { salt: 's', hash: 'h' } };
    const auth = new AuthService(
      fakeServer({ join: { kind: 'pending', org: BETA, clubs: waitingIn(BETA) } }),
      creds,
      pinCrypto,
    );

    expect((await auth.joinClub('BET-2345')).kind).toBe('pending');
    // Zgłoszenie do drugiego klubu NIE robi z niego osoby bez klubu: pilot pracuje
    // dalej tam, gdzie był, a zgłoszenie widzi jako wiersz na liście klubów (13A).
    expect(creds.person).toBeNull();
    expect(creds.credentials?.org).toEqual(ALFA);
  });

  it('brak sieci: `unreachable` jako WYNIK, nie wyjątek - ekran ma na to własne zdanie', async () => {
    const creds = new FakeCredentials();
    creds.person = { personToken: 'person-1', clubs: noClubs };
    const auth = new AuthService(fakeServer({ join: new ServerUnreachableError() }), creds, pinCrypto);

    expect(await auth.joinClub('AZG-7K4M')).toEqual({ kind: 'unreachable' });
  });
});

describe('switchClub - przełączenie klubu', () => {
  const flying = (): FakeCredentials => {
    const creds = new FakeCredentials();
    creds.credentials = { ...tokens, pin: { salt: 's', hash: 'h' } };
    return creds;
  };

  it('nowa para tokenów DLA CELU, klub zameldowany, PIN NIETKNIĘTY', async () => {
    const creds = flying();
    const club = clubSink();
    const auth = new AuthService(fakeServer({ switch: betaTokens }), creds, pinCrypto, club.sink);

    const outcome = await auth.switchClub(BETA.id);

    expect(outcome.kind).toBe('switched');
    expect(creds.credentials?.org).toEqual(BETA);
    expect(creds.credentials?.pilot.code).toBe('TMB'); // kod należy do CZŁONKOSTWA
    expect(creds.credentials?.pin).toEqual({ salt: 's', hash: 'h' });
    expect(club.reported).toEqual([BETA.id]);
  });

  it('klub, w którym pilot już nie lata: `not_found`, poświadczenia bez zmian', async () => {
    const creds = flying();
    const auth = new AuthService(fakeServer({ switch: null }), creds, pinCrypto);

    expect(await auth.switchClub(BETA.id)).toEqual({ kind: 'not_found' });
    expect(creds.credentials?.org).toEqual(ALFA);
  });

  it('brak sieci: `unreachable` - pilot pracuje dalej w klubie, w którym jest (§6)', async () => {
    const creds = flying();
    const auth = new AuthService(fakeServer({ switch: new ServerUnreachableError() }), creds, pinCrypto);

    expect(await auth.switchClub(BETA.id)).toEqual({ kind: 'unreachable' });
    expect(creds.credentials?.org).toEqual(ALFA);
  });
});

describe('rotate', () => {
  it('odświeżenie tokenów melduje klub - to jest droga telefonu po aktualizacji z 1.x (§11)', async () => {
    const creds = new FakeCredentials();
    // Profil sprzed 2.0.0: bez klubu, z PIN-em.
    creds.credentials = {
      token: 'stary',
      refreshToken: 'r-stary',
      pilot: tokens.pilot,
      pin: { salt: 's', hash: 'h' },
    };
    const club = clubSink();
    const auth = new AuthService(fakeServer({ refresh: tokens }), creds, pinCrypto, club.sink);

    expect(await auth.rotate()).toBe('jwt-1');
    expect(creds.credentials?.org).toEqual(ALFA);
    expect(creds.credentials?.pin).toEqual({ salt: 's', hash: 'h' }); // PIN przeżywa rotację
    expect(club.reported).toEqual([ALFA.id]);
  });
});

describe('abandonPerson', () => {
  it('„Zaloguj innym kontem" czyści stan osoby na tym telefonie', async () => {
    const creds = new FakeCredentials();
    creds.person = { personToken: 'person-1', clubs: waitingIn(ALFA) };
    await new AuthService(fakeServer({}), creds, pinCrypto).abandonPerson();
    expect(creds.person).toBeNull();
  });
});
