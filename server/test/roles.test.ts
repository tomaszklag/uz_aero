/**
 * Ninerdeck (serwer) - role członkostw, rola platformowa i brama uprawnień panelu
 * (decyzja 2026-07-31; wielofirmowość 2026-09-08, issue #98).
 *
 * Cztery rzeczy, które MUSZĄ trzymać, bo ich złamanie jest luką, a nie usterką:
 *  1. brak roli nigdy nie awansuje - nieznana wartość schodzi do `pilot`;
 *  2. rola jedzie z CZŁONKOSTWA, nie z tokenu - odebranie uprawnień działa przy
 *     odświeżeniu ORAZ przy każdym żądaniu panelu (zmiana 2026-08-01, przekrój A06);
 *  3. baza nie przyjmuje roli spoza słownika (CHECK na `memberships.role`
 *     i `pilots.platform_role`);
 *  4. token bez KLUBU nie jest tożsamością, a token platformowy nie otwiera tras klubu
 *     (i odwrotnie) - trzy rodzaje tokenów są rozłączne.
 */

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { credentialsRevoked } from '../src/domain/credentials.ts';
import { authorizeOrg, authorizePlatform } from '../src/http/authorize.ts';
import { PgPilotsRepo } from '../src/infrastructure/pg/common/pilotsRepo.ts';
import { PgLoginSessions } from '../src/infrastructure/pg/common/loginSessionsRepo.ts';
import { can, platformCan, platformCapabilitiesOf } from '../src/domain/roles.ts';
import { TEST_SECRET, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_B } from './testWorld.ts';

/** Komplet zdolności KLUBU - każdy nowy wpis katalogu ma tu trafić. */
const CLUB_CAPABILITIES = [
  'panel.access',
  'flags.resolve',
  'events.correct',
  'accounts.manage',
  'fleet.manage',
  'thresholds.manage',
  'audit.read',
  'maintenance.run',
] as const;

/**
 * Zdolności PLATFORMOWE - superadministratora bez klubu. `bugs.triage` stoi tu,
 * a nie wśród klubowych, od epiku C wielofirmowości (issue #99, C6): zgłoszenia
 * błędów opisują aplikację, nie dziennik klubu, i obsługuje je platforma.
 */
const PLATFORM_CAPABILITIES = ['platform.manage', 'bugs.triage'] as const;

/**
 * Tokeny tego pliku NIE NIOSĄ SESJI - pusty identyfikator znaczy „claim `sid` nie
 * powstaje", czyli token w kształcie sprzed 2.1.0 (patrz `sidClaim` w `hs256Tokens.ts`).
 *
 * To jest świadome i to jest jedyny sensowny wybór: ten plik bada ROLE i ZDOLNOŚCI, więc
 * sesja byłaby tu tłem, a identyfikator wymyślony odbijałby każdy przypadek - brama
 * odmawia tokenowi wskazującemu sesję, której nie ma, i tak ma być. Zachowanie bramy
 * wobec sesji żywej i unieważnionej sprawdza `loginSessions.test.ts`; tutaj przy okazji
 * przechodzi druga strona tamtej reguły: poświadczenie sprzed wdrożenia dalej działa.
 */
const NO_SESSION = '';

// Tożsamość z tokenu NIE NIESIE ZAKRESU (epik #197) - zdolności czyta brama z bazy,
// więc oba pomocniki różnią się dziś wyłącznie nazwą i to jest sedno tej zmiany.
const asAdmin = (pilotId: string, orgId = ORG_A) =>
  ({ pilotId, orgId, code: pilotId, sessionId: NO_SESSION }) as const;
const asPilot = (pilotId: string, orgId = ORG_A) =>
  ({ pilotId, orgId, code: pilotId, sessionId: NO_SESSION }) as const;

describe('mapa uprawnień', () => {
  it('pilot nie ma w panelu NICZEGO - z wejściem i platformą włącznie', () => {
    // Lista wypisana w całości, a nie trzy przykłady: po wycofaniu roli pośredniej
    // (2026-08-30) to JEDYNY przypadek mówiący „tej zdolności się nie dostaje",
    // więc musi widzieć każdą nową pozycję katalogu - tak samo jak przypadek niżej.
    for (const capability of [...CLUB_CAPABILITIES, ...PLATFORM_CAPABILITIES]) {
      expect(can([], capability)).toBe(false);
    }
  });

  // Przypadek roli pośredniej („rozstrzyga flagi, ale nie pisze w rejestrze ani
  // w kontach") wypadł razem z rolą `training_lead` 2026-08-30 - dziś każdy, kto
  // wchodzi do panelu klubu, ma komplet zdolności KLUBU i mówi o tym ten przypadek.
  it('administrator klubu ma komplet zdolności klubu - i NIE MA zdolności platformowej', () => {
    for (const capability of CLUB_CAPABILITIES) {
      expect(can(CLUB_CAPABILITIES, capability)).toBe(true);
    }
    // Rozłączność dwóch osi władzy (wielofirmowość §3.3): administrator klubu nie
    // zakłada klubów. Dopisanie `platform.manage` do listy `admin` byłoby wyjątkiem
    // wpisanym w rolę, niewidocznym dla klubu, którego dotyczy.
    for (const capability of PLATFORM_CAPABILITIES) {
      expect(can(CLUB_CAPABILITIES, capability)).toBe(false);
    }
  });

  it('superadministrator ma WYŁĄCZNIE zdolności platformy - do dziennika klubu nie wchodzi', () => {
    for (const capability of PLATFORM_CAPABILITIES) {
      expect(platformCan('superadmin', capability)).toBe(true);
    }
    for (const capability of CLUB_CAPABILITIES) {
      expect(platformCan('superadmin', capability)).toBe(false);
    }
    expect([...platformCapabilitiesOf('superadmin')]).toEqual([...PLATFORM_CAPABILITIES]);
    // Zwykła osoba (`platform_role IS NULL`) nie może na platformie niczego.
    for (const capability of PLATFORM_CAPABILITIES) {
      expect(platformCan(null, capability)).toBe(false);
    }
  });
});

describe('unieważnienie poświadczeń (`credentials_valid_from`)', () => {
  // Zaokrąglenie jest tu istotne, a nie kosmetyczne: `iat` ma rozdzielczość SEKUNDY
  // (RFC 7519), a znacznik - milisekundy. Reguła musi więc jawnie wybrać, w którą
  // stronę myli się na granicy, i wybiera stronę odebrania dostępu.
  const at = (iso: string): Date => new Date(iso);
  const seconds = (iso: string): number => Math.floor(new Date(iso).getTime() / 1000);

  it('konto bez znacznika przepuszcza wszystko - także token bez `iat`', () => {
    expect(credentialsRevoked(null, seconds('2026-08-01T10:00:00.000Z'))).toBe(false);
    expect(credentialsRevoked(null, 0)).toBe(false);
  });

  it('token wydany PRZED unieważnieniem ginie, wydany PO - żyje', () => {
    const marker = at('2026-08-01T10:00:00.000Z');
    expect(credentialsRevoked(marker, seconds('2026-08-01T09:59:59.000Z'))).toBe(true);
    expect(credentialsRevoked(marker, seconds('2026-08-01T10:00:01.000Z'))).toBe(false);
  });

  it('token z TEJ SAMEJ sekundy co unieważnienie przegrywa, gdy znacznik ma ułamek', () => {
    // `iat` zaokrągla w dół, więc token wydany o 10:00:00.900 niesie 10:00:00. Wobec
    // znacznika 10:00:00.400 wypada „wcześniej" i zostaje odrzucony, choć powstał
    // później. Koszt to jedno powtórzone logowanie w oknie krótszym niż sekunda;
    // odwrotna pomyłka zostawiłaby żywe poświadczenie po jego unieważnieniu.
    expect(
      credentialsRevoked(at('2026-08-01T10:00:00.400Z'), seconds('2026-08-01T10:00:00.900Z')),
    ).toBe(true);
  });

  it('token bez `iat` (czyli `0`) przegrywa z każdym znacznikiem', () => {
    expect(credentialsRevoked(at('2020-01-01T00:00:00.000Z'), 0)).toBe(true);
  });
});

describe('brama uprawnień tras panelu klubu', () => {
  it('bez tokenu → 401, nie 403 - to dwie różne wiadomości', async () => {
    const { db, tokens } = await testHarness();
    const outcome = await authorizeOrg(tokens, new PgPilotsRepo(db), null, 'panel.access');
    expect(outcome).toEqual({ ok: false, status: 401, body: { error: 'unauthorized' } });
  });

  it('ważny token pilota → 403 z podaną wymaganą zdolnością', async () => {
    // Odmowa ma NIEŚĆ POWÓD: panel pokazuje, czego brakuje, zamiast gasnąć bez słowa.
    const { db, tokens } = await testHarness();
    const token = tokens.sign(asPilot('PWI'), 3600);

    const outcome = await authorizeOrg(tokens, new PgPilotsRepo(db), token, 'flags.resolve');
    expect(outcome).toEqual({
      ok: false,
      status: 403,
      body: { error: 'forbidden', required: 'flags.resolve' },
    });
  });

  it('brama odpowiada PER ZDOLNOŚĆ - przepuszcza na flagach, odbija na kontach', async () => {
    // Do 2026-08-30 obie odpowiedzi padały na JEDEN token (rola pośrednia miała
    // `flags.resolve`, nie miała `accounts.manage`). Po jej wycofaniu ta sama para
    // wymaga dwóch podmiotów - katalog zdolności i brama zostają nietknięte.
    const { db, tokens } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const admin = tokens.sign(asAdmin('AKO'), 3600);
    const pilot = tokens.sign(asPilot('PWI'), 3600);

    expect((await authorizeOrg(tokens, accounts, admin, 'flags.resolve')).ok).toBe(true);
    expect(await authorizeOrg(tokens, accounts, pilot, 'accounts.manage')).toMatchObject({
      status: 403,
      body: { required: 'accounts.manage' },
    });
  });

  it('osoba ZABLOKOWANA PLATFORMOWO po wydaniu tokenu → 401, nie 403', async () => {
    // To jest ta własność, dla której brama czyta członkostwo przy każdym żądaniu.
    // 401, a nie 403, bo to nie jest „twoja rola tego nie obejmuje", tylko „za tym
    // poświadczeniem nikt już nie stoi".
    const { db, tokens } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const token = tokens.sign(asAdmin('AKO'), 3600);

    expect((await authorizeOrg(tokens, accounts, token, 'accounts.manage')).ok).toBe(true);

    await db.query("UPDATE pilots SET active = FALSE WHERE id = 'AKO'");

    expect(await authorizeOrg(tokens, accounts, token, 'accounts.manage')).toEqual({
      ok: false,
      status: 401,
      body: { error: 'unauthorized' },
    });
  });

  it('CZŁONKOSTWO wyłączone po wydaniu tokenu → 401 (dawne „Deaktywuj" z A06)', async () => {
    // Bez tego „Deaktywuj" na ekranie A06 kłamie: sesja panelu żyje 8 h, więc odcięty
    // człowiek pracowałby dalej do końca dnia. Od wielofirmowości wyłącza się
    // CZŁONKOSTWO - osoba w drugim klubie lata dalej (przypadek niżej).
    const { db, tokens } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const token = tokens.sign(asAdmin('AKO'), 3600);

    await db.query(
      "UPDATE memberships SET status = 'disabled' WHERE pilot_id = 'AKO' AND org_id = 'org-a'",
    );

    expect(await authorizeOrg(tokens, accounts, token, 'panel.access')).toEqual({
      ok: false,
      status: 401,
      body: { error: 'unauthorized' },
    });
  });

  it('token KLUBU, W KTÓRYM OSOBA NIE MA CZŁONKOSTWA → 401 (wielofirmowość §4)', async () => {
    // AKO jest administratorem klubu A i nikim w klubie B. Podpisany przez nas token
    // z `org: org-b` to poprawna koperta - a brama i tak odmawia, bo bramką jest BRAK
    // CZŁONKOSTWA, nie brak podpisu.
    const { db, tokens } = await testHarness();
    const token = tokens.sign(asAdmin('AKO', ORG_B), 3600);

    expect(await authorizeOrg(tokens, new PgPilotsRepo(db), token, 'panel.access')).toEqual({
      ok: false,
      status: 401,
      body: { error: 'unauthorized' },
    });
  });

  it('KLUB WYŁĄCZONY przez superadministratora → 401 dla wszystkich jego członków', async () => {
    const { db, tokens } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const token = tokens.sign(asAdmin('AKO'), 3600);
    expect((await authorizeOrg(tokens, accounts, token, 'panel.access')).ok).toBe(true);

    await db.query("UPDATE organizations SET active = FALSE WHERE id = 'org-a'");

    expect((await authorizeOrg(tokens, accounts, token, 'panel.access')).ok).toBe(false);
  });

  it('brama czyta PROJEKCJĘ członkostwa - dokładnie te pola, ani jednego więcej', async () => {
    // `MembershipAuthSnapshot` powstał po to, żeby do warstwy HTTP nie wjeżdżało nic
    // ponad to, czego brama i `Actor` potrzebują - lista pól jest kontraktem.
    const { db, tokens } = await testHarness();
    const token = tokens.sign(asAdmin('AKO'), 3600);

    const outcome = await authorizeOrg(tokens, new PgPilotsRepo(db), token, 'accounts.manage');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(Object.keys(outcome.account).sort()).toEqual([
      'active',
      'capabilities',
      'code',
      'credentialsValidFrom',
      'membershipCredentialsValidFrom',
      'name',
      'orgId',
      'pilotId',
      // 2.1.0: brama sprawdza też SESJĘ z claimu `sid` - tym samym zapytaniem, co
      // członkostwo, więc oba pola jadą tą samą projekcją. `sessionId` wraca echem
      // argumentu: z niego bierze się stempel aktywności i `Actor.sessionId`.
      'sessionId',
      'sessionRevoked',
    ]);
    expect(outcome.account.orgId).toBe(ORG_A);
  });

  it('POŚWIADCZENIE STARSZE NIŻ UNIEWAŻNIENIE OSOBY → 401, choć konto jest aktywne', async () => {
    // Trzeci warunek bramy i jedyny, który dosięga sesji PANELU. Konto istnieje, jest
    // aktywne i ma rolę - a mimo to token nie przechodzi, bo został wydany przed
    // unieważnieniem. Bez tego wykradzione ciasteczko panelu przeżywa odcięcie o osiem
    // godzin, czyli o cały TTL sesji.
    const { db, tokens, clock } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const token = tokens.sign(asAdmin('AKO'), 3600);

    expect((await authorizeOrg(tokens, accounts, token, 'accounts.manage')).ok).toBe(true);

    clock.advance(1000);
    await db.query("UPDATE pilots SET credentials_valid_from = $1 WHERE id = 'AKO'", [
      clock.now().toISOString(),
    ]);

    expect(await authorizeOrg(tokens, accounts, token, 'accounts.manage')).toEqual({
      ok: false,
      status: 401,
      body: { error: 'unauthorized' },
    });

    // …a token wydany PO unieważnieniu przechodzi. Znacznik odcina przeszłość,
    // nie konto - inaczej unieważnienie zamykałoby drogę powrotną, którą otwiera.
    const fresh = tokens.sign(asAdmin('AKO'), 3600);
    expect((await authorizeOrg(tokens, accounts, fresh, 'accounts.manage')).ok).toBe(true);
  });

  it('POŚWIADCZENIE STARSZE NIŻ UNIEWAŻNIENIE CZŁONKOSTWA → 401 - druga z dwóch dat (§3.4)', async () => {
    // Wyłączenie w klubie A i ponowne włączenie zostawia na członkostwie znacznik;
    // token sprzed wyłączenia ma być w A martwy, choć osoba i klub są w porządku.
    const { db, tokens, clock } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const token = tokens.sign(asAdmin('AKO'), 3600);

    clock.advance(1000);
    await db.query(
      "UPDATE memberships SET credentials_valid_from = $1 WHERE pilot_id = 'AKO' AND org_id = 'org-a'",
      [clock.now().toISOString()],
    );

    expect((await authorizeOrg(tokens, accounts, token, 'accounts.manage')).ok).toBe(false);
    expect(
      (await authorizeOrg(tokens, accounts, tokens.sign(asAdmin('AKO'), 3600), 'accounts.manage'))
        .ok,
    ).toBe(true);
  });

  it('odebranie zdolności działa NATYCHMIAST, bez czekania na wygaśnięcie tokenu', async () => {
    const { db, tokens } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const token = tokens.sign(asAdmin('AKO'), 3600);

    await db.query(
      "DELETE FROM membership_capabilities WHERE pilot_id = 'AKO' AND org_id = 'org-a'",
    );

    // Token jest NIETKNIĘTY i nadal ważny - i to jest sedno: zakres czyta brama z bazy,
    // a nie z ładunku, więc odebranie zdolności nie czeka na wygaśnięcie poświadczenia.
    expect(tokens.verify(token)?.pilotId).toBe('AKO');
    expect(await authorizeOrg(tokens, accounts, token, 'accounts.manage')).toMatchObject({
      status: 403,
      body: { required: 'accounts.manage' },
    });
  });
});

/** Token podpisany NASZYM sekretem, ale o claimach, jakich `sign()` już nie produkuje. */
function handRolled(clock: { now(): Date }, claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(clock.now().getTime() / 1000) + 3600, ...claims }),
  ).toString('base64url');
  const body = `${header}.${payload}`;
  return `${body}.${createHmac('sha256', TEST_SECRET).update(body).digest('base64url')}`;
}

describe('tokeny sprzed wielofirmowości i tokeny bez `iat`', () => {
  it('token BEZ KLUBU (wydany przed 2.0.0) jest NIEWAŻNY - także z poprawnym podpisem', async () => {
    // Decyzja z `docs/wielofirmowosc.md` §6/§11: klub jest w tokenie i trasy klubowe
    // nie mają jak pracować bez niego. Stary token telefon odświeża refreshem, który klub
    // zna (backfill wpisał klub domyślny w `refresh_tokens.org_id`). Domyślanie się klubu
    // byłoby zgadywaniem, do czyich danych ten token ma prawo.
    const { db, tokens, clock } = await testHarness();
    const legacy = handRolled(clock, { sub: 'AKO', code: 'AKO' });

    expect(tokens.verify(legacy)).toBeNull();
    expect(await authorizeOrg(tokens, new PgPilotsRepo(db), legacy, 'panel.access')).toEqual({
      ok: false,
      status: 401,
      body: { error: 'unauthorized' },
    });
  });

  it('token BEZ roli przechodzi bez zająknięcia - claim przestał cokolwiek znaczyć', async () => {
    // Token sprzed 3.1.0 niesie jeszcze claim , a token sprzed wielofirmowości nie
    // niesie go wcale - i jedno, i drugie jest dziś bez znaczenia: brama czyta zakres
    // z bazy. AKO ma w klubie , więc token wchodzi.
    const { db, tokens, clock } = await testHarness();
    const token = handRolled(clock, { sub: 'AKO', org: ORG_A, code: 'AKO' });

    expect(tokens.verify(token)).toEqual({
      pilotId: 'AKO',
      orgId: ORG_A,
      code: 'AKO',
      // …a brak `iat` czyta się jako `0`, czyli „wydany przed czasem" - wartość, która
      // przegrywa z każdym znacznikiem unieważnienia (przypadek niżej).
      issuedAt: 0,
      // Brak `sid` = token sprzed 2.1.0. `null`, a nie pusty napis, bo brama musi
      // odróżnić „ten token nie zna sesji" od „wskazuje sesję, której nie ma": pierwsze
      // przechodzi do wygaśnięcia, drugie odbija (`loginSessions.test.ts`).
      sessionId: null,
    });
    expect((await authorizeOrg(tokens, new PgPilotsRepo(db), token, 'panel.access')).ok).toBe(
      true,
    );
  });

  it('token bez `iat` żyje do pierwszego unieważnienia poświadczeń, a potem ginie', async () => {
    // Wybór jest binarny: przepuszczać zawsze (unieważnienie nie sięgałoby najstarszego
    // poświadczenia) albo odrzucać zawsze (wdrożenie wylogowałoby wszystkich). Stąd
    // `iat = 0`: token przechodzi, dopóki konto nie ma znacznika, a od pierwszego
    // unieważnienia przegrywa z każdą datą.
    const { db, tokens, clock } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const token = handRolled(clock, { sub: 'AKO', org: ORG_A, code: 'AKO' });

    expect((await authorizeOrg(tokens, accounts, token, 'accounts.manage')).ok).toBe(true);

    await db.query("UPDATE pilots SET credentials_valid_from = $1 WHERE id = 'AKO'", [
      clock.now().toISOString(),
    ]);

    expect((await authorizeOrg(tokens, accounts, token, 'accounts.manage')).ok).toBe(false);
  });
});

describe('zakres pochodzi z członkostwa, nie z tokenu', () => {
  it('odebranie zdolności widać także po odświeżeniu pary tokenów', async () => {
    const { app, db, tokens } = await testHarness();

    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenFor('AKO') },
    });
    expect(tokens.verify(login.json().token)?.orgId).toBe(ORG_A);

    // Administrator traci uprawnienia w klubie…
    await db.query(
      "DELETE FROM membership_capabilities WHERE pilot_id = 'AKO' AND org_id = 'org-a'",
    );

    const refreshed = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: login.json().refreshToken },
    });

    // …i świeża para tokenów tego nie odwraca: zakres nie jedzie w ładunku, więc nie ma
    // jak się w nim zakonserwować. Klub zostaje ten sam.
    expect(refreshed.statusCode).toBe(200);
    expect(tokens.verify(refreshed.json().token)).toMatchObject({ orgId: ORG_A });

    const accounts = new PgPilotsRepo(db);
    expect(await authorizeOrg(tokens, accounts, refreshed.json().token, 'panel.access')).toMatchObject({
      status: 403,
    });
  });
});

describe('token PLATFORMOWY superadministratora', () => {
  it('jest ROZŁĄCZNY z tokenem klubu - w obie strony', async () => {
    // Ta sama własność bezpieczeństwa, co przy tokenie osoby: podpis HMAC
    // przepuszcza oba, odróżnia je wyłącznie `purpose`. Bez tego rozdziału poświadczenie
    // kogoś bez klubu otwierałoby trasy telefonu, a `POST /events` pisałby zdarzenia
    // do klubu, którego w tokenie nie ma.
    const { tokens } = await testHarness();
    const platform = tokens.signPlatform({ pilotId: 'admin', sessionId: NO_SESSION }, 3600);
    const club = tokens.sign(asAdmin('AKO'), 3600);

    expect(tokens.verify(platform)).toBeNull();
    expect(tokens.verifyPerson(platform)).toBeNull();
    expect(tokens.verifyPlatform(platform)).toMatchObject({ pilotId: 'admin' });

    expect(tokens.verifyPlatform(club)).toBeNull();
  });

  it('brama platformowa pyta OSOBĘ o rolę - nie token, nie członkostwo', async () => {
    const { db, clock, tokens } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const sessions = new PgLoginSessions(db, clock);
    const token = tokens.signPlatform({ pilotId: 'AKO', sessionId: NO_SESSION }, 3600);

    // AKO jest administratorem KLUBU, a nie superadministratorem: token platformowy
    // z jego identyfikatorem jest poprawną kopertą, ale rola z osoby go nie przepuszcza.
    expect(await authorizePlatform(tokens, accounts, sessions, token, 'platform.manage')).toEqual({
      ok: false,
      status: 403,
      body: { error: 'forbidden', required: 'platform.manage' },
    });

    await db.query("UPDATE pilots SET platform_role = 'superadmin' WHERE id = 'AKO'");
    expect((await authorizePlatform(tokens, accounts, sessions, token, 'platform.manage')).ok).toBe(true);

    // Osoba zablokowana platformowo - 401, jak wszędzie: nikt za tym poświadczeniem nie stoi.
    await db.query("UPDATE pilots SET active = FALSE WHERE id = 'AKO'");
    expect((await authorizePlatform(tokens, accounts, sessions, token, 'platform.manage')).ok).toBe(false);
  });

  it('token klubu NIE otwiera bramy platformowej, a platformowy - bramy klubu', async () => {
    const { db, clock, tokens } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const sessions = new PgLoginSessions(db, clock);
    await db.query("UPDATE pilots SET platform_role = 'superadmin' WHERE id = 'AKO'");

    const club = tokens.sign(asAdmin('AKO'), 3600);
    const platform = tokens.signPlatform({ pilotId: 'AKO', sessionId: NO_SESSION }, 3600);

    expect(
      (await authorizePlatform(tokens, accounts, sessions, club, 'platform.manage')).ok,
    ).toBe(false);
    expect((await authorizeOrg(tokens, accounts, platform, 'panel.access')).ok).toBe(false);
  });
});

describe('CHECK na słownikach ról', () => {
  // Przypadek „`memberships.role` nie przyjmuje roli spoza słownika" wypadł razem
  // z kolumną (epik #197). Jego rolę przejął przypadek niżej, o katalogu zdolności:
  // w `membership_capabilities` CHECK-a NIE MA świadomie (katalog żyje w TypeScripcie
  // i rośnie), więc pilnuje tego kod, a nie baza.

  it('`pilots.platform_role` przyjmuje wyłącznie `superadmin` albo NULL', async () => {
    const { db } = await testHarness();
    await expect(
      db.query("UPDATE pilots SET platform_role = 'admin' WHERE id = 'AKO'"),
    ).rejects.toThrow();
    await expect(
      db.query("UPDATE pilots SET platform_role = 'superadmin' WHERE id = 'AKO'"),
    ).resolves.toBeDefined();
  });

  // ══ BEZPIECZNIK JEST W MODELU, NIE W BAZIE (epik #197) ══
  // Zdolność spoza katalogu wchodzi do tabeli bez przeszkód - `CHECK`-a tam nie ma,
  // bo katalog żyje w TypeScripcie i rośnie z produktem. Nie otwiera przez to NICZEGO:
  // `can` pyta o obecność KONKRETNEJ pozycji, więc literówka nie pasuje do żadnego
  // pytania. Ten przypadek pilnuje dokładnie tego - że śmieć w bazie jest bezsilny,
  // a nie że go nie ma.
  it('zdolność spoza katalogu nie otwiera ŻADNEJ trasy', async () => {
    const { db, tokens } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    await db.query(
      `INSERT INTO membership_capabilities (org_id, pilot_id, capability)
       VALUES ('org-a', 'PWI', 'panel.acces')`,
    );

    const token = tokens.sign(asPilot('PWI'), 3600);
    expect(await authorizeOrg(tokens, accounts, token, 'panel.access')).toMatchObject({
      status: 403,
    });
  });

  it('członkostwo AKTYWNE bez kodu jest niemożliwe (`membership_active_has_code`)', async () => {
    // Kodem pilot podpisuje operacje (sygnatura, karta arkusza) - członkostwo bez kodu
    // nie ma prawa być aktywne, a `pending` bez kodu jest stanem zwykłym.
    const { db } = await testHarness();
    await db.query(
      `INSERT INTO pilots (id, name, email, active) VALUES ('NEW', 'Nowe Konto', 'nowe@ninerdeck.pl', TRUE)`,
    );
    await expect(
      db.query(
        `INSERT INTO memberships (org_id, pilot_id, status, joined_via)
         VALUES ('org-a', 'NEW', 'active', 'code')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `INSERT INTO memberships (org_id, pilot_id, status, joined_via)
         VALUES ('org-a', 'NEW', 'pending', 'code')`,
      ),
    ).resolves.toBeDefined();
  });
});
