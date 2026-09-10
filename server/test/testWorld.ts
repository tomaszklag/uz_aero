/**
 * UZ Aero (serwer, testy) - świat referencyjny harnessu: DWA kluby, 5 samolotów, 7 osób.
 *
 * Do issue #50 ten scenariusz zakładał produkcyjny seed (`infrastructure/pg/seed.ts`)
 * i był wspólny z zaślepką telefonu. Produkcyjny seed stawia odtąd wyłącznie konto
 * superadministratora, więc scenariusz mieszka TU: testy dalej stoją na SP-AXA (wolny),
 * SP-FGK (zajmowany przez KRZ), SP-ANK (An-2 z wymogiem Duala) i SP-KWA (wyłączony)
 * oraz na kontach TMK/AKO/PWI/JSE/KRZ - a zmiany bootstrapu wdrożenia ich nie ruszają.
 *
 * ══ DWA KLUBY (wielofirmowość, issue #98 - warunek testu izolacji z epiku C) ══
 * `ORG_A` („Aeroklub Alfa") to dotychczasowy świat w całości. `ORG_B` („Aeroklub Beta")
 * ma własną flotę (SP-BBB) i własną administratorkę (BAD), a do tego jest DRUGIM klubem
 * pilota PWI - pod innym kodem (`PWB`), bo kod należy do członkostwa, nie do osoby.
 * Klub A stoi alfabetycznie przed B, więc logowanie PWI bez historii refreshów trafia
 * do A - dokładnie tam, gdzie kierowały je testy sprzed wielofirmowości.
 *
 * Świeża PGlite na harness ⇒ zwykłe INSERTy, bez upsertu produkcyjnego seeda.
 */

import type { Queryable } from '../src/application/common/ports.ts';

/** Identyfikatory klubów - stałe napisy, żeby testy pisały `ORG_A`, a nie szukały uuid-a. */
export const ORG_A = 'org-a';
export const ORG_B = 'org-b';

/**
 * KOD KLUBU Alfy w zapisie kanonicznym (`domain/clubCode.ts`) - testy dołączania wpisują
 * go tak, jak pilot: z myślnikiem, bez myślnika, małymi literami. Beta ma dołączanie
 * WYŁĄCZONE (`join_code = NULL`), żeby „kod wyłączony" miał w świecie testowym klub.
 */
export const ORG_A_CODE = 'AZG-7K4M';

/**
 * Od kiedy obowiązuje kod Alfy - chwila PRZED zegarem testowym (czerwiec 2026), żeby
 * zgłoszenia stemplowane zegarem aplikacji liczyły się jako „złożone tym kodem".
 */
const JOIN_CODE_SINCE = '2026-01-01T00:00:00.000Z';

/**
 * SEKRETY ADRESÓW KART ARKUSZA (issue #99, C5) - stałe, żeby test mógł napisać oczekiwany
 * URL karty co do znaku. W produkcji losuje je baza przy założeniu klubu.
 */
export const ORG_A_SHEETS_KEY = 'a'.repeat(32);
export const ORG_B_SHEETS_KEY = 'b'.repeat(32);

const ORGANIZATIONS = [
  [ORG_A, 'Aeroklub Alfa', 'aeroklub-alfa', 'AZG7K4M', ORG_A_SHEETS_KEY],
  [ORG_B, 'Aeroklub Beta', 'aeroklub-beta', null, ORG_B_SHEETS_KEY],
] as const;

/**
 * SUPERADMINISTRATOR platformy - osoba BEZ członkostwa, z rolą platformową (issue #99, C6:
 * zgłoszenia błędów czyta wyłącznie on). Ten sam kształt krotki, co konta klubów, żeby
 * fałszywy dostawca tożsamości logował go tą samą drogą (`googleTokenFor('ROOT')`);
 * „kod" jest tu kluczem tokenu testowego, nie kodem pilota - superadministrator kodu nie ma.
 */
export const TEST_PLATFORM_ADMIN = ['ROOT', 'ROOT', 'Operator Platformy', 'platform@ninerdeck.app', 'superadmin'] as const;

/** Konfiguracje zgodne z §5.4 (pojemność, format MH, wymóg Duala) - flota klubu A. */
const AIRCRAFT = [
  [ORG_A, 'SP-AXA', 'SP-AXA', 'Cessna 182', 2019, 330, 'hhmm', false, 'active'],
  [ORG_A, 'SP-FGK', 'SP-FGK', 'Cessna 182', 2017, 330, 'hhmm', false, 'active'],
  [ORG_A, 'SP-ANK', 'SP-ANK', 'Antonov An-2', 1984, 1700, 'hhmm', true, 'active'],
  [ORG_A, 'SP-KWA', 'SP-KWA', 'Cessna 172', 2021, 200, 'decimal', false, 'disabled'],
] as const;

/**
 * Flota klubu B - dokładana OSOBNO (`seedBetaFleet`), nie w świecie bazowym.
 *
 * Listy floty i liczniki panelu dostaną filtr po klubie dopiero w epiku C (izolacja);
 * do tego czasu piąta maszyna w świecie bazowym przesuwałaby każdą liczbę w testach
 * floty i pulpitu, choć te testy o klubach nie mówią. Testy modelu klubów
 * (`organizations.test.ts`) dokładają ją sobie jawnie.
 */
const AIRCRAFT_B = [
  [ORG_B, 'SP-BBB', 'SP-BBB', 'Cessna 152', 2015, 100, 'decimal', false, 'active'],
] as const;

/**
 * OSOBY klubu A: DWA konta z wejściem do panelu i trzej zwykli piloci.
 *
 * AKO był szefem wyszkolenia do wycofania tej roli 2026-08-30 i schodzi na `admin`,
 * a nie na `pilot`, bo tak ocaleje najwięcej przypadków: odmowy „konto bez zdolności X"
 * dowodzi odtąd token zwykłego pilota (PWI/JSE/KRZ, brama pyta o ZDOLNOŚĆ, nie o wejście
 * do panelu), a drugiego konta panelowego nie da się niczym zastąpić tam, gdzie przekrój
 * potrzebuje DWÓCH ludzi przy biurku - cudza sesja panelu, wyścig o flagę, aktor
 * dziennika audytu inny niż wykonawca.
 *
 * EKSPORTOWANE od 2026-09-04, bo `testIdentityProvider.ts` buduje z tej listy fałszywego
 * dostawcę tożsamości: token testowy musi nieść DOKŁADNIE ten e-mail, co konto, inaczej
 * nie zadziała podpięcie po zweryfikowanym adresie (`docs/logowanie-google.md` §6) - czyli
 * ta sama droga, którą w produkcji wchodzą dotychczasowi piloci. Kształt krotki
 * `[id, kod W KLUBIE A, nazwisko, e-mail, rola W KLUBIE A]` zostaje - `id` i `kod` są tu
 * równe historycznie i to jest wygoda testów, nie reguła produktu.
 */
export const TEST_PILOTS = [
  ['TMK', 'TMK', 'Tomasz Małkiewicz', 'tomasz@uzaero.pl', 'admin'],
  ['AKO', 'AKO', 'Anna Kowalska', 'anna@uzaero.pl', 'admin'],
  ['PWI', 'PWI', 'Piotr Wiśniewski', 'piotr@uzaero.pl', 'pilot'],
  ['JSE', 'JSE', 'Jan Serafin', 'jan@uzaero.pl', 'pilot'],
  ['KRZ', 'KRZ', 'Krzysztof Zieliński', 'krzysztof@uzaero.pl', 'pilot'],
] as const;

/**
 * OSOBY klubu B: administratorka BAD i pilot BPI. Ten sam kształt krotki, żeby fałszywy
 * dostawca tożsamości umiał zalogować także ich (`googleTokenFor('BAD')`).
 */
export const TEST_PILOTS_B = [
  ['BAD', 'BAD', 'Barbara Adamska', 'barbara@beta.pl', 'admin'],
  ['BPI', 'BPI', 'Bartosz Pilecki', 'bartosz@beta.pl', 'pilot'],
] as const;

/**
 * Członkostwa: każda osoba klubu A w A, każda osoba klubu B w B - plus PWI DRUGI raz,
 * w klubie B pod kodem `PWB`. To jest jedyny przypadek „jedna osoba, dwa kluby" w świecie
 * testowym i stoi tu celowo, bo sygnatura, `/reference` i wybór klubu przy logowaniu
 * muszą go umieć rozróżnić.
 */
const MEMBERSHIPS = [
  ...TEST_PILOTS.map(([id, code, , , role]) => [ORG_A, id, code, role] as const),
  ...TEST_PILOTS_B.map(([id, code, , , role]) => [ORG_B, id, code, role] as const),
  [ORG_B, 'PWI', 'PWB', 'pilot'] as const,
];

export async function seedTestWorld(db: Queryable): Promise<void> {
  for (const [id, name, slug, joinCode, sheetsKey] of ORGANIZATIONS) {
    await db.query(
      // `join_code_since` z USTALONEJ chwili, nie z `now()`: świat testowy żyje
      // w czerwcu 2026 (`TestClock`), a zgłoszenia dostają stempel Z ZEGARA APLIKACJI.
      // Stempel z zegara systemowego byłby od nich PÓŹNIEJSZY, więc „zgłoszenia tym
      // kodem" wychodziłyby zerem przy niepustej kolejce.
      `INSERT INTO organizations (id, name, slug, join_code, join_code_since, sheets_key)
       VALUES ($1, $2, $3, $4, CASE WHEN $4::text IS NULL THEN NULL ELSE $6::timestamptz END, $5)`,
      [id, name, slug, joinCode, sheetsKey, JOIN_CODE_SINCE],
    );
  }

  const [rootId, , rootName, rootEmail, platformRole] = TEST_PLATFORM_ADMIN;
  await db.query(
    `INSERT INTO pilots (id, name, email, active, platform_role) VALUES ($1, $2, $3, TRUE, $4)`,
    [rootId, rootName, rootEmail, platformRole],
  );

  await insertAircraft(db, AIRCRAFT);

  // Osoby BEZ hasła (2026-09-04): logowanie idzie przez dostawcę zewnętrznego, a testy
  // podstawiają weryfikator tokenu (`TestIdentityProvider` w `helpers.ts`). E-mail jest
  // tu istotny - po nim podpina się konto Google (`docs/logowanie-google.md` §6).
  // Kodu i roli na osobie NIE MA (wielofirmowość) - niesie je członkostwo niżej.
  for (const [id, , name, email] of [...TEST_PILOTS, ...TEST_PILOTS_B]) {
    await db.query(
      `INSERT INTO pilots (id, name, email, active) VALUES ($1, $2, $3, TRUE)`,
      [id, name, email],
    );
  }

  for (const [orgId, pilotId, code, role] of MEMBERSHIPS) {
    await db.query(
      // `platform` - tak jak w produkcji powstaje pierwszy administrator klubu: świat
      // testowy zakłada superadministrator, nie kod klubu (`joined_via` nie ma już
      // wartości `panel`, issue #100 D3).
      `INSERT INTO memberships (org_id, pilot_id, code, role, status, joined_via)
       VALUES ($1, $2, $3, $4, 'active', 'platform')`,
      [orgId, pilotId, code, role],
    );
  }
}

/** Flota klubu B (SP-BBB) - dla testów, które potrzebują maszyny w DRUGIM klubie. */
export async function seedBetaFleet(db: Queryable): Promise<void> {
  await insertAircraft(db, AIRCRAFT_B);
}

async function insertAircraft(
  db: Queryable,
  rows: readonly (readonly [string, string, string, string, number, number, string, boolean, string])[],
): Promise<void> {
  for (const [orgId, id, reg, type, year, capacityL, mhFormat, dualRequired, status] of rows) {
    await db.query(
      `INSERT INTO aircraft (org_id, id, reg, type, year, capacity_l, mh_format, dual_required, service_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [orgId, id, reg, type, year, capacityL, mhFormat, dualRequired, status],
    );
  }
}
