#!/usr/bin/env node
/**
 * Ninerdeck - budowanie strony publicznej (landing, pobieranie, wydania, dokumentacja).
 *
 *   node site/tools/build.mjs [--out <katalog>]
 *   npm run site                                  (z korzenia repozytorium)
 *
 * Do 2026-09-07 strona mieszkała w osobnym repozytorium (`tomaszklag.github.io`), a
 * renderery czytały to repozytorium przez ścieżkę podawaną z ręki. Efekt uboczny był
 * konkretny: 71 z 75 makiet `design/` leżało tam jako ZACOMMITOWANA KOPIA, więc każda
 * poprawka makiety wymagała pamiętania o drugim repozytorium. Odtąd źródła stoją
 * w `site/src/`, wynik powstaje w `site/dist/` (jest w .gitignore) i kopii nie ma
 * nigdzie - `design/` i `docs/` czyta się tam, gdzie leżą.
 *
 * Trzy kroki, w tej kolejności:
 *   1. `site/src/` → `site/dist/`   - pliki pisane ręcznie (landing, polityka, regulamin,
 *                                     strona pobierania, arkusze stylów, favicon);
 *   2. render-docs.mjs              - `docs/podrecznik/` → `dokumentacja/`, plus żywe
 *                                     ekrany kopiowane z `design/` do `screens/`/`panels/`
 *                                     (także te, które osadza landing - patrz `screensIn`);
 *   3. render-changelog.mjs         - `docs/CHANGELOG.md` → `wydania/`.
 *
 * Renderery jadą jako OSOBNE PROCESY, a nie przez `import`: czytają `process.argv`, więc
 * zaciągnięte do tego pliku dostałyby argumenty budowania zamiast swoich. Każdy z nich
 * uruchamia się też sam - to bywa szybsze przy pisaniu podręcznika.
 *
 * Wynik jest SAMOWYSTARCZALNY i niezależny od miejsca podpięcia: wszystkie odnośniki
 * w stronie są względne, więc ten sam katalog działał pod `/uzaero/` na GitHub Pages
 * i działa pod `/` na Railway (serwuje go `server/src/http/routes/site/staticSite.ts`).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

const srcDir = join(repo, 'site', 'src');
const dist = resolve(opt('out') ?? join(repo, 'site', 'dist'));

if (!existsSync(srcDir)) throw new Error(`brak źródeł strony: ${srcDir}`);

/**
 * Makiety osadzone w stronach RĘCZNYCH (dziś: landing). `render-docs.mjs` kopiuje
 * z `design/` wyłącznie to, co wymienia podręcznik dyrektywą @screen, więc bez tego
 * kroku ekrany landingu byłyby pustymi ramkami telefonu. Zbieramy je ZE ŹRÓDŁA, a nie
 * z listy wpisanej tutaj: lista rozjechałaby się z landingiem przy pierwszej zmianie
 * makiety i nikt by tego nie zauważył - iframe nie krzyczy, tylko nic nie pokazuje.
 */
const SCREEN_REF = /(?:src|href)="screens\/([^"]+)\.html"/g;

function screensIn(dir) {
  const found = new Set();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) for (const name of screensIn(full)) found.add(name);
    else if (entry.name.endsWith('.html')) {
      for (const match of readFileSync(full, 'utf8').matchAll(SCREEN_REF)) found.add(match[1]);
    }
  }
  return found;
}

// Czyścimy w całości: renderer usuniętej strony podręcznika nie ma jak posprzątać po
// sobie, a katalog dokładany przyrostowo zaczyna po kilku wydaniach nieść pliki,
// których nikt już nie generuje.
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(srcDir, dist, { recursive: true });

const extra = [...screensIn(srcDir)].sort().join(',');
const run = (script, args) => execFileSync(process.execPath, [join(here, script), ...args], { stdio: 'inherit' });
run('render-docs.mjs', ['--out', dist, '--extra', extra]);
run('render-changelog.mjs', ['--out', dist]);

console.log(`OK: strona w ${dist}`);
