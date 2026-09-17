/**
 * Ninerdeck - `npm run update:prod`: aktualizacja OTA ze zmiennymi profilu `production`
 * z `eas.json`.
 *
 * `eas update` nie czyta `build.<profil>.env` z `eas.json` (to pole obsługuje tylko
 * `eas build`), więc gołe `eas-cli update` pakowało bundle ze zmiennymi z lokalnego
 * `app/.env` - a tam adres serwera jest w dev zakomentowany. Ten runner czyta profil
 * `production` z `eas.json`, sprawdza komplet (`eas-profile-env.js`) i wstrzykuje go do
 * środowiska procesu `eas-cli`. Zmienne procesu WYGRYWAJĄ z plikami `.env` Expo, więc
 * lokalny plik nie ma jak podmienić adresu po cichu. Argumenty lecą dalej:
 * `npm run update:prod -- -m "opis zmiany"`.
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
const { profileEnv } = require('./eas-profile-env');

const appRoot = path.resolve(__dirname, '..');
const PROFILE = 'production';
const BRANCH = 'production';
const PLATFORM = 'android';

const passedArgs = process.argv.slice(2);
const platformArgs = passedArgs.some((arg) => arg === '--platform' || arg === '-p' || arg.startsWith('--platform='))
  ? []
  : ['--platform', PLATFORM];

let env;
try {
  const easJson = JSON.parse(readFileSync(path.join(appRoot, 'eas.json'), 'utf8'));
  env = profileEnv(easJson, PROFILE);
} catch (err) {
  console.error(`\n  BŁĄD: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

console.log(
  `eas update --branch ${BRANCH} ${platformArgs.join(' ')} ze zmiennymi profilu "${PROFILE}" z eas.json:`.replace(/\s+/g, ' '),
);
for (const [name, value] of Object.entries(env)) console.log(`  ${name}=${value}`);
console.log('');

const result = spawnSync(
  'npx',
  ['eas-cli', 'update', '--branch', BRANCH, ...platformArgs, ...passedArgs],
  {
    cwd: appRoot,
    stdio: 'inherit',
    // `npx` jest na Windowsie skryptem `.cmd` - bez powłoki `spawnSync` go nie znajdzie.
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  },
);

process.exit(result.status ?? 1);
