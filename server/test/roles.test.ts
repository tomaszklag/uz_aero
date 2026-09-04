/**
 * UZ Aero (serwer) - role kont i brama uprawnień panelu (decyzja 2026-07-31).
 *
 * Trzy rzeczy, które MUSZĄ trzymać, bo ich złamanie jest luką, a nie usterką:
 *  1. brak roli nigdy nie awansuje - nieznana wartość schodzi do `pilot`;
 *  2. rola jedzie z KONTA, nie z tokenu - odebranie uprawnień działa przy odświeżeniu
 *     ORAZ przy każdym żądaniu panelu (zmiana 2026-08-01, przekrój A06);
 *  3. baza nie przyjmuje roli spoza słownika (CHECK na `pilots.role`).
 */

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { authorizeAccount, credentialsRevoked } from '../src/http/authorize.ts';
import { PgPilotsRepo } from '../src/infrastructure/pg/common/pilotsRepo.ts';
import { can } from '../src/domain/roles.ts';
import { TEST_PASSWORD, TEST_SECRET, testHarness } from './helpers.ts';

describe('mapa uprawnień', () => {
  it('pilot nie ma w panelu NICZEGO - z wejściem włącznie', () => {
    // Lista wypisana w całości, a nie trzy przykłady: po wycofaniu roli pośredniej
    // (2026-08-30) to JEDYNY przypadek mówiący „tej zdolności się nie dostaje",
    // więc musi widzieć każdą nową pozycję katalogu - tak samo jak przypadek niżej.
    for (const capability of [
      'panel.access',
      'flags.resolve',
      'events.correct',
      'accounts.manage',
      'fleet.manage',
      'thresholds.manage',
      'audit.read',
      'maintenance.run',
      'bugs.triage',
    ] as const) {
      expect(can('pilot', capability)).toBe(false);
    }
  });

  // Przypadek roli pośredniej („rozstrzyga flagi, ale nie pisze w rejestrze ani
  // w kontach") wypadł razem z rolą `training_lead` 2026-08-30 - dziś każdy, kto
  // wchodzi do panelu, ma komplet i mówi o tym ten przypadek.
  it('administrator ma komplet', () => {
    for (const capability of [
      'panel.access',
      'flags.resolve',
      'events.correct',
      'accounts.manage',
      'fleet.manage',
      'thresholds.manage',
      'audit.read',
      'maintenance.run',
      'bugs.triage',
    ] as const) {
      expect(can('admin', capability)).toBe(true);
    }
  });
});

describe('unieważnienie poświadczeń (`pilots.credentials_valid_from`)', () => {
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

describe('brama uprawnień tras panelu', () => {
  it('bez tokenu → 401, nie 403 - to dwie różne wiadomości', async () => {
    const { db, tokens } = await testHarness();
    const outcome = await authorizeAccount(tokens, new PgPilotsRepo(db), null, 'panel.access');
    expect(outcome).toEqual({ ok: false, status: 401, body: { error: 'unauthorized' } });
  });

  it('ważny token pilota → 403 z podaną wymaganą zdolnością', async () => {
    // Odmowa ma NIEŚĆ POWÓD: panel pokazuje, czego brakuje, zamiast gasnąć bez słowa.
    const { db, tokens } = await testHarness();
    const token = tokens.sign({ pilotId: 'PWI', code: 'PWI', role: 'pilot' }, 3600);

    const outcome = await authorizeAccount(
      tokens,
      new PgPilotsRepo(db),
      token,
      'flags.resolve',
    );
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
    const admin = tokens.sign({ pilotId: 'TMK', code: 'TMK', role: 'admin' }, 3600);
    const pilot = tokens.sign({ pilotId: 'PWI', code: 'PWI', role: 'pilot' }, 3600);

    expect((await authorizeAccount(tokens, accounts, admin, 'flags.resolve')).ok).toBe(true);
    expect(await authorizeAccount(tokens, accounts, pilot, 'accounts.manage')).toMatchObject({
      status: 403,
      body: { required: 'accounts.manage' },
    });
  });

  it('konto DEAKTYWOWANE po wydaniu tokenu → 401, nie 403', async () => {
    // To jest ta własność, dla której brama czyta konto przy każdym żądaniu. Bez niej
    // „Deaktywuj" na ekranie A06 kłamie: sesja panelu żyje 8 h, więc odcięty człowiek
    // pracowałby dalej do końca dnia. 401, a nie 403, bo to nie jest „twoja rola tego
    // nie obejmuje", tylko „za tym poświadczeniem nikt już nie stoi".
    const { db, tokens } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const token = tokens.sign({ pilotId: 'TMK', code: 'TMK', role: 'admin' }, 3600);

    expect((await authorizeAccount(tokens, accounts, token, 'accounts.manage')).ok).toBe(true);

    await db.query("UPDATE pilots SET active = FALSE WHERE id = 'TMK'");

    expect(await authorizeAccount(tokens, accounts, token, 'accounts.manage')).toEqual({
      ok: false,
      status: 401,
      body: { error: 'unauthorized' },
    });
  });

  it('brama czyta PROJEKCJĘ konta - hash hasła nie wjeżdża do warstwy HTTP', async () => {
    // `AdminPilotAccount` powstał po to, żeby hash nie jechał tam, gdzie nie musi,
    // a brama tę zasadę omijała: `findById` robi `SELECT *`, więc `password_hash`
    // wjeżdżał do `AuthOutcome` przy KAŻDYM żądaniu panelu i dalej, do `actorFrom`.
    const { db, tokens } = await testHarness();
    const token = tokens.sign({ pilotId: 'TMK', code: 'TMK', role: 'admin' }, 3600);

    const outcome = await authorizeAccount(
      tokens,
      new PgPilotsRepo(db),
      token,
      'accounts.manage',
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(Object.keys(outcome.account).sort()).toEqual([
      'active',
      'code',
      'credentialsValidFrom',
      'id',
      'name',
      'role',
    ]);
    expect(JSON.stringify(outcome.account)).not.toContain('scrypt$');
  });

  it('POŚWIADCZENIE STARSZE NIŻ JEGO UNIEWAŻNIENIE → 401, choć konto jest aktywne', async () => {
    // Trzeci warunek bramy i jedyny, który dosięga sesji PANELU. Konto istnieje, jest
    // aktywne i ma rolę - a mimo to token nie przechodzi, bo został wydany przed
    // resetem hasła. Bez tego wykradzione ciasteczko panelu przeżywa reset o osiem
    // godzin, czyli o cały TTL sesji.
    const { db, tokens, clock } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const token = tokens.sign({ pilotId: 'TMK', code: 'TMK', role: 'admin' }, 3600);

    expect((await authorizeAccount(tokens, accounts, token, 'accounts.manage')).ok).toBe(true);

    clock.advance(1000);
    await db.query(
      "UPDATE pilots SET credentials_valid_from = $1 WHERE id = 'TMK'",
      [clock.now().toISOString()],
    );

    expect(await authorizeAccount(tokens, accounts, token, 'accounts.manage')).toEqual({
      ok: false,
      status: 401,
      body: { error: 'unauthorized' },
    });

    // …a token wydany PO unieważnieniu przechodzi. Znacznik odcina przeszłość,
    // nie konto - inaczej reset hasła zamykałby drogę powrotną, którą otwiera.
    const fresh = tokens.sign({ pilotId: 'TMK', code: 'TMK', role: 'admin' }, 3600);
    expect((await authorizeAccount(tokens, accounts, fresh, 'accounts.manage')).ok).toBe(true);
  });

  it('odebranie roli działa NATYCHMIAST, bez czekania na wygaśnięcie tokenu', async () => {
    const { db, tokens } = await testHarness();
    const accounts = new PgPilotsRepo(db);
    const token = tokens.sign({ pilotId: 'TMK', code: 'TMK', role: 'admin' }, 3600);

    await db.query("UPDATE pilots SET role = 'pilot' WHERE id = 'TMK'");

    // Token nadal NIESIE `admin` - i to jest sedno: brama go nie pyta o rolę.
    expect(tokens.verify(token)?.role).toBe('admin');
    expect(await authorizeAccount(tokens, accounts, token, 'accounts.manage')).toMatchObject({
      status: 403,
      body: { required: 'accounts.manage' },
    });
  });
});

describe('zgodność wstecz tokenów', () => {
  it('token wydany PRZED wprowadzeniem ról (bez claimu roli) czyta się jako pilot', async () => {
    // Odrzucenie takiego tokenu wylogowałoby telefony w terenie bez powodu, a cichy
    // awans byłby luką - jedyne bezpieczne wyjście to najmniejsza rola.
    //
    // UWAGA na to, czego ten przypadek NIE mówi od 2026-08-01: brama panelu nie pyta
    // tokenu o rolę, więc taki token OTWIERA panel, jeśli konto pod nim jest w bazie
    // administratorem (przypadek niżej). Rola w claimie jest odtąd wyłącznie kopią
    // dla tras telefonu, a nie podstawą decyzji panelu.
    const { tokens, clock } = await testHarness();

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'TMK',
        code: 'TMK',
        exp: Math.floor(clock.now().getTime() / 1000) + 3600,
      }),
    ).toString('base64url');
    const body = `${header}.${payload}`;
    const signature = createHmac('sha256', TEST_SECRET).update(body).digest('base64url');
    const legacyToken = `${body}.${signature}`;

    // Token jest ważny (podpis się zgadza), a rola odczytana z claimów to `pilot`…
    expect(tokens.verify(legacyToken)).toEqual({
      pilotId: 'TMK',
      code: 'TMK',
      role: 'pilot',
      // …a brak `iat` czyta się jako `0`, czyli „wydany przed czasem". Wartość domyślna
      // idzie w stronę ODEBRANIA dostępu: taki token przegrywa z każdym znacznikiem
      // unieważnienia poświadczeń. Osobny przypadek niżej pokazuje obie strony tej
      // decyzji - token bez `iat` żyje, dopóki nikt niczego nie unieważnił.
      issuedAt: 0,
    });
  });

  it('token bez `iat` żyje do pierwszego unieważnienia poświadczeń, a potem ginie', async () => {
    // Druga połowa zgodności wstecz i decyzja, którą trzeba nazwać wprost. Tokeny
    // wydane przed 2026-08-01 nie niosą `iat`, więc znacznik `credentials_valid_from`
    // nie ma ich z czym porównać. Wybór jest binarny i nie ma trzeciej opcji:
    //
    //  • przepuszczać zawsze → reset hasła NIE odbierałby dostępu poświadczeniu, które
    //    jest najstarsze ze wszystkich, czyli dokładnie temu, o które chodzi;
    //  • odrzucać zawsze → wdrożenie wylogowałoby wszystkich naraz, bez powodu.
    //
    // Stąd `iat = 0`: token bez znacznika czasu przechodzi normalnie, dopóki konto nie
    // ma znacznika unieważnienia (`NULL`), a od pierwszego unieważnienia przegrywa
    // z każdą datą. Koszt: jedno ponowne logowanie kont, których poświadczeń i tak
    // ktoś właśnie dotknął.
    const { db, tokens, clock } = await testHarness();
    const accounts = new PgPilotsRepo(db);

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'TMK',
        code: 'TMK',
        role: 'admin',
        exp: Math.floor(clock.now().getTime() / 1000) + 3600,
      }),
    ).toString('base64url');
    const body = `${header}.${payload}`;
    const legacyToken = `${body}.${createHmac('sha256', TEST_SECRET).update(body).digest('base64url')}`;

    // Nikt niczego nie unieważnił → token sprzed zmiany działa jak działał.
    expect((await authorizeAccount(tokens, accounts, legacyToken, 'accounts.manage')).ok).toBe(
      true,
    );

    await db.query(
      "UPDATE pilots SET credentials_valid_from = $1 WHERE id = 'TMK'",
      [clock.now().toISOString()],
    );

    expect(await authorizeAccount(tokens, accounts, legacyToken, 'accounts.manage')).toEqual({
      ok: false,
      status: 401,
      body: { error: 'unauthorized' },
    });
  });

  it('stary token OTWIERA panel, bo o rolę pyta się KONTA, nie claimu', async () => {
    // Odwrotność poprzedniego przypadku i skutek uboczny decyzji „rola z konta":
    // token bez roli należy do konta, które JEST administratorem, więc panel go
    // wpuszcza. To jest właściwe zachowanie - poświadczenie mówi KIM jesteś,
    // a uprawnienia są własnością konta, nie kopii sprzed godzin.
    const { db, tokens, clock } = await testHarness();

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'TMK',
        code: 'TMK',
        exp: Math.floor(clock.now().getTime() / 1000) + 3600,
      }),
    ).toString('base64url');
    const body = `${header}.${payload}`;
    const signature = createHmac('sha256', TEST_SECRET).update(body).digest('base64url');

    const outcome = await authorizeAccount(
      tokens,
      new PgPilotsRepo(db),
      `${body}.${signature}`,
      'panel.access',
    );
    expect(outcome.ok).toBe(true);
  });
});

describe('rola pochodzi z konta, nie z tokenu', () => {
  it('odebranie roli działa przy najbliższym odświeżeniu', async () => {
    const { app, db, tokens } = await testHarness();

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });
    expect(tokens.verify(login.json().token)?.role).toBe('admin');

    // Administrator traci uprawnienia w bazie…
    await db.query("UPDATE pilots SET role = 'pilot' WHERE id = 'TMK'");

    const refreshed = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: login.json().refreshToken },
    });

    // …a świeży token już go nie niesie. Gdyby rola szła ze starego tokenu, dostęp
    // wisiałby do wygaśnięcia refresha, czyli do 90 dni.
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().pilot.role).toBe('pilot');
    expect(tokens.verify(refreshed.json().token)?.role).toBe('pilot');
  });
});

describe('CHECK na `pilots.role`', () => {
  it('baza nie przyjmuje roli spoza słownika', async () => {
    const { db } = await testHarness();
    await expect(
      db.query("UPDATE pilots SET role = 'superadmin' WHERE id = 'TMK'"),
    ).rejects.toThrow();
  });

  it('konto założone bez podanej roli dostaje `pilot`', async () => {
    const { db } = await testHarness();
    await db.query(
      `INSERT INTO pilots (id, code, name, email, password_hash, active)
       VALUES ('NEW', 'NEW', 'Nowe Konto', 'nowe@uzaero.pl', 'x', TRUE)`,
    );
    const { rows } = await db.query<{ role: string }>(
      "SELECT role FROM pilots WHERE id = 'NEW'",
    );
    expect(rows[0]?.role).toBe('pilot');
  });
});
