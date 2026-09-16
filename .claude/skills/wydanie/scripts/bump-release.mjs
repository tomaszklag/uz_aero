#!/usr/bin/env node
/**
 * Ninerdeck - mechaniczna część wydania: podbicie wersji i przepisanie changeloga.
 *
 *   node .claude/skills/wydanie/scripts/bump-release.mjs [--dry-run] [--version 1.2.0]
 *
 * Robi dokładnie cztery rzeczy i żadnej z nich nie zgaduje:
 *   1. `app/app.json` - `version` na numer następnego wydania, `android.versionCode` +1;
 *   2. `docs/CHANGELOG.md` - `## W przygotowaniu` dostaje nagłówek wydania z datą;
 *   3. nad nim powstaje nowa, pusta sekcja `## W przygotowaniu`;
 *   4. z `## Plan wydań` znika zrealizowany kamień milowy.
 *
 * Numer wersji bierze się z PIERWSZEGO kamienia milowego w planie wydań, bo tam go
 * ustala właściciel projektu (`CLAUDE.md`: „Terminy są orientacyjne i podaje je
 * właściciel - nie zmyślamy dat"). `--version` istnieje na wypadek wydania spoza planu
 * i wtedy plan zostaje nietknięty.
 *
 * `versionCode` rośnie o jeden ZAWSZE. `appVersionSource` w `eas.json` to `local`, więc
 * EAS czyta numer builda stąd; dwa buildy o tym samym numerze są nierozróżnialne
 * w zgłoszeniach błędów, a to jedyny ślad, jaki zostaje po uwadze pilota z terenu.
 *
 * Skrypt niczego nie commituje i nie buduje - to zostaje decyzją człowieka.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const MONTHS = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

/** Odczyt z zachowaniem końców linii - repozytorium ma core.autocrlf=true. */
function readText(path) {
  const raw = readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  return { text: crlf ? raw.replaceAll('\r\n', '\n') : raw, crlf };
}

function writeText(path, text, crlf) {
  writeFileSync(path, crlf ? text.replaceAll('\n', '\r\n') : text);
}

const fail = (message) => {
  console.error(`\n  BŁĄD: ${message}\n`);
  process.exit(1);
};

// ── wejście ────────────────────────────────────────────────────────────────
const appPath = join(repo, 'app', 'app.json');
const logPath = join(repo, 'docs', 'CHANGELOG.md');
const app = readText(appPath);
const log = readText(logPath);

const manifest = JSON.parse(app.text);
const currentVersion = manifest?.expo?.version;
const currentCode = manifest?.expo?.android?.versionCode;
if (typeof currentVersion !== 'string' || typeof currentCode !== 'number') {
  fail('app/app.json nie ma `expo.version` albo `expo.android.versionCode`.');
}

// ── numer wydania: z planu albo z --version ────────────────────────────────
const SEMVER = /^\d+\.\d+\.\d+$/;
const planHeading = /^### (\d+\.\d+\.\d+) · (.+)$/;

let milestone = null;
const planStart = log.text.indexOf('\n## Plan wydań');
if (planStart >= 0) {
  for (const line of log.text.slice(planStart).split('\n')) {
    if (/^## /.test(line) && !line.startsWith('## Plan wydań')) break;
    const match = planHeading.exec(line);
    if (match) {
      milestone = { line, version: match[1], when: match[2] };
      break;
    }
  }
}

const version = opt('version') ?? milestone?.version;
if (version == null) {
  fail(
    'nie wiem, jaki numer nadać. W `## Plan wydań` nie ma kamienia milowego z numerem ' +
      'wersji (`### 1.2.0 · termin`).\n  Numery i terminy podaje właściciel projektu - ' +
      'zapytaj albo podaj `--version 1.2.0`.',
  );
}
if (!SEMVER.test(version)) fail(`„${version}" nie wygląda jak numer wersji (oczekiwane 1.2.3).`);
if (version === currentVersion) {
  fail(
    `app/app.json ma już wersję ${version}. Wydanie zostało chyba podbite wcześniej - ` +
      'sprawdź `git log app/app.json` przed powtórzeniem.',
  );
}

const usingPlan = opt('version') == null;
const build = currentCode + 1;
const now = new Date();
const dateLabel = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
const heading = `## ${version} (build ${build}) · ${dateLabel}`;

// ── przebudowa changeloga ──────────────────────────────────────────────────
const UPCOMING = '## W przygotowaniu';
if (!log.text.includes(`\n${UPCOMING}`)) {
  fail(
    `docs/CHANGELOG.md nie ma sekcji „${UPCOMING}". To ona staje się wydaniem, ` +
      'więc bez niej nie ma czego wydać.',
  );
}

let changelog = log.text.replace(`\n${UPCOMING}`, `\n${UPCOMING}\n\n${heading}`);

// Świeża sekcja jest PUSTA i to jest poprawny stan: punkty dopisują kolejne PR-y.
// Renderer strony wydań liczy grupy, więc zero grup znaczy „nic jeszcze nie weszło".

if (usingPlan && milestone != null) {
  // Kamień milowy jest zrealizowany - schodzi z planu razem ze swoimi punktami,
  // czyli wszystkim do następnego `###` albo `##`.
  const lines = changelog.split('\n');
  const from = lines.indexOf(milestone.line);
  if (from >= 0) {
    let to = from + 1;
    while (to < lines.length && !/^#{2,3} /.test(lines[to])) to++;
    // `to` wskazuje następny nagłówek, więc wycinamy razem z pustą linią przed nim -
    // inaczej po sekcji zostaje pusta linia obok tej, która stała przed nią, i plan
    // rozjeżdża się podwójnym odstępem przy każdym wydaniu.
    lines.splice(from, to - from);
    changelog = lines.join('\n');
  }
}

// ── manifest ───────────────────────────────────────────────────────────────
const appText = app.text
  .replace(`"version": "${currentVersion}"`, `"version": "${version}"`)
  .replace(`"versionCode": ${currentCode}`, `"versionCode": ${build}`);
if (appText === app.text) fail('nie udało się podmienić wersji w app/app.json - sprawdź format pliku.');

// ── wynik ──────────────────────────────────────────────────────────────────
console.log('');
console.log(`  wydanie      ${version} (build ${build}) · ${dateLabel}`);
console.log(`  z            ${currentVersion} (build ${currentCode})`);
console.log(`  numer z      ${usingPlan ? `planu wydań - „${milestone.when}"` : '--version'}`);
console.log('');
console.log('  app/app.json      version + versionCode');
console.log('  docs/CHANGELOG.md „W przygotowaniu" → nagłówek wydania, nowa pusta sekcja nad nim');
if (usingPlan && milestone != null) console.log('                    kamień milowy zdjęty z planu wydań');

if (flag('dry-run')) {
  console.log('\n  --dry-run: nic nie zapisano.\n');
  process.exit(0);
}

writeText(appPath, appText, app.crlf);
writeText(logPath, changelog, log.crlf);
console.log('\n  Zapisano. Dalej: uzupełnij „Dla testerów" w changelogu, potem build i commit.\n');
