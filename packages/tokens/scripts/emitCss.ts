/**
 * UZ Aero - generator `admin/src/styles/tokens.css` z `@uzaero/tokens`.
 *
 * Uruchomienie (z katalogu `admin/`):
 *     npm run tokens:css --workspace admin
 *
 * Ścieżka wyjściowa jest ARGUMENTEM, a nie stałą w tym pliku: pakiet tokenów nie ma
 * powodu wiedzieć, że istnieje workspace `admin/`. Zależność idzie w drugą stronę -
 * to panel konsumuje tokeny, nie odwrotnie.
 *
 * Motyw jest przybity na `night` i to jest decyzja, nie uproszczenie: panel ma jeden
 * motyw (§1.6). Emiter (`themeCssBlock`) zostaje parametryczny, więc drugi motyw
 * kiedyś kosztuje jeden dodatkowy blok - ale przełącznika „na zapas" nie budujemy.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { THEMES } from '../src/theme';
import { renderTokensCss } from './tokensCss';

const target = process.argv[2];
if (target == null || target.length === 0) {
  // Brak domyślnej ścieżki jest celowy: skrypt, który przy pomyłce pisze „gdzieś",
  // jest gorszy od skryptu, który odmawia.
  console.error('Użycie: tsx packages/tokens/scripts/emitCss.ts <ścieżka/do/tokens.css>');
  process.exit(1);
}

const out = resolve(process.cwd(), target);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, renderTokensCss(THEMES.night), 'utf8');

console.log(`tokens.css ← THEMES.night → ${out}`);
