/**
 * UZ Aero (serwer) - konta pilotów w panelu (`/admin/api/pilots*`, `A06` i `A06a`).
 *
 * Przekrój, który powstał z awarii: 2026-08-01 administrator nie mógł się zalogować,
 * bo w produkcie nie było ŻADNEJ ścieżki zmiany hasła. Ten plik pilnuje, żeby ścieżka
 * istniała - i żeby przy okazji nie dało się nią odciąć całego klubu.
 *
 * Cztery własności, których złamanie jest luką, a nie usterką:
 *  1. **hasło nie występuje nigdzie poza jedną odpowiedzią** - ani w `admin_audit`,
 *     ani w bazie (tam jest hash), a mimo to DZIAŁA przy logowaniu;
 *  2. **deaktywacja i reset zrywają sesje** - a liczba zerwanych trafia do audytu;
 *  3. **administrator nie odcina sam siebie ani ostatniego administratora** - odmowa
 *     jest jawna i z powodem;
 *  4. **konto bez `accounts.manage` nie zmienia kont** - 403 z podaną zdolnością.
 *
 * Zero atrap: PGlite, prawdziwe klasy, `app.inject`, prawdziwy scrypt i prawdziwy
 * generator hasła.
 */

import { describe, expect, it } from 'vitest';

import { randomUUID } from 'node:crypto';

import { AdminPilotCommands } from '../src/application/admin/commands/pilots.ts';
import { uniqueConflictField } from '../src/application/admin/commands/pilots.ts';
import { AuditedWrite } from '../src/application/admin/auditedWrite.ts';
import type { PilotsAdminPort } from '../src/application/admin/ports.ts';
import type { Database, Queryable } from '../src/application/common/ports.ts';
import { PgAdminAuditRepo } from '../src/infrastructure/pg/admin/auditRepo.ts';
import { PgAdminPilotsRepo } from '../src/infrastructure/pg/admin/pilotsRepo.ts';
import { PgAdminRefreshTokensRepo } from '../src/infrastructure/pg/admin/refreshTokensRepo.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

async function login(app: Harness['app'], who: string) {
  return app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor(who) } });
}

async function tokenOf(app: Harness['app'], who: string): Promise<string> {
  return (await login(app, who)).json().token as string;
}

function admin(token: string) {
  return { authorization: `Bearer ${token}`, ...ADMIN_CSRF_HEADERS };
}

type Body = Record<string, unknown>;

const listPilots = (app: Harness['app'], token: string, query = '') =>
  app.inject({
    method: 'GET',
    url: `/admin/api/pilots${query}`,
    headers: { authorization: `Bearer ${token}` },
  });

const createPilot = (app: Harness['app'], token: string, body: Body) =>
  app.inject({ method: 'POST', url: '/admin/api/pilots', headers: admin(token), payload: body });

const patchPilot = (app: Harness['app'], token: string, id: string, body: Body) =>
  app.inject({
    method: 'PATCH',
    url: `/admin/api/pilots/${id}`,
    headers: admin(token),
    payload: body,
  });

const setActive = (app: Harness['app'], token: string, id: string, active: boolean) =>
  app.inject({
    method: 'POST',
    url: `/admin/api/pilots/${id}/active`,
    headers: admin(token),
    payload: { active },
  });

/**
 * Sesja PRZEGLĄDARKOWA panelu - ta, której nie da się skasować z bazy, bo jej tam nie
 * ma. Zwraca gotowy nagłówek `cookie`, czyli dokładnie to, co odeśle przeglądarka.
 */
async function panelSession(app: Harness['app'], who: string): Promise<{ cookie: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { idToken: googleTokenFor(who) },
  });
  const cookie = res.cookies.find((c) => c.name === 'uzaero_admin');
  if (cookie == null) throw new Error(`logowanie do panelu nie wydało ciasteczka (${who})`);
  return { cookie: `uzaero_admin=${cookie.value}` };
}

const panelMe = (app: Harness['app'], session: { cookie: string }) =>
  app.inject({ method: 'GET', url: '/admin/api/me', headers: { cookie: session.cookie } });

/**
 * Komenda kont złożona z TYCH SAMYCH klas co produkcja, ale wołana poza HTTP.
 *
 * Potrzebna do dwóch przypadków, których przez `app.inject` postawić się nie da:
 *  • **wyścig o unikalność** - sprawdzenie przed zapisem trzeba wtedy oślepić
 *    (`blindConflictCheck`), bo inaczej złapie kolizję pierwsze i do bazy nic nie
 *    dojedzie; a to właśnie zachowanie BAZY jest tu przedmiotem testu;
 *  • **druga transakcja w kolejce po blokadzie advisory** - jej `Actor` jest kontem,
 *    które w międzyczasie przestało być administratorem, więc brama HTTP odbiłaby je
 *    wcześniej (403) i test nigdy nie dotknąłby reguły.
 *
 * `queries` (gdy podane) zbiera SQL wykonany W TRANSAKCJI - dekorujemy OBSERWACJĘ,
 * nie zachowanie, dokładnie jak `options.events` w `helpers.ts`.
 */
function pilotCommands(
  harness: Harness,
  options: { queries?: string[]; blindConflictCheck?: boolean } = {},
): AdminPilotCommands {
  const real = new PgAdminPilotsRepo();
  const repo: PilotsAdminPort =
    options.blindConflictCheck === true
      ? Object.assign(Object.create(real) as PgAdminPilotsRepo, { conflict: async () => null })
      : real;

  const db: Database = {
    query: (text, params) => harness.db.query(text, params),
    transaction: (fn) =>
      harness.db.transaction(async (tx) =>
        fn({
          query: (text, params) => {
            options.queries?.push(text);
            return tx.query(text, params);
          },
        } satisfies Queryable),
      ),
  };

  return new AdminPilotCommands(
    new AuditedWrite(db, new PgAdminAuditRepo(), harness.clock),
    repo,
    new PgAdminRefreshTokensRepo(),
    randomUUID,
    harness.clock,
  );
}

/** `Actor` administratora - komenda pyta o `pilotId`, resztę dokłada dziennik audytu. */
const actor = (pilotId: string) => ({ pilotId, role: 'admin' as const, ip: null });

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{
    action: string;
    actor_pilot_id: string;
    actor_role: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, unknown>;
  }>(
    `SELECT action, actor_pilot_id, actor_role, target_type, target_id, details
       FROM admin_audit ORDER BY id`,
  );
  return rows;
}

describe('GET /admin/api/pilots - lista kont i dane referencyjne', () => {
  // Osobny przypadek „rola pośrednia listę CZYTA" wypadł razem z rolą `training_lead`
  // (2026-08-30): dziś listę czyta dokładnie ten, kto ma wejście do panelu, czyli
  // administrator - i mówi o tym ten przypadek.
  it('administrator dostaje komplet kont z licznikami po CAŁYM klubie', async () => {
    const { app } = await testHarness();
    const res = await listPilots(app, await tokenOf(app, 'TMK'));

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Seed: TMK i AKO administratorzy, PWI/JSE/KRZ piloci.
    expect(body.items).toHaveLength(5);
    expect(body.counts).toEqual({
      total: 5,
      active: 5,
      inactive: 0,
      admin: 2,
      pilot: 3,
      // Zero dni lotnych, bo świeży harness nie ma jeszcze ani jednej sesji.
      flyingDays: 0,
    });
    // Okno „dni lotnych" jedzie w odpowiedzi, żeby nagłówek kolumny w panelu opisywał
    // to, co serwer NAPRAWDĘ policzył - a nie miesiąc, który panel sobie założył.
    expect(body.daysFrom).toMatch(/^\d{4}-\d{2}-01$/);
    expect(body.daysTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('nie oddaje hasła ani hasha - w żadnym polu, w żadnym wierszu', async () => {
    const { app } = await testHarness();
    const res = await listPilots(app, await tokenOf(app, 'TMK'));

    expect(res.body).not.toContain('scrypt$');
    for (const item of res.json().items) {
      expect(Object.keys(item).sort()).toEqual([
        'active',
        'code',
        'email',
        'flyingDays',
        'id',
        'name',
        'role',
        'updatedAt',
      ]);
    }
  });

  it('filtruje po roli, statusie i szuka po kodzie/nazwisku/e-mailu', async () => {
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    expect((await listPilots(app, token, '?role=admin')).json().items).toHaveLength(2);
    // Parametr jest POWTARZALNY - chip „Z rolą panelu" był dwiema rolami naraz
    // i wróci nią razem z trzecią rolą, więc kształt zapytania zostaje sprawdzony.
    expect(
      (await listPilots(app, token, '?role=admin&role=pilot')).json().items,
    ).toHaveLength(5);
    expect((await listPilots(app, token, '?active=true')).json().items).toHaveLength(5);
    expect((await listPilots(app, token, '?q=kowalska')).json().items).toEqual([
      expect.objectContaining({ code: 'AKO' }),
    ]);
    // Wyszukiwanie po fragmencie e-maila i bez rozróżniania wielkości liter.
    expect((await listPilots(app, token, '?q=PIOTR@')).json().items).toEqual([
      expect.objectContaining({ code: 'PWI' }),
    ]);
    // Metaznak `LIKE` jest w tym polu ZWYKŁYM znakiem - inaczej „%" pokazywałoby
    // wszystko pod etykietą zawężenia.
    expect((await listPilots(app, token, '?q=%25')).json().items).toEqual([]);
  });

  it('liczniki są niezależne od filtra - kafel opisuje klub, nie zawężenie', async () => {
    const { app } = await testHarness();
    const body = (await listPilots(app, await tokenOf(app, 'TMK'), '?role=admin')).json();

    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.counts.total).toBe(5);
  });

  it('LICZNIKI CHIPÓW respektują wyszukiwanie, a kafle nie - to dwa różne pytania', async () => {
    // Chip z liczbą jest obietnicą „tyle wierszy zobaczysz po kliknięciu". Do
    // 2026-08-01 chipy nosiły liczby kafli, więc po wpisaniu frazy tabela miała jeden
    // wiersz, a chip „Nieaktywni" nadal pokazywał 2 i po kliknięciu dawał zero wierszy.
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    await setActive(app, token, 'JSE', false);

    // Bez wyszukiwania chipy zgadzają się z kaflami - to ta sama populacja.
    const all = (await listPilots(app, token)).json();
    expect(all.scopes).toEqual({ total: 5, active: 4, inactive: 1, panel: 2 });
    expect(all.counts).toMatchObject({ total: 5, active: 4, inactive: 1 });

    // Z wyszukiwaniem chipy opisują TRAFIENIA…
    const narrowed = (await listPilots(app, token, '?q=kowalska')).json();
    expect(narrowed.items).toHaveLength(1);
    expect(narrowed.scopes).toEqual({ total: 1, active: 1, inactive: 0, panel: 1 });
    // …a kafle dalej opisują KLUB, bo o tym mówią na ekranie.
    expect(narrowed.counts).toMatchObject({ total: 5, active: 4, inactive: 1 });

    // I najważniejsze: liczba na chipie zgadza się z liczbą wierszy po kliknięciu.
    const clicked = (await listPilots(app, token, '?q=kowalska&active=false')).json();
    expect(clicked.items).toHaveLength(narrowed.scopes.inactive);
  });
});

describe('POST /admin/api/pilots - zakładanie konta', () => {
  it('konto powstaje BEZ poświadczenia, a dostęp daje dopiero podpięcie konta Google', async () => {
    const { app, identityProvider } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    const created = await createPilot(app, token, {
      code: 'kza',
      name: 'Katarzyna Zawadzka',
      email: 'k.zawadzka@uzaero.pl',
      role: 'pilot',
    });

    expect(created.statusCode).toBe(201);
    const { pilot } = created.json();
    // Kod normalizuje się do wersalików: „kza" i „KZA" to w intencji ten sam kod.
    expect(pilot.code).toBe('KZA');
    expect(pilot.active).toBe(true);
    // `id` NIE jest kodem - zdarzenia wiążą się z `id`, więc zmiana kodu nie może
    // odrywać konta od jego nalotu (mockup A06: „kod jest etykietą, nie kluczem").
    expect(pilot.id).not.toBe(pilot.code);
    // Odpowiedź nie niesie ŻADNEGO poświadczenia - nie ma już czego wydawać.
    expect(created.json().password).toBeUndefined();

    // I to jest cała treść przekroju: konto założone w panelu NAPRAWDĘ się loguje -
    // ale dopiero kontem Google o wpisanym wyżej adresie (`docs/logowanie-google.md` §6).
    identityProvider.register('token-kza', {
      provider: 'google',
      subject: 'google-sub-kza',
      email: 'k.zawadzka@uzaero.pl',
      emailVerified: true,
      name: 'Katarzyna Zawadzka',
    });
    const logged = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: 'token-kza' },
    });

    expect(logged.statusCode).toBe(200);
    expect(logged.json().pilot.code).toBe('KZA');
    expect(logged.json().pilot.role).toBe('pilot');
  });

  it('audyt niesie tożsamość konta i E-MAIL, bo to on rozstrzyga o podpięciu', async () => {
    const { app, db } = await testHarness();
    const created = await createPilot(app, await tokenOf(app, 'TMK'), {
      code: 'KZA',
      name: 'Katarzyna Zawadzka',
      email: 'k.zawadzka@uzaero.pl',
      role: 'pilot',
    });
    const { pilot } = created.json();

    const rows = await auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'pilot.create',
      actor_pilot_id: 'TMK',
      actor_role: 'admin',
      target_type: 'pilot',
      target_id: pilot.id,
    });
    // E-mail w dzienniku jest po wejściu Google NAJWAŻNIEJSZY: to on rozstrzyga,
    // czyje konto Google podepnie się pod ten wiersz przy pierwszym logowaniu.
    expect(rows[0]?.details).toMatchObject({
      code: 'KZA',
      role: 'pilot',
      email: 'k.zawadzka@uzaero.pl',
    });
    // Hasha nie ma gdzie sprawdzać: kolumna `password_hash` zniknęła migracją 7
    // (pilnuje tego lista kolumn w `schema.test.ts`), więc konto bez poświadczenia
    // jest tu jedynym możliwym kształtem, a nie stanem do udowodnienia.
  });

  it('zajęty kod i zajęty e-mail → 409 z NAZWĄ pola, nie „naruszenie unikalności"', async () => {
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    const sameCode = await createPilot(app, token, {
      code: 'TMK',
      name: 'Ktoś Inny',
      email: 'ktos@uzaero.pl',
    });
    expect(sameCode.statusCode).toBe(409);
    expect(sameCode.json()).toEqual({ error: 'conflict', field: 'code' });

    const sameEmail = await createPilot(app, token, {
      code: 'XYZ',
      name: 'Ktoś Inny',
      email: 'tomasz@uzaero.pl',
    });
    expect(sameEmail.statusCode).toBe(409);
    expect(sameEmail.json()).toEqual({ error: 'conflict', field: 'email' });
  });

  it('odrzucone żądanie nie zostawia ani konta, ani wpisu w audycie', async () => {
    const { app, db } = await testHarness();
    await createPilot(app, await tokenOf(app, 'TMK'), {
      code: 'TMK',
      name: 'Ktoś Inny',
      email: 'ktos@uzaero.pl',
    });

    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM pilots');
    expect(Number(rows[0]?.n)).toBe(5);
    expect(await auditRows(db)).toEqual([]);
  });

  it('konto bez `accounts.manage` nie zakłada kont - 403 z podaną zdolnością', async () => {
    const { app, db } = await testHarness();
    const res = await createPilot(app, await tokenOf(app, 'PWI'), {
      code: 'NEW',
      name: 'Nowe Konto',
      email: 'nowe@uzaero.pl',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden', required: 'accounts.manage' });
    expect(await auditRows(db)).toEqual([]);
  });

  it('walidacja: kod ze spacją, e-mail bez małpy, rola spoza słownika → 400', async () => {
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    for (const body of [
      { code: 'A B', name: 'Ktoś Nowy', email: 'a@b.pl' },
      { code: 'ABC', name: 'Ktoś Nowy', email: 'nie-email' },
      { code: 'ABC', name: 'Ktoś Nowy', email: 'a@b.pl', role: 'superadmin' },
      { code: 'ABC', name: 'X', email: 'a@b.pl' },
    ]) {
      expect((await createPilot(app, token, body)).statusCode).toBe(400);
    }
  });
});

describe('PATCH /admin/api/pilots/:id - tożsamość i rola', () => {
  it('zapisuje zmianę i wpisuje do audytu DIFF, nie stan po zmianie', async () => {
    const { app, db } = await testHarness();
    const res = await patchPilot(app, await tokenOf(app, 'TMK'), 'PWI', {
      name: 'Piotr Wiśniewski-Nowak',
      role: 'admin',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().pilot).toMatchObject({
      code: 'PWI',
      name: 'Piotr Wiśniewski-Nowak',
      role: 'admin',
    });

    const rows = await auditRows(db);
    expect(rows[0]).toMatchObject({ action: 'pilot.update', target_id: 'PWI' });
    expect(rows[0]?.details).toEqual({
      code: 'PWI',
      changes: {
        name: { from: 'Piotr Wiśniewski', to: 'Piotr Wiśniewski-Nowak' },
        role: { from: 'pilot', to: 'admin' },
      },
    });
  });

  it('żądanie bez faktycznej zmiany → 400, bez wpisu w dzienniku', async () => {
    // Dziennik nadzoru, w którym połowa wierszy to „otwarto i zamknięto formularz",
    // przestaje być czytelny.
    const { app, db } = await testHarness();
    const res = await patchPilot(app, await tokenOf(app, 'TMK'), 'PWI', {
      name: 'Piotr Wiśniewski',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'no_changes' });
    expect(await auditRows(db)).toEqual([]);
  });

  it('zmiana kodu NIE odrywa konta od historii - `id` zostaje ten sam', async () => {
    const { app, db } = await testHarness();
    const res = await patchPilot(app, await tokenOf(app, 'TMK'), 'PWI', { code: 'PWN' });

    expect(res.statusCode).toBe(200);
    expect(res.json().pilot).toMatchObject({ id: 'PWI', code: 'PWN' });

    // Zdarzenia wiążą się z `id`, więc po zmianie kodu nadal wskazują to konto.
    const { rows } = await db.query<{ id: string; code: string }>(
      'SELECT id, code FROM pilots WHERE id = $1',
      ['PWI'],
    );
    expect(rows[0]).toEqual({ id: 'PWI', code: 'PWN' });
  });

  it('administrator nie odbiera roli SOBIE - 409 z powodem, nie ciche 200', async () => {
    const { app, db } = await testHarness();
    const res = await patchPilot(app, await tokenOf(app, 'TMK'), 'TMK', { role: 'pilot' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'refused', reason: 'self_demote' });

    const { rows } = await db.query<{ role: string }>(
      "SELECT role FROM pilots WHERE id = 'TMK'",
    );
    expect(rows[0]?.role).toBe('admin');
    expect(await auditRows(db)).toEqual([]);
  });

  it('administrator, który został SAM, nie odbierze roli sobie - `self_demote`', async () => {
    // Nazwa mówi teraz to, co przypadek robi. Do 2026-08-01 nazywał się „OSTATNI
    // aktywny administrator nie traci roli - nawet cudzą ręką" i asertował
    // `self_demote`, czyli nie dotykał gałęzi `last_admin` w ogóle: nie umiałby upaść
    // przy jej usunięciu, a pilnował jej z nazwy. Przez gałąź `last_admin` przechodzi
    // osobny przypadek niżej („wyścig o populację administratorów").
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    // Świat testowy ma DWA konta administratorów (TMK, AKO), a ten przypadek opisuje
    // klub, w którym na końcu zostaje JEDEN - więc AKO schodzi do pilota, zanim ruch
    // się zacznie. Jawnie w teście, bo to warunek przypadku, a nie własność świata.
    await db.query("UPDATE pilots SET role = 'pilot' WHERE id = 'AKO'");

    // Drugi administrator, żeby dało się w ogóle wykonać ruch odbierający rolę…
    await patchPilot(app, token, 'PWI', { role: 'admin' });
    // …i degradacja TMK cudzą ręką (PWI jest teraz administratorem).
    const second = await tokenOf(app, 'PWI');
    expect((await patchPilot(app, second, 'TMK', { role: 'pilot' })).statusCode).toBe(200);

    // PWI został sam. Odmowa jest tu `self_demote`, bo to on sam wykonuje ruch -
    // i to jest jedyna droga, jaką ten stan da się osiągnąć jednym żądaniem.
    const refused = await patchPilot(app, second, 'PWI', { role: 'pilot' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'refused', reason: 'self_demote' });

    const { rows } = await db.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM pilots WHERE active AND role = 'admin'",
    );
    expect(Number(rows[0]?.n)).toBe(1);
  });
});

describe('wyścig o populację administratorów', () => {
  /**
   * Awaria, dla której cały ten przekrój powstał, tylko gorsza: klub BEZ ŻADNEGO
   * administratora i bez ścieżki ratunkowej.
   *
   * `SELECT COUNT(*)` niczego nie blokuje, transakcje jadą w READ COMMITTED, a dwie
   * degradacje piszą do RÓŻNYCH wierszy - więc nic ich nie serializuje. Dwóch
   * administratorów odbierających sobie rolę równolegle: obaj widzą „jest dwóch",
   * obaj commitują, zostaje zero. Serializuje je dopiero blokada advisory na stałym
   * kluczu, wzięta PRZED odczytem licznika.
   */
  it('blokada advisory jest brana PRZED policzeniem administratorów, w tej transakcji', async () => {
    const harness = await testHarness();
    const queries: string[] = [];
    const commands = pilotCommands(harness, { queries });

    const outcome = await commands.update(actor('TMK'), 'PWI', { role: 'admin' });
    expect(outcome.ok).toBe(true);

    const lock = queries.findIndex((q) => q.includes('pg_advisory_xact_lock'));
    const count = queries.findIndex((q) => q.includes("role = 'admin'"));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(count).toBeGreaterThanOrEqual(0);
    // Blokada ZA odczytem nie chroni niczego: licznik byłby już przeczytany.
    expect(lock).toBeLessThan(count);
  });

  it('deaktywacja też staje w tej kolejce - aktywacja zmienia populację tak samo', async () => {
    const harness = await testHarness();
    const queries: string[] = [];
    const commands = pilotCommands(harness, { queries });

    expect((await commands.setActive(actor('TMK'), 'PWI', false)).ok).toBe(true);
    expect(queries.some((q) => q.includes('pg_advisory_xact_lock'))).toBe(true);
  });

  it('DRUGA transakcja w kolejce widzi już jednego administratora → `last_admin`', async () => {
    // Tu przechodzimy przez gałąź `last_admin` NAPRAWDĘ, a nie z nazwy testu.
    //
    // Stan odtwarza dokładnie to, co po naprawie widzi druga transakcja: obaj
    // administratorzy ruszyli naraz, pierwsza degradacja zdążyła, a druga wchodzi do
    // reguły z licznikiem przeczytanym PO niej. Jej `Actor` (TMK) nie jest już wtedy
    // administratorem, więc brama HTTP odbiłaby żądanie wcześniej - dlatego komendę
    // wołamy wprost, tak jak robi to `rebuildProjectionsCli`.
    const harness = await testHarness();
    const commands = pilotCommands(harness);

    // Wyścig ma być między DWOMA administratorami, a świat testowy ma trzeciego (AKO)
    // - z nim żadna z degradacji nie byłaby tą ostatnią i gałąź nigdy by nie zaszła.
    await harness.db.query("UPDATE pilots SET role = 'pilot' WHERE id = 'AKO'");

    // Dwóch administratorów: TMK (seed) i PWI.
    expect((await commands.update(actor('TMK'), 'PWI', { role: 'admin' })).ok).toBe(true);

    // Pierwsza transakcja wyścigu: PWI odbiera rolę TMK. Przechodzi - jest dwóch.
    expect((await commands.update(actor('PWI'), 'TMK', { role: 'pilot' })).ok).toBe(true);

    // Druga transakcja wyścigu, wpuszczona przez blokadę dopiero teraz.
    const outcome = await commands.update(actor('TMK'), 'PWI', { role: 'pilot' });
    expect(outcome).toEqual({ ok: false, reason: 'refused', refusal: 'last_admin' });

    // I to jest cała stawka: klub NADAL ma administratora.
    const { rows } = await harness.db.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM pilots WHERE active AND role = 'admin'",
    );
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it('deaktywacja ostatniego administratora cudzą ręką → `last_admin`, konto zostaje', async () => {
    const harness = await testHarness();
    const commands = pilotCommands(harness);

    // Jak wyżej: trzeci administrator ze świata testowego zdejmowałby z PWI status
    // ostatniego, a to jego dotyczy ten przypadek.
    await harness.db.query("UPDATE pilots SET role = 'pilot' WHERE id = 'AKO'");

    expect((await commands.update(actor('TMK'), 'PWI', { role: 'admin' })).ok).toBe(true);
    expect((await commands.update(actor('PWI'), 'TMK', { role: 'pilot' })).ok).toBe(true);

    const outcome = await commands.setActive(actor('TMK'), 'PWI', false);
    expect(outcome).toEqual({ ok: false, reason: 'refused', refusal: 'last_admin' });

    const { rows } = await harness.db.query<{ active: boolean }>(
      "SELECT active FROM pilots WHERE id = 'PWI'",
    );
    expect(rows[0]?.active).toBe(true);
  });
});

describe('wyścig o unikalność kodu i e-maila', () => {
  /**
   * Sprawdzenie przed zapisem i `INSERT` to dwa kroki, a między nimi mieści się druga
   * transakcja z tym samym kodem. Do 2026-08-01 przegrany wyścig wychodził z komendy
   * jako nieznany błąd i lądował jako **500** - czyli „coś się zepsuło" na zdarzenie,
   * które ma gotowe wyjaśnienie i gotowy formularz do poprawienia.
   *
   * Wyścigu na PGlite (jedno połączenie) rozegrać się nie da, więc oślepiamy
   * sprawdzenie przed zapisem: to jest DOKŁADNIE stan, w którym zostawia komendę
   * przegrany wyścig. Błąd przychodzi z PRAWDZIWEGO indeksu UNIQUE, nie z atrapy.
   */
  it('kolizja z indeksu bazy → 409 z NAZWĄ pola, nie 500', async () => {
    const harness = await testHarness();
    const commands = pilotCommands(harness, { blindConflictCheck: true });

    const sameCode = await commands.create(actor('TMK'), {
      code: 'TMK',
      name: 'Ktoś Inny',
      email: 'ktos@uzaero.pl',
      role: 'pilot',
    });
    expect(sameCode).toEqual({ ok: false, reason: 'conflict', field: 'code' });

    const sameEmail = await commands.create(actor('TMK'), {
      code: 'XYZ',
      name: 'Ktoś Inny',
      email: 'tomasz@uzaero.pl',
      role: 'pilot',
    });
    expect(sameEmail).toEqual({ ok: false, reason: 'conflict', field: 'email' });

    // Odbita transakcja nie zostawia ani konta, ani wpisu w dzienniku.
    const { rows } = await harness.db.query<{ n: string }>('SELECT COUNT(*) AS n FROM pilots');
    expect(Number(rows[0]?.n)).toBe(5);
    expect(await auditRows(harness.db)).toEqual([]);
  });

  it('rozpoznaje 23505 po nazwie ograniczenia i po `detail`, a reszty NIE zgaduje', async () => {
    // Sterowniki podają raz jedno, raz drugie - a nierozpoznane ograniczenie ma
    // zostać awarią (500), bo `pilots_pkey` znaczyłoby kolizję uuid-ów, nie zajęty kod.
    expect(uniqueConflictField({ code: '23505', constraint: 'pilots_code_key' })).toBe('code');
    expect(uniqueConflictField({ code: '23505', constraint: 'pilots_email_key' })).toBe('email');
    expect(
      uniqueConflictField({ code: '23505', detail: 'Key (code)=(TMK) already exists.' }),
    ).toBe('code');
    expect(uniqueConflictField({ code: '23505', constraint: 'pilots_pkey' })).toBeNull();
    expect(uniqueConflictField({ code: '23503', constraint: 'pilots_code_key' })).toBeNull();
    expect(uniqueConflictField(new Error('cokolwiek'))).toBeNull();
    expect(uniqueConflictField(null)).toBeNull();
  });
});

describe('POST /admin/api/pilots/:id/active - deaktywacja i aktywacja', () => {
  it('deaktywacja ZRYWA sesje pilota i zapisuje ich liczbę w audycie', async () => {
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    // Pilot loguje się z dwóch urządzeń - dwa żywe refresh tokeny.
    const first = await login(app, 'PWI');
    await login(app, 'PWI');
    expect(
      Number(
        (
          await db.query<{ n: string }>(
            "SELECT COUNT(*) AS n FROM refresh_tokens WHERE pilot_id = 'PWI'",
          )
        ).rows[0]?.n,
      ),
    ).toBe(2);

    const res = await setActive(app, token, 'PWI', false);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      pilot: { id: 'PWI', active: false },
      revokedSessions: 2,
    });

    // Bez tego „Deaktywuj" byłoby obietnicą bez pokrycia: pilot z żywym refreshem
    // pracowałby dalej przez 90 dni.
    const refreshed = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.json().refreshToken },
    });
    expect(refreshed.statusCode).toBe(401);

    const rows = await auditRows(db);
    expect(rows[0]).toMatchObject({ action: 'pilot.deactivate', target_id: 'PWI' });
    expect(rows[0]?.details).toMatchObject({
      code: 'PWI',
      revokedSessions: 2,
      changes: { active: { from: true, to: false } },
    });
  });

  it('deaktywowane konto nie zaloguje się ani w aplikacji, ani w panelu', async () => {
    const { app } = await testHarness();
    await setActive(app, await tokenOf(app, 'TMK'), 'AKO', false);

    expect((await login(app, 'AKO')).statusCode).toBe(401);
    const panel = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/login',
      headers: ADMIN_CSRF_HEADERS,
      payload: { idToken: googleTokenFor('AKO') },
    });
    expect(panel.statusCode).toBe(401);
  });

  it('DEAKTYWACJA ODCINA PANEL NATYCHMIAST - nie po ośmiu godzinach sesji', async () => {
    // Sedno rozstrzygnięcia „rola i aktywność przy każdym żądaniu". Token odciętego
    // administratora jest ważny kryptograficznie jeszcze przez godzinę, a mimo to
    // kolejne żądanie panelu dostaje 401 - bo za poświadczeniem nie stoi już nikt.
    const { app } = await testHarness();
    const cutOff = await tokenOf(app, 'AKO');
    expect((await listPilots(app, cutOff)).statusCode).toBe(200);

    await setActive(app, await tokenOf(app, 'TMK'), 'AKO', false);

    const after = await listPilots(app, cutOff);
    expect(after.statusCode).toBe(401);
    expect(after.json()).toEqual({ error: 'unauthorized' });
  });

  it('administrator nie deaktywuje SIEBIE - 409 z powodem', async () => {
    const { app, db } = await testHarness();
    const res = await setActive(app, await tokenOf(app, 'TMK'), 'TMK', false);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'refused', reason: 'self_deactivate' });

    const { rows } = await db.query<{ active: boolean }>(
      "SELECT active FROM pilots WHERE id = 'TMK'",
    );
    expect(rows[0]?.active).toBe(true);
    expect(await auditRows(db)).toEqual([]);
  });

  it('aktywacja wraca jako `pilot.update` - katalog akcji nie ma `pilot.activate`', async () => {
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    await setActive(app, token, 'PWI', false);
    const res = await setActive(app, token, 'PWI', true);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pilot: { active: true }, revokedSessions: 0 });

    const rows = await auditRows(db);
    expect(rows.map((r) => r.action)).toEqual(['pilot.deactivate', 'pilot.update']);
    expect(rows[1]?.details).toMatchObject({
      changes: { active: { from: false, to: true } },
    });
  });

  it('powtórna deaktywacja → 400 `no_changes`, bez drugiego wpisu', async () => {
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    await setActive(app, token, 'PWI', false);
    const again = await setActive(app, token, 'PWI', false);

    expect(again.statusCode).toBe(400);
    expect((await auditRows(db)).filter((r) => r.action === 'pilot.deactivate')).toHaveLength(1);
  });
});

describe('unieważnianie sesji - po wejściu Google jedyną drogą jest deaktywacja', () => {
  // Reset hasła był do 2026-09-04 drugą drogą unieważnienia poświadczeń i miał tu
  // własne przypadki. Po usunięciu haseł zostaje deaktywacja - i to ona musi zrywać
  // sesję PANELU, tej bowiem nie ma w żadnej tabeli (podpisany JWT w ciasteczku).
  // Gdyby przestała, odcięcie konta byłoby obietnicą bez pokrycia przez osiem godzin.
  it('DEAKTYWACJA zabija sesję panelu tak samo, a AKTYWACJA nie ożywia starej', async () => {
    // Aktywacja świadomie NIE cofa znacznika: token sprzed odcięcia ma zostać martwy,
    // bo przywrócenie dostępu jest decyzją o KONCIE, a nie o poświadczeniu, które
    // ktoś mógł w międzyczasie skopiować.
    const { app, clock } = await testHarness();
    const admin = await tokenOf(app, 'TMK');
    const session = await panelSession(app, 'AKO');

    clock.advance(1000);
    expect((await setActive(app, admin, 'AKO', false)).statusCode).toBe(200);
    expect((await panelMe(app, session)).statusCode).toBe(401);

    clock.advance(1000);
    expect((await setActive(app, admin, 'AKO', true)).statusCode).toBe(200);
    expect((await panelMe(app, session)).statusCode).toBe(401);

    // …a świeże logowanie po aktywacji działa (znacznik odcina przeszłość, nie konto).
    expect((await panelMe(app, await panelSession(app, 'AKO'))).statusCode).toBe(200);
  });
});

describe('CSRF i sesja przeglądarkowa', () => {
  it('mutacja bez nagłówka `X-UZ-Admin` nie przechodzi', async () => {
    const { app, db } = await testHarness();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/pilots',
      headers: { authorization: `Bearer ${await tokenOf(app, 'TMK')}` },
      payload: { code: 'NEW', name: 'Nowe Konto', email: 'nowe@uzaero.pl' },
    });

    expect(res.statusCode).toBe(403);
    expect(await auditRows(db)).toEqual([]);
  });
});

/**
 * USUWANIE KONTA (2026-08-30).
 *
 * Operacja jest NIEODWRACALNA i jedyna taka w panelu, więc przekrój sprawdza nie tylko
 * ścieżkę udaną, ale KAŻDĄ z trzech odmów osobno - a przy „ma historię" także wariant,
 * który najłatwiej przeoczyć: konto, które nigdy nie było PIC-em, ale poleciało jako
 * drugi pilot.
 */
describe('usunięcie konta', () => {
  const deletePilot = (app: Harness['app'], token: string, id: string) =>
    app.inject({ method: 'DELETE', url: `/admin/api/pilots/${id}`, headers: admin(token) });

  /** Wiersz zdarzenia WPROST do bazy - pytamy o regułę usuwania, nie o ingest. */
  const insertEvent = (
    db: Harness['db'],
    over: { uuid: string; picId: string; dualId?: string | null },
  ) =>
    db.query(
      `INSERT INTO events (uuid, session_uuid, aircraft_id, pic_id, dual_id, type,
                           device_time, payload, schema_version)
       VALUES ($1, 's-1', 'SP-AXA', $2, $3, 'engine_start', 1, '{}'::jsonb, 1)`,
      [over.uuid, over.picId, over.dualId ?? null],
    );

  /** Konto świeże i już wyłączone - jedyny stan, z którego usunięcie ma prawo przejść. */
  async function disposable(app: Harness['app'], token: string): Promise<string> {
    const created = await createPilot(app, token, { code: 'TMP', name: 'Konto Pomyłkowe' });
    const id = created.json().pilot.id as string;
    await setActive(app, token, id, false);
    return id;
  }

  it('kasuje konto BEZ historii - wiersz znika, a audyt niesie tożsamość', async () => {
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    const id = await disposable(app, token);

    const res = await deletePilot(app, token, id);

    expect(res.statusCode).toBe(204);
    const { rows } = await db.query('SELECT id FROM pilots WHERE id = $1', [id]);
    expect(rows).toHaveLength(0);

    // Wpis audytu jest po tej operacji JEDYNYM śladem konta, więc musi nieść komplet
    // tożsamości - `target_id` jest uuid-em, którego nikt nie rozpozna.
    const audit = (await auditRows(db)).find((row) => row.action === 'pilot.delete');
    expect(audit).toMatchObject({ target_type: 'pilot', target_id: id, actor_pilot_id: 'TMK' });
    expect(audit?.details).toMatchObject({ code: 'TMP', name: 'Konto Pomyłkowe', role: 'pilot' });
  });

  it('ODMAWIA, dopóki konto ma dostęp - usuwanie jest dwustopniowe', async () => {
    // Nie jest to formalność: telefon nie ma ścieżki kasowania wiersza, więc konto
    // usunięte „na gorąco" zostałoby na nim jako AKTYWNE. Wyłączenie jedzie normalną
    // drogą przez `GET /reference` i aplikacja po nim filtruje.
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    const created = await createPilot(app, token, { code: 'TMP', name: 'Konto Pomyłkowe' });
    const id = created.json().pilot.id as string;

    const res = await deletePilot(app, token, id);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'refused', reason: 'account_active' });
    const { rows } = await db.query('SELECT id FROM pilots WHERE id = $1', [id]);
    expect(rows).toHaveLength(1);
  });

  it('ODMAWIA kontu, które latało jako PIC', async () => {
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    const id = await disposable(app, token);
    await insertEvent(db, { uuid: 'e-pic', picId: id });

    const res = await deletePilot(app, token, id);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'refused', reason: 'has_history' });
  });

  it('ODMAWIA kontu, które poleciało wyłącznie jako DRUGI PILOT', async () => {
    // Przypadek najłatwiejszy do przeoczenia: konto nie jest PIC-em ani jednej sesji,
    // a mimo to stoi w cudzym rejestrze i w karcie arkusza.
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    const id = await disposable(app, token);
    await insertEvent(db, { uuid: 'e-dual', picId: 'TMK', dualId: id });

    const res = await deletePilot(app, token, id);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'refused', reason: 'has_history' });
  });

  it('ODMAWIA kontu, które jest SPRAWCĄ w dzienniku audytu', async () => {
    // Administrator, który coś w klubie zrobił, zostaje w dzienniku - dziennik bez
    // tożsamości sprawcy przestaje być dziennikiem.
    const { app, db } = await testHarness();
    const token = await tokenOf(app, 'TMK');
    const id = await disposable(app, token);
    await db.query(
      `INSERT INTO admin_audit (actor_pilot_id, actor_role, action, target_type, target_id)
       VALUES ($1, 'admin', 'flag.resolve', 'flag', '1')`,
      [id],
    );

    const res = await deletePilot(app, token, id);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'refused', reason: 'has_history' });
  });

  it('ODMAWIA usunięcia WŁASNEGO konta', async () => {
    const { app } = await testHarness();
    const token = await tokenOf(app, 'TMK');

    const res = await deletePilot(app, token, 'TMK');

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'refused', reason: 'self_delete' });
  });

  it('nieznane konto to 404, a nie ciche 204', async () => {
    const { app } = await testHarness();
    const res = await deletePilot(app, await tokenOf(app, 'TMK'), 'nie-ma-takiego');

    expect(res.statusCode).toBe(404);
  });

  it('konto bez zdolności `accounts.manage` dostaje 403 i niczego nie kasuje', async () => {
    const { app, db } = await testHarness();
    const admin = await tokenOf(app, 'TMK');
    const id = await disposable(app, admin);

    const res = await deletePilot(app, await tokenOf(app, 'PWI'), id);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ required: 'accounts.manage' });
    const { rows } = await db.query('SELECT id FROM pilots WHERE id = $1', [id]);
    expect(rows).toHaveLength(1);
  });
});
