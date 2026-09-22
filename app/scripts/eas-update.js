/**
 * Ninerdeck - aktualizacja OTA ze zmiennymi profilu z `eas.json`.
 *
 * Woła się przez skrypt npm, a nazwa profilu jest jego pierwszym argumentem:
 *   `npm run update:prod -- -m "opis"`  → profil `production` → kanał `production` (piloci)
 * Reszta argumentów leci dalej do `eas-cli`. Profil jest argumentem, a nie stałą, bo
 * runner ma zostać jeden także wtedy, gdy celów będzie kiedyś więcej niż jeden.
 *
 * `eas update` nie czyta `build.<profil>.env` z `eas.json` (to pole obsługuje tylko
 * `eas build`), więc gołe `eas-cli update` pakowało bundle ze zmiennymi z lokalnego
 * `app/.env` - a tam adres serwera jest w dev zakomentowany. Ten runner czyta profil
 * z `eas.json`, sprawdza komplet (`eas-profile-env.js`) i wstrzykuje go do środowiska
 * procesu `eas-cli`. Zmienne procesu WYGRYWAJĄ z plikami `.env` Expo, więc lokalny plik
 * nie ma jak podmienić adresu po cichu.
 *
 * Gałąź publikacji to KANAŁ profilu, nie osobna stała - powód w docblocku
 * `eas-profile-env.js`.
 *
 * Platforma jest ZAWSZE podana (`--platform android`, chyba że wołający poda własną):
 * bez niej `eas update` eksportuje bundle dla wszystkich platform, także web, a projekt
 * nie ma `react-native-web` - aplikacja jest wyłącznie androidowa, jak `eas build`
 * (`build:prod` też mówi `--platform android`). Eksport padał wtedy na „trying to use web
 * support" i aktualizacja nie wychodziła wcale (2026-09-17, pierwsze OTA po własnej domenie).
 *
 * Skrypt niczego nie commituje i nie podnosi wersji - to zostaje decyzją człowieka
 * (skill `wydanie`, ścieżka A).
 */

'use strict';

const path = require('node:path');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { profileTarget } = require('./eas-profile-env');
const { shellArgs } = require('./shell-args');

const appRoot = path.resolve(__dirname, '..');
const PLATFORM = 'android';

const [profile, ...passedArgs] = process.argv.slice(2);
if (profile == null || profile.startsWith('-')) {
  console.error(
    '\n  BŁĄD: runner potrzebuje nazwy profilu z eas.json.\n' +
      '  Na co dzień woła się go przez npm run update:prod albo npm run update:stg.\n',
  );
  process.exit(1);
}

const platformArgs = passedArgs.some(
  (arg) => arg === '--platform' || arg === '-p' || arg.startsWith('--platform='),
)
  ? []
  : ['--platform', PLATFORM];

let target;
try {
  const easJson = JSON.parse(readFileSync(path.join(appRoot, 'eas.json'), 'utf8'));
  target = profileTarget(easJson, profile);
} catch (err) {
  console.error(`\n  BŁĄD: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

console.log(
  `eas update --branch ${target.channel} ${platformArgs.join(' ')} ze zmiennymi profilu "${profile}" z eas.json:`.replace(
    /\s+/g,
    ' ',
  ),
);
for (const [name, value] of Object.entries(target.env)) console.log(`  ${name}=${value}`);
console.log('');

// `npx` jest na Windowsie skryptem `.cmd` - bez powłoki `spawnSync` go nie uruchomi.
// A skoro powłoka jest, to cytowanie argumentów należy do nas: `shell: true` skleja je
// spacjami BEZ cudzysłowów, więc `-m "opis ze spacjami"` rozpadał się na kilka argumentów
// i `eas-cli` odbijał wywołanie (2026-09-22; pełne uzasadnienie w `shell-args.js`).
const useShell = process.platform === 'win32';
const argv = ['eas-cli', 'update', '--branch', target.channel, ...platformArgs, ...passedArgs];

const result = spawnSync('npx', shellArgs(argv, useShell), {
  cwd: appRoot,
  stdio: 'inherit',
  shell: useShell,
  env: { ...process.env, ...target.env },
});

process.exit(result.status ?? 1);
