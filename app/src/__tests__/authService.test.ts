/**
 * Ninerdeck - `AuthService` w świecie klubów (wielofirmowość §4-§7, issue #102), na
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
 *
 * ══ 2.1.0: HASŁO, KLUBY URZĄDZENIA, SESJA UNIEWAŻNIONA (issue #135 E2) ══
 *  6. **hasło kończy się tam, gdzie Google** - te same dwa wyjścia i ten sam provisioning;
 *     jedyną różnicą jest DOWÓD. Trzecia droga do tokenów klubu byłaby trzecim miejscem,
 *     w którym ktoś napisze wybór klubu po swojemu;
 *  7. **urządzenie pamięta KLUBY, nie osoby** - lista przeżywa wylogowanie, bo opisuje
 *     samolot; to z niej bierze się klub, w którym rozwiąże się wpisany kod pilota;
 *  8. **wylogowanie woła serwer PRZED czyszczeniem magazynu**, ale brak sieci go nie
 *     zatrzymuje (§9): pilot oddaje tablet następnemu i nie ma na co czekać;
 *  9. **`session_revoked` ≠ `invalid_refresh`** - pierwsze jest decyzją człowieka, więc
 *     zostawia znacznik w magazynie; ŻADNE nie kasuje poświadczeń ani PIN-u (§3.0).
 */

import { AuthService } from '../application/auth/authService';
import type {
  AuthTokens,
  ClubsView,
  CredentialsPort,
  DeviceClubsPort,
  DeviceClubsRecord,
  GoogleLoginResult,
  JoinClubResult,
  MembershipStatusResult,
  OrgRef,
  PasswordLoginResult,
  PinCryptoPort,
  ServerPort,
  SetPasswordResult,
  StoredCredentials,
  StoredPerson,
} from '../application/ports';
import { ServerRejectedError, ServerUnreachableError } from '../application/ports';

const ALFA: OrgRef = { id: 'org-a', slug: 'alfa', name: 'Aeroklub Alfa' };
const BETA: OrgRef = { id: 'org-b', slug: 'beta', name: 'Aeroklub Beta' };

const tokens: AuthTokens = {
  token: 'jwt-1',
  refreshToken: 'refresh-1',
  pilot: { id: 'p1', code: 'TMK', name: 'Adam' },
  org: ALFA,
  memberships: [{ org: ALFA, code: 'TMK', role: 'pilot' }],
};

const betaTokens: AuthTokens = {
  ...tokens,
  token: 'jwt-b',
  refreshToken: 'refresh-b',
  pilot: { id: 'p1', code: 'TMB', name: 'Adam' },
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
  password?: PasswordLoginResult | Error;
  forgot?: Error;
  signup?: Error;
  setPassword?: SetPasswordResult | Error | Array<SetPasswordResult | Error>;
  logout?: Error;
  /** Dziennik wywołań - 2.1.0 pyta nie tylko O CO, ale też CZYM i W JAKIEJ KOLEJNOŚCI. */
  calls?: string[];
  passwordInput?: Array<{ login: string; password: string; orgId?: string | null }>;
}): ServerPort {
  const answer = <T>(value: T | Error | undefined): Promise<T> =>
    value instanceof Error
      ? Promise.reject(value)
      : value === undefined
        ? Promise.reject(new Error('nieoczekiwane wywołanie'))
        : Promise.resolve(value);
  // `setPassword` bywa TABLICĄ, bo jedyny ciekawy scenariusz tej metody to dwa wywołania
  // po sobie: odmowa 401 tokenu → rotacja → ponowienie.
  const setPasswordScript = Array.isArray(script.setPassword)
    ? [...script.setPassword]
    : script.setPassword === undefined
      ? []
      : [script.setPassword];
  return {
    loginWithGoogle: () => answer(script.login),
    membershipStatus: () => answer(script.status),
    joinClub: () => answer(script.join),
    switchClub: () => answer(script.switch),
    refresh: () => {
      script.calls?.push('refresh');
      return answer(script.refresh);
    },
    loginWithPassword: (input: { login: string; password: string; orgId?: string | null }) => {
      script.passwordInput?.push(input);
      return answer(script.password);
    },
    forgotPassword: () => (script.forgot != null ? Promise.reject(script.forgot) : Promise.resolve()),
    signUp: () => (script.signup != null ? Promise.reject(script.signup) : Promise.resolve()),
    setPassword: (token: string) => {
      script.calls?.push(`setPassword:${token}`);
      return answer(setPasswordScript.shift());
    },
    logout: (refreshToken: string) => {
      script.calls?.push(`logout:${refreshToken}`);
      return script.logout != null ? Promise.reject(script.logout) : Promise.resolve();
    },
  } as unknown as ServerPort;
}

/** Atrapa klubów urządzenia - w telefonie `DeviceClubsStore` na AsyncStorage. */
class FakeDeviceClubs implements DeviceClubsPort {
  record: DeviceClubsRecord = { clubs: [], activeId: null };
  async read() {
    return this.record;
  }
  async remember(club: OrgRef, at: string) {
    this.record = {
      clubs: [
        { id: club.id, name: club.name, lastLoginAt: at },
        ...this.record.clubs.filter((c) => c.id !== club.id),
      ],
      activeId: club.id,
    };
  }
  async setActive(orgId: string) {
    if (this.record.clubs.some((c) => c.id === orgId)) this.record = { ...this.record, activeId: orgId };
  }
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

// ── 2.1.0: logowanie hasłem (issue #135 E2) ──────────────────────────────────────

describe('loginWithPassword', () => {
  it('aktywne członkostwo: provisioning DOKŁADNIE jak po Google - klub, PIN wyzerowany', async () => {
    const creds = new FakeCredentials();
    creds.credentials = { token: 'stary', refreshToken: 'r', pilot: tokens.pilot, pin: { salt: 's', hash: 'h' } };
    const club = clubSink();
    const auth = new AuthService(
      fakeServer({ password: { kind: 'signed_in', tokens } }),
      creds,
      pinCrypto,
      club.sink,
      new FakeDeviceClubs(),
    );

    const result = await auth.loginWithPassword({ login: 'tmk@ninerdeck.pl', password: 'dobre-haslo-2026' });

    expect(result).toEqual({ kind: 'signed_in', stored: creds.credentials });
    expect(creds.credentials?.org).toEqual(ALFA);
    // PIN świeżego provisioningu jest ZEROWANY - nowy pilot na wspólnym tablecie
    // nie ma prawa wejść PIN-em poprzednika.
    expect(creds.credentials?.pin).toBeNull();
    expect(club.reported).toEqual([ALFA.id]);
  });

  it('bez klubu: zapis stanu OSOBY, a nie poświadczeń - token osoby niczego nie podpisuje', async () => {
    const creds = new FakeCredentials();
    const auth = new AuthService(
      fakeServer({ password: { kind: 'no_club', personToken: 'person-1', clubs: noClubs } }),
      creds,
      pinCrypto,
      undefined,
      new FakeDeviceClubs(),
    );

    expect(await auth.loginWithPassword({ login: 'nowy@gmail.com', password: 'dobre-haslo-2026' })).toEqual({
      kind: 'no_club',
      clubs: noClubs,
    });
    expect(creds.credentials).toBeNull();
    expect(creds.person).toEqual({ personToken: 'person-1', clubs: noClubs });
  });

  it('podaje serwerowi KLUB URZĄDZENIA - bez niego kod pilota nie ma się w czym rozwiązać', async () => {
    const clubs = new FakeDeviceClubs();
    await clubs.remember(ALFA, '2026-09-18T07:00:00.000Z');
    const seen: Array<{ login: string; password: string; orgId?: string | null }> = [];
    const auth = new AuthService(
      fakeServer({ password: { kind: 'signed_in', tokens }, passwordInput: seen }),
      new FakeCredentials(),
      pinCrypto,
      undefined,
      clubs,
    );

    await auth.loginWithPassword({ login: 'AKO', password: 'dobre-haslo-2026' });

    expect(seen).toEqual([{ login: 'AKO', password: 'dobre-haslo-2026', orgId: ALFA.id }]);
  });

  it('świeże urządzenie nie zna żadnego klubu - jedzie bez niego, loginem zostaje adres', async () => {
    const seen: Array<{ login: string; password: string; orgId?: string | null }> = [];
    const auth = new AuthService(
      fakeServer({ password: { kind: 'signed_in', tokens }, passwordInput: seen }),
      new FakeCredentials(),
      pinCrypto,
      undefined,
      new FakeDeviceClubs(),
    );

    await auth.loginWithPassword({ login: 'tmk@ninerdeck.pl', password: 'dobre-haslo-2026' });

    expect(seen[0]?.orgId).toBeNull();
  });

  it.each([
    ['invalid_credentials', { kind: 'invalid_credentials' } as const],
    ['account_disabled', { kind: 'account_disabled' } as const],
    ['rate_limited', { kind: 'rate_limited', retryAfterSec: 180 } as const],
  ])('odmowa %s jest WYNIKIEM i nie rusza magazynu', async (_name, refusal) => {
    const creds = new FakeCredentials();
    const auth = new AuthService(
      fakeServer({ password: refusal }),
      creds,
      pinCrypto,
      undefined,
      new FakeDeviceClubs(),
    );

    expect(await auth.loginWithPassword({ login: 'AKO', password: 'zle' })).toEqual(refusal);
    expect(creds.credentials).toBeNull();
    expect(creds.person).toBeNull();
  });

  it('brak sieci jest WYNIKIEM, nie wyjątkiem - 00F ma na to własne zdanie', async () => {
    const auth = new AuthService(
      fakeServer({ password: new ServerUnreachableError() }),
      new FakeCredentials(),
      pinCrypto,
      undefined,
      new FakeDeviceClubs(),
    );

    expect(await auth.loginWithPassword({ login: 'AKO', password: 'x' })).toEqual({ kind: 'unreachable' });
  });
});

describe('prośba o link (00G, 00H)', () => {
  it('„Nie pamiętam hasła" i „Załóż konto" odpowiadają tak samo - serwer nie rozróżnia adresów', async () => {
    const auth = new AuthService(fakeServer({}), new FakeCredentials(), pinCrypto);

    expect(await auth.forgotPassword('kto@gmail.com')).toEqual({ kind: 'sent' });
    expect(await auth.signUp({ name: 'Jan Nowak', email: 'kto@gmail.com' })).toEqual({ kind: 'sent' });
  });

  it('brak sieci mówi co innego niż wysłany list - „nie wiem, czy poszedł"', async () => {
    const auth = new AuthService(
      fakeServer({ forgot: new ServerUnreachableError(), signup: new ServerUnreachableError() }),
      new FakeCredentials(),
      pinCrypto,
    );

    expect(await auth.forgotPassword('kto@gmail.com')).toEqual({ kind: 'unreachable' });
    expect(await auth.signUp({ name: 'Jan Nowak', email: 'kto@gmail.com' })).toEqual({ kind: 'unreachable' });
  });
});

describe('setPassword (13B)', () => {
  it('po odmowie 401 tokenu robi JEDNĄ rotację i ponawia - to nie jest złe hasło', async () => {
    const creds = new FakeCredentials();
    creds.credentials = { token: 'stary', refreshToken: 'r-stary', pilot: tokens.pilot, pin: null };
    const calls: string[] = [];
    const auth = new AuthService(
      fakeServer({
        calls,
        refresh: tokens,
        setPassword: [new ServerRejectedError(401, 'unauthorized'), { kind: 'ok' }],
      }),
      creds,
      pinCrypto,
    );

    expect(await auth.setPassword({ next: 'dobre-haslo-2026' })).toEqual({ kind: 'ok' });
    expect(calls).toEqual(['setPassword:stary', 'refresh', 'setPassword:jwt-1']);
  });

  it('odmowy serwera są WYNIKAMI - każda ma w arkuszu inne miejsce', async () => {
    const creds = new FakeCredentials();
    creds.credentials = { token: 'jwt-1', refreshToken: 'r', pilot: tokens.pilot, pin: null };
    const weak = { kind: 'weak_password', reason: 'too_short' } as const;
    const auth = new AuthService(fakeServer({ setPassword: weak }), creds, pinCrypto);

    expect(await auth.setPassword({ next: 'krotkie' })).toEqual(weak);
  });

  it('brak sieci jest wynikiem - arkusz blokuje z powodem, a nie wywala się', async () => {
    const creds = new FakeCredentials();
    creds.credentials = { token: 'jwt-1', refreshToken: 'r', pilot: tokens.pilot, pin: null };
    const auth = new AuthService(
      fakeServer({ setPassword: new ServerUnreachableError() }),
      creds,
      pinCrypto,
    );

    expect(await auth.setPassword({ next: 'dobre-haslo-2026' })).toEqual({ kind: 'unreachable' });
  });
});

describe('logout', () => {
  it('woła serwer PRZED czyszczeniem magazynu - inaczej refresh żyłby jeszcze 90 dni', async () => {
    const creds = new FakeCredentials();
    creds.credentials = { token: 'jwt-1', refreshToken: 'refresh-1', pilot: tokens.pilot, pin: null };
    const calls: string[] = [];
    const auth = new AuthService(fakeServer({ calls }), creds, pinCrypto);

    expect(await auth.logout(0)).toBeNull();
    expect(calls).toEqual(['logout:refresh-1']);
    expect(creds.credentials).toBeNull();
  });

  it('bez sieci wylogowuje i tyle (§9) - pilot oddaje tablet następnemu', async () => {
    const creds = new FakeCredentials();
    creds.credentials = { token: 'jwt-1', refreshToken: 'refresh-1', pilot: tokens.pilot, pin: null };
    const auth = new AuthService(fakeServer({ logout: new ServerUnreachableError() }), creds, pinCrypto);

    expect(await auth.logout(0)).toBeNull();
    expect(creds.credentials).toBeNull();
  });

  it('niepusty outbox blokuje ZANIM serwer się o czymkolwiek dowie', async () => {
    const creds = new FakeCredentials();
    creds.credentials = { token: 'jwt-1', refreshToken: 'refresh-1', pilot: tokens.pilot, pin: null };
    const calls: string[] = [];
    const auth = new AuthService(fakeServer({ calls }), creds, pinCrypto);

    expect(await auth.logout(3)).toBe('outbox_not_empty');
    expect(calls).toEqual([]);
    expect(creds.credentials).not.toBeNull();
  });

  it('klub odchodzącego ZOSTAJE kontekstem urządzenia - następny wpisuje sam kod pilota', async () => {
    const creds = new FakeCredentials();
    const clubs = new FakeDeviceClubs();
    const auth = new AuthService(
      fakeServer({ login: { kind: 'signed_in', tokens }, calls: [] }),
      creds,
      pinCrypto,
      undefined,
      clubs,
    );

    await auth.loginWithGoogle('id-token');
    await auth.logout(0);

    expect(creds.credentials).toBeNull(); // poświadczenia znikają
    expect(clubs.record.activeId).toBe(ALFA.id); // klub zostaje
    expect(clubs.record.clubs).toEqual([
      { id: ALFA.id, name: ALFA.name, lastLoginAt: expect.any(String) },
    ]);
  });
});

describe('kluby urządzenia (D10)', () => {
  it('dopisują się przy KAŻDYM wydaniu tokenów klubu - także przy rotacji i przełączeniu', async () => {
    const creds = new FakeCredentials();
    creds.credentials = { token: 'stary', refreshToken: 'r-stary', pilot: tokens.pilot, pin: null };
    const clubs = new FakeDeviceClubs();
    const auth = new AuthService(
      fakeServer({ refresh: tokens, switch: betaTokens }),
      creds,
      pinCrypto,
      undefined,
      clubs,
    );

    await auth.rotate();
    expect(clubs.record.activeId).toBe(ALFA.id);

    await auth.switchClub(BETA.id);
    expect(clubs.record.activeId).toBe(BETA.id);
    expect(clubs.record.clubs.map((c) => c.id)).toEqual([BETA.id, ALFA.id]);
  });

  it('wybór na 00I przestawia kontekst kodu pilota, nie ruszając listy', async () => {
    const clubs = new FakeDeviceClubs();
    await clubs.remember(ALFA, '2026-09-17T07:00:00.000Z');
    await clubs.remember(BETA, '2026-09-18T07:00:00.000Z');
    const auth = new AuthService(fakeServer({}), new FakeCredentials(), pinCrypto, undefined, clubs);

    await auth.useDeviceClub(ALFA.id);

    const record = await auth.deviceClubs();
    expect(record.activeId).toBe(ALFA.id);
    expect(record.clubs).toHaveLength(2);
  });
});

describe('sesja unieważniona zdalnie (D7)', () => {
  it('`session_revoked` zostawia ZNACZNIK, ale nie rusza tokenów ani PIN-u (§3.0)', async () => {
    const creds = new FakeCredentials();
    const pin = { salt: 's', hash: 'h' };
    creds.credentials = { token: 'jwt-1', refreshToken: 'refresh-1', pilot: tokens.pilot, pin };
    const auth = new AuthService(
      fakeServer({ refresh: new ServerRejectedError(401, 'session_revoked') }),
      creds,
      pinCrypto,
    );

    expect(await auth.rotate()).toBeNull();
    expect(await auth.revoked()).toBe(true);
    // Dane dnia zostają na urządzeniu: zdalne wylogowanie zatrzymuje WYSYŁKĘ,
    // a nie kasuje zapisów, których serwer jeszcze nie ma.
    expect(creds.credentials?.refreshToken).toBe('refresh-1');
    expect(creds.credentials?.pin).toEqual(pin);
  });

  it('`invalid_refresh` znacznika NIE stawia - to zwykłe zestarzenie się poświadczenia', async () => {
    const creds = new FakeCredentials();
    creds.credentials = { token: 'jwt-1', refreshToken: 'refresh-1', pilot: tokens.pilot, pin: null };
    const auth = new AuthService(
      fakeServer({ refresh: new ServerRejectedError(401, 'invalid_refresh') }),
      creds,
      pinCrypto,
    );

    expect(await auth.rotate()).toBeNull();
    expect(await auth.revoked()).toBe(false);
  });

  it('świeża para tokenów GASI znacznik - baner na 00 znika sam po zalogowaniu', async () => {
    const creds = new FakeCredentials();
    creds.credentials = {
      token: 'jwt-0',
      refreshToken: 'r-0',
      pilot: tokens.pilot,
      pin: null,
      revoked: true,
    };
    const auth = new AuthService(
      fakeServer({ password: { kind: 'signed_in', tokens } }),
      creds,
      pinCrypto,
      undefined,
      new FakeDeviceClubs(),
    );

    await auth.loginWithPassword({ login: 'AKO', password: 'dobre-haslo-2026' });

    expect(await auth.revoked()).toBe(false);
    expect(creds.credentials?.revoked).toBeUndefined();
  });
});
