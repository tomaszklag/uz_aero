/**
 * UZ Aero - panel 2.0: LUSTRA UNII TYPOW muszą być tym, co zna serwer.
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
  {
    panel: 'PilotRole',
    server: 'PILOT_ROLES',
    read: () => constIn(join(SERVER, 'roles.ts'), 'PILOT_ROLES'),
  },
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
  // Zgłoszenia rejestracyjne (logowanie Google, 2026-09-04). Status jest `TEXT`-em
  // z `CHECK`-iem w bazie, a jego definicja mieszka POZA `domain/` - w portach warstwy
  // wspólnej - bo to kształt magazynu tożsamości, nie reguła klubu. Ścieżka jest
  // przez to inna niż w pozostałych lustrach, ale powód lustra ten sam.
  {
    panel: 'RegistrationStatusDto',
    server: 'IdentityStatus',
    read: () =>
      unionIn(join(SERVER, '..', 'application', 'common', 'ports.ts'), 'IdentityStatus'),
  },
] as const;

describe('lustra unii: panel <-> serwer', () => {
  it('kontrola testu: skaner faktycznie czyta obie strony', () => {
    // Bez tego porównania niżej przechodziłyby na pustych listach, gdyby wzorzec
    // przestał cokolwiek łapać albo któryś plik zmienił nazwę.
    expect(unionIn(join(SERVER, 'roles.ts'), 'Capability')).toContain('panel.access');
    expect(unionIn(DTO, 'Capability')).toContain('flags.resolve');
    expect(constIn(join(SERVER, 'roles.ts'), 'PILOT_ROLES')).toContain('admin');
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
