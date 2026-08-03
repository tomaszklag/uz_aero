/**
 * UZ Aero — panel: katalog akcji audytu MUSI być tym, co zna serwer.
 *
 * `admin/src/api/dto.ts` trzyma lustro unii `AdminAction` z
 * `server/src/domain/adminActions.ts` — bo panel nigdy nie importuje z wnętrza serwera
 * (`docs/architektura-panelu-frontend.md` §5.2), a `Record<AdminAction, …>` w ekranie
 * `A09` musi mieć komplet kodów, żeby wymuszać komplet opisów.
 *
 * Lustro bez testu to kopia, która rozjeżdża się przy pierwszej nowej komendzie panelu
 * — i objawia dopiero wtedy, gdy ktoś tej akcji szuka w dzienniku. Ten plik czyta
 * katalog serwera z DYSKU (tak samo jak `tokens.generated.test.ts` czyta generator)
 * i porównuje go z listą, którą zna panel.
 *
 * Kierunek jest obustronny celowo: kod dopisany na serwerze zostawiłby wpis bez nazwy,
 * a kod dopisany tylko w panelu obiecywałby filtr, który trasa odrzuci czterysetką.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUDIT_ACTIONS } from '../src/screens/audit/auditActions';

const CATALOG = join(__dirname, '..', '..', 'server', 'src', 'domain', 'adminActions.ts');

/**
 * Wyciągamy literały z tablicy `ADMIN_ACTIONS`, a nie wszystkie napisy w pliku:
 * docblock wymienia przykłady kodów, więc skan całej treści dawałby fałszywe trafienia.
 */
function serverActions(): string[] {
  const source = readFileSync(CATALOG, 'utf8');
  const block = /export const ADMIN_ACTIONS = \[([\s\S]*?)\] as const;/.exec(source);
  if (block == null) throw new Error('Nie znaleziono tablicy ADMIN_ACTIONS — zmienił się kształt pliku');

  return [...block[1]!.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]!);
}

describe('katalog akcji audytu: panel ↔ serwer', () => {
  it('kontrola testu: skaner faktycznie czyta katalog serwera', () => {
    // Bez tego porównanie niżej przechodziłoby na pustych listach, gdyby regex
    // przestał cokolwiek łapać albo plik zmienił nazwę.
    const actions = serverActions();
    expect(actions.length).toBeGreaterThan(10);
    expect(actions).toContain('flag.resolve');
    expect(actions).toContain('maintenance.prune_tokens');
  });

  it('lustro w panelu ma DOKŁADNIE te same kody, w tej samej kolejności', () => {
    expect(AUDIT_ACTIONS).toEqual(serverActions());
  });
});
