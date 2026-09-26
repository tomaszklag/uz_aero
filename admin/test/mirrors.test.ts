/**
 * Ninerdeck - panel 2.0: LUSTRA UNII TYPOW muszą być tym, co zna serwer.
 *
 * Panel nigdy nie importuje z wnętrza serwera, więc trzy unie z `server/src/domain/`
 * mają w `api/dto.ts` swoją kopię. Kopia bez testu rozjeżdża się przy pierwszej nowej
 * pozycji - i rozjeżdża się CICHO:
 *  - **zdolność** dodana na serwerze i nieznana panelowi zostaje pominięta przy
 *    porównaniu, więc panel blokuje akcję komuś, kto MA uprawnienie;
 *  - **powód odmowy** dodany na serwerze i nieznany panelowi wypada z mapy komunikatów,
 *    więc klient klubu dostaje na ekranie surowe `oil_min_above_capacity`.
 *
 * Ten drugi przypadek nie jest hipotetyczny: do panelu 2.0 lustro `FleetRefusal`
 * nie miało obu powodów oleju z issue #60 (dodanych na serwerze w sierpniu 2026),
 * a nikt tego nie zauważył, bo nic tego nie sprawdzało.
 *
 * Obie strony czytamy z DYSKU jako tekst, bo obie są TYPAMI - unii TypeScriptu nie da
 * się wyliczyć w czasie działania.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SERVER = join(__dirname, '..', '..', 'server', 'src', 'domain');
/**
 * Dwa pliki SPOZA domeny, z których panel też ma lustra (3.1.0, issue #165): porty
 * warstwy aplikacji (rozstrzygnięcie i pochodzenie decyzji) oraz komenda ścieżki
 * (powody odmowy zapisu). Skaner czyta unię tak samo niezależnie od katalogu -
 * a lustro bez strażnika rozjeżdża się tak samo niezależnie od tego, gdzie stoi oryginał.
 */
const PORTS = join(__dirname, '..', '..', 'server', 'src', 'application', 'common', 'ports.ts');
const APPROVAL_STEPS = join(
  __dirname,
  '..',
  '..',
  'server',
  'src',
  'application',
  'admin',
  'commands',
  'approvalSteps.ts',
);
const DTO = join(__dirname, '..', 'src', 'api', 'dto.ts');

/**
 * Treść bez komentarzy - skaner szuka DEKLARACJI, nie prozy o niej.
 *
 * Bez tego kroku `roles.ts` oddawał z bloku `Capability` napis `'resolved'`: docblok
 * przy `flags.resolve` cytuje `status='resolved'`. Zawężanie samego wzorca literału
 * (np. „tylko nazwy z kropką") działałoby dla zdolności i psuło się przy powodach
 * odmowy, które kropki nie mają.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Literały z pojedynczej deklaracji, w kolejności wystąpienia. */
function literalsInBlock(file: string, declaration: RegExp, what: string): string[] {
  const block = declaration.exec(withoutComments(readFileSync(file, 'utf8')));
  if (block == null) {
    throw new Error(`Nie znaleziono deklaracji ${what} w ${file} - zmienił się kształt pliku`);
  }
  return [...block[1]!.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]!);
}

/**
 * `export type <nazwa> = 'a' | 'b';`
 *
 * `\r?` NIE jest ozdobą: przy `core.autocrlf=true` (domyślnym na Windows) pliki leżą
 * na dysku z CRLF, więc wzorzec kończący się na `;\n` nie trafiałby w `;\r\n`.
 */
const unionIn = (file: string, name: string): string[] =>
  literalsInBlock(file, new RegExp(String.raw`export type ${name} =([\s\S]*?);\r?\n`), name);

/**
 * `export const <NAZWA> = ['a', 'b'] as const;`
 *
 * Potrzebne, bo `PilotRole` na serwerze NIE jest unią literałów, tylko typem
 * wyprowadzonym z tablicy (`(typeof PILOT_ROLES)[number]`) - a lustro w panelu jest
 * unią, bo panel tablicy nie potrzebuje.
 */
const constIn = (file: string, name: string): string[] =>
  literalsInBlock(file, new RegExp(String.raw`export const ${name} = \[([\s\S]*?)\]`), name);

/** Sześć luster: unia w panelu -> deklaracja na serwerze. */
const MIRRORS = [
  {
    panel: 'Capability',
    server: 'Capability',
    read: () => unionIn(join(SERVER, 'roles.ts'), 'Capability'),
  },
  // Lustro `PilotRole` wypadło razem z rolami klubu (epik #197): zdolność nadaje się
  // CZŁONKOSTWU, a „administrator" jest nazwą ZESTAWU, którą panel liczy sobie sam
  // ze zbioru. Nie ma po drugiej stronie czego lustrzyć.
  {
    panel: 'PilotRefusalDto',
    server: 'AccountRefusal',
    read: () => unionIn(join(SERVER, 'accountGuards.ts'), 'AccountRefusal'),
  },
  {
    panel: 'FleetRefusalDto',
    server: 'FleetRefusal',
    read: () => unionIn(join(SERVER, 'fleetGuards.ts'), 'FleetRefusal'),
  },
  // Zgłoszenia błędów (issue #87). Status i waga są zwykłym `TEXT`-em w bazie,
  // więc bez tego lustra pozycja dodana na serwerze wyciekłaby na ekran klubu
  // surowym `in_progress` - dokładnie ten tryb awarii, który opisuje nagłówek.
  {
    panel: 'BugStatusDto',
    server: 'BUG_STATUSES',
    read: () => constIn(join(SERVER, 'bugReports.ts'), 'BUG_STATUSES'),
  },
  {
    panel: 'BugSeverityDto',
    server: 'BUG_SEVERITIES',
    read: () => constIn(join(SERVER, 'bugReports.ts'), 'BUG_SEVERITIES'),
  },
  // Stan CZŁONKOSTWA (issue #101, E3) - następca lustra statusu zgłoszenia
  // rejestracyjnego, które odeszło w epiku D razem ze statusami na tożsamości Google.
  // Kolumna jest zwykłym `TEXT`-em z CHECK-iem, więc bez tego lustra stan dodany na
  // serwerze wyciekłby na ekran klubu surowym napisem.
  {
    panel: 'MembershipStatusDto',
    server: 'MEMBERSHIP_STATUSES',
    read: () => constIn(join(SERVER, 'memberships.ts'), 'MEMBERSHIP_STATUSES'),
  },
  // SESJE LOGOWANIA (2.1.0, issue #134). Trzy katalogi z jednego pliku domeny, bo
  // panel pisze z nich napisy przy każdym wierszu listy urządzeń: powierzchnię
  // („panel" / „telefon"), metodę („Google" / „hasło") i plakietki metod konta.
  // Bez lustra metoda dodana na serwerze wypadłaby ze słownika napisów i wiersz
  // pokazałby surowe `passkey` - ten sam tryb awarii, co przy statusie zgłoszenia.
  {
    panel: 'SessionSurfaceDto',
    server: 'SESSION_SURFACES',
    read: () => constIn(join(SERVER, 'loginSessions.ts'), 'SESSION_SURFACES'),
  },
  {
    panel: 'SessionMethodDto',
    server: 'LOGIN_METHODS',
    read: () => constIn(join(SERVER, 'loginSessions.ts'), 'LOGIN_METHODS'),
  },
  {
    panel: 'AccountMethodDto',
    server: 'LOGIN_METHODS_ISSUED',
    read: () => constIn(join(SERVER, 'loginSessions.ts'), 'LOGIN_METHODS_ISSUED'),
  },
  // KALENDARZ ZAJĘTOŚCI (3.0.0) - dopisane przy issue #204, bo weszły z modułem
  // i nikt ich tu nie dołożył: stan `expired` (3.1.0, #164) pojawił się na serwerze
  // bez ani jednego czerwonego testu. Dokładnie ten tryb awarii, który opisuje nagłówek.
  // `BlockReasonDto` lustra NIE MA, bo po drugiej stronie nie ma typu - powód wyłączenia
  // z użytku żyje w schemacie zoda trasy i w CHECK-u migracji 11.
  {
    panel: 'BookingStatusDto',
    server: 'BookingStatus',
    read: () => unionIn(join(SERVER, 'bookings.ts'), 'BookingStatus'),
  },
  {
    panel: 'BookingKindDto',
    server: 'BookingKind',
    read: () => unionIn(join(SERVER, 'bookings.ts'), 'BookingKind'),
  },
  // ŚCIEŻKA AKCEPTACJI (3.1.0, issue #165). Wynik ścieżki i powody odmowy decyzji są
  // w domenie; rozstrzygnięcie i pochodzenie decyzji (`ApprovalVerdict`, `ApprovalVia`)
  // żyją w portach warstwy aplikacji - skaner czyta je stamtąd, bo lustro bez strażnika
  // rozjeżdża się tak samo niezależnie od katalogu, w którym stoi oryginał.
  {
    panel: 'ApprovalOutcomeDto',
    server: 'ApprovalOutcome',
    read: () => unionIn(join(SERVER, 'approvals.ts'), 'ApprovalOutcome'),
  },
  {
    panel: 'ApprovalRefusalDto',
    server: 'ApprovalRefusal',
    read: () => unionIn(join(SERVER, 'approvals.ts'), 'ApprovalRefusal'),
  },
  {
    panel: 'ApprovalVerdictDto',
    server: 'ApprovalVerdict',
    read: () => unionIn(PORTS, 'ApprovalVerdict'),
  },
  {
    panel: 'ApprovalViaDto',
    server: 'ApprovalVia',
    read: () => unionIn(PORTS, 'ApprovalVia'),
  },
  {
    panel: 'ApprovalStepsRefusalDto',
    server: 'ApprovalStepsRefusal',
    read: () => unionIn(APPROVAL_STEPS, 'ApprovalStepsRefusal'),
  },
] as const;

describe('lustra unii: panel <-> serwer', () => {
  it('kontrola testu: skaner faktycznie czyta obie strony', () => {
    // Bez tego porównania niżej przechodziłyby na pustych listach, gdyby wzorzec
    // przestał cokolwiek łapać albo któryś plik zmienił nazwę.
    expect(unionIn(join(SERVER, 'roles.ts'), 'Capability')).toContain('panel.access');
    expect(unionIn(DTO, 'Capability')).toContain('flags.resolve');
    expect(unionIn(join(SERVER, 'roles.ts'), 'Capability')).toContain('accounts.manage');
  });

  it('kontrola testu: komentarze NIE wchodzą do wyniku', () => {
    // Docblok przy `flags.resolve` cytuje `status='resolved'` - gdyby skaner czytał
    // prozę, ten napis wjechałby do listy zdolności i test porównywałby fikcję.
    expect(unionIn(join(SERVER, 'roles.ts'), 'Capability')).not.toContain('resolved');
  });

  for (const mirror of MIRRORS) {
    it(`${mirror.panel} ma DOKŁADNIE te same nazwy, co ${mirror.server} na serwerze`, () => {
      expect(unionIn(DTO, mirror.panel)).toEqual(mirror.read());
    });
  }
});
