#!/usr/bin/env node
/**
 * Podmienia cel strony pobierania (site/src/pobierz/index.html) na NAJNOWSZY skończony
 * build produkcyjny Androida z EAS - adres APK, wersja, numer builda i data.
 *
 * Dwa tryby:
 *   node site/tools/update-download.mjs
 *       → strona kieruje WPROST na artefakt EAS (expo.dev/artifacts/…). Uwaga: Expo kasuje
 *         artefakty po kilku tygodniach - link przestanie działać, dopóki nie zrobisz
 *         nowego builda i nie uruchomisz skryptu ponownie.
 *   node site/tools/update-download.mjs --release
 *       → pobiera APK z EAS i publikuje je jako GitHub Release w repozytorium aplikacji
 *         (tag android-v<wersja>-<build>, plik uzaero.apk); strona kieruje na trwały adres
 *         https://github.com/tomaszklag/uz_aero/releases/latest/download/uzaero.apk.
 *         Wymaga zalogowanego `gh` (gh auth status).
 *
 * Skrypt pisze do ŹRÓDŁA strony, nie do wyniku renderowania: `site/src/pobierz/index.html`
 * jest plikiem ręcznym i to on wchodzi do `site/dist` przy budowaniu. Po skrypcie:
 * git commit -am "APK: <wersja> (<build>)" && git push - Railway przebuduje obraz,
 * a razem z nim stronę.
 *
 * `--url <adres> --version 1.0.1 --build 2` pozwala podać cel ręcznie (bez EAS).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASE_REPO = 'tomaszklag/uz_aero';
const RELEASE_URL = `https://github.com/${RELEASE_REPO}/releases/latest/download/uzaero.apk`;

const here = dirname(fileURLToPath(import.meta.url));
const page = resolve(here, '../src/pobierz/index.html');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32', ...options });

let build;
if (opt('url')) {
  build = { url: opt('url'), version: opt('version') ?? '?', number: opt('build') ?? '?', date: new Date() };
} else {
  const appDir = resolve(opt('app') ?? resolve(here, '../../app'));
  const json = run(npx, ['eas', 'build:list', '--platform', 'android', '--profile', 'production', '--status', 'finished', '--limit', '1', '--non-interactive', '--json'], { cwd: appDir });
  const [latest] = JSON.parse(json);
  if (!latest?.artifacts?.applicationArchiveUrl) throw new Error('EAS nie zwrócił skończonego builda produkcyjnego z artefaktem.');
  build = { url: latest.artifacts.applicationArchiveUrl, version: latest.appVersion, number: latest.appBuildVersion, date: new Date(latest.createdAt) };
}

if (flag('release')) {
  const tag = `android-v${build.version}-${build.number}`;
  const dir = mkdtempSync(join(tmpdir(), 'uzaero-apk-'));
  const apk = join(dir, 'uzaero.apk');
  console.log(`pobieram ${build.url} …`);
  run('curl', ['-sSL', '-o', apk, build.url]);
  const exists = (() => { try { run('gh', ['release', 'view', tag, '--repo', RELEASE_REPO], { stdio: ['ignore', 'ignore', 'ignore'] }); return true; } catch { return false; } })();
  if (exists) {
    run('gh', ['release', 'upload', tag, apk, '--repo', RELEASE_REPO, '--clobber']);
  } else {
    run('gh', ['release', 'create', tag, apk, '--repo', RELEASE_REPO, '--title', `UZ Aero ${build.version} (build ${build.number}) - Android`, '--notes', `Build produkcyjny EAS z ${build.date.toISOString().slice(0, 10)}. Plik APK do instalacji na Androidzie.`]);
  }
  build.url = RELEASE_URL;
  console.log(`release ${tag} opublikowany → ${RELEASE_URL}`);
}

const months = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const date = `${build.date.getDate()} ${months[build.date.getMonth()]} ${build.date.getFullYear()}`;
const meta = `wersja ${build.version} (build ${build.number}) · ${date} · ${flag('release') ? 'GitHub Releases' : 'build EAS'}`;

let html = readFileSync(page, 'utf8');
const before = html;
html = html
  .replace(/content="2;url=[^"]+"/, `content="2;url=${build.url}"`)
  .replace(/id="apk-link" href="[^"]+"/, `id="apk-link" href="${build.url}"`)
  .replace(/id="apk-meta">[^<]*</, `id="apk-meta">${meta}<`);
if (html === before) throw new Error('Strona pobierania nie ma oczekiwanych znaczników - sprawdź site/src/pobierz/index.html.');
writeFileSync(page, html);
console.log(`OK: ${meta}\n    ${build.url}`);
