/**
 * UZ Aero - panel: katalog ZDOLNOŚCI musi być tym, co zna serwer.
 *
 * `admin/src/api/dto.ts` trzyma lustro unii `Capability` z `server/src/domain/roles.ts`
 * - bo panel nigdy nie importuje z wnętrza serwera
 * (`docs/architektura-panelu-frontend.md` §5.2), a `auth/can.ts` musi mieć KOMPLET
 * nazw, żeby `Record<Capability, string>` wymusił kompletem opisów „kogo prosić".
 *
 * ══ DLACZEGO TEN PLIK POWSTAŁ DOPIERO PRZY `A11` ══
 * Bo dopiero wtedy katalog urósł po raz pierwszy od powstania panelu (`maintenance.run`).
 * Do tej pory lustro było kopią zrobioną raz i zgodną przez to, że nikt jej nie ruszał -
 * czyli dokładnie tą sytuacją, którą `adminActions.mirror.test.ts` opisuje przy akcjach
 * audytu („lustro bez testu to kopia, która rozjeżdża się przy pierwszej nowej pozycji").
 *
 * Skutek rozjazdu jest konkretny i cichy: zdolność dodana na serwerze i nieznana panelowi
 * zostaje wypisana przez `GET /admin/api/me` i zignorowana przy porównaniu, więc pozycja
 * nawigacji jest wyszarzona dla kogoś, kto MA uprawnienie. W drugą stronę - zdolność
 * znana wyłącznie panelowi obiecuje dostęp, którego serwer nie przyzna.
 *
 * Obie strony czytamy z DYSKU jako tekst, bo obie są TYPAMI: unii TypeScriptu nie da się
 * wyliczyć w czasie działania (inaczej niż `ADMIN_ACTIONS`, które jest tablicą).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROLES = join(__dirname, '..', '..', 'server', 'src', 'domain', 'roles.ts');
const DTO = join(__dirname, '..', 'src', 'api', 'dto.ts');

/**
 * Literały z deklaracji `export type Capability = …;`, w kolejności wystąpienia.
 *
 * Bierzemy WYŁĄCZNIE blok deklaracji, a nie wszystkie napisy w pliku: docbloki po obu
 * stronach wymieniają nazwy zdolności jako przykłady, więc skan całej treści dawałby
 * fałszywe trafienia (a w `roles.ts` - także zawartość mapy `CAPABILITIES`).
 */
function capabilitiesIn(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  // `\r?` NIE jest ozdobą: przy `core.autocrlf=true` (domyślnym na Windows) pliki leżą
  // na dysku z CRLF, więc wzorzec kończący się na `;\n` nie trafiał w `;\r\n` i test
  // wywracał się na wyjątku - u każdego, kto pracuje na Windows.
  const block = /export type Capability =([\s\S]*?);\r?\n/.exec(source);
  if (block == null) {
    throw new Error(`Nie znaleziono deklaracji Capability w ${file} - zmienił się kształt pliku`);
  }
  return [...block[1]!.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]!);
}

describe('katalog zdolności: panel ↔ serwer', () => {
  it('kontrola testu: skaner faktycznie czyta obie deklaracje', () => {
    // Bez tego porównanie niżej przechodziłoby na pustych listach, gdyby regex przestał
    // cokolwiek łapać albo któryś plik zmienił nazwę.
    expect(capabilitiesIn(ROLES).length).toBeGreaterThan(5);
    expect(capabilitiesIn(ROLES)).toContain('panel.access');
    expect(capabilitiesIn(DTO)).toContain('flags.resolve');
  });

  it('lustro w panelu ma DOKŁADNIE te same nazwy, w tej samej kolejności', () => {
    expect(capabilitiesIn(DTO)).toEqual(capabilitiesIn(ROLES));
  });
});
