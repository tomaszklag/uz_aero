/**
 * Ninerdeck - cel przycisku na stronie pobierania (`site/tools/download-page.mjs`).
 *
 * Wydanie 4.0.0 szło z serwerem PRZED APK: stronę przepisano na trwały adres przed
 * merge'em, a plik opublikowano po wdrożeniu. Drugi przebieg skryptu (`--release`) zastał
 * stronę aktualną i rzucił „brak oczekiwanych znaczników", a przepisanie ręczne doklejało
 * „· build EAS" do adresu stałego pliku. Test stoi w `server/test`, bo `site/` jest
 * świadomie poza workspace'ami i bez własnego runnera (jak `releaseTitle.test.ts`).
 */

import { describe, expect, it } from 'vitest';

import { RELEASE_URL, downloadMeta, rewriteDownloadPage } from '../../site/tools/download-page.mjs';

const EAS_URL = 'https://expo.dev/artifacts/eas/abc.apk';
const date = new Date(2026, 9, 8, 12, 0);

const page = (url: string, meta: string) =>
  `<meta http-equiv="refresh" content="2;url=${url}">\n` +
  `<a class="dl big" id="apk-link" href="${url}"><small id="apk-meta">${meta}</small></a>`;

describe('podpis przycisku pobierania', () => {
  it('stały plik wydania - bez dopisku o miejscu przechowywania', () => {
    expect(downloadMeta({ url: RELEASE_URL, version: '4.0.0', number: '7', date })).toBe(
      'wersja 4.0.0 (build 7) · 8 października 2026',
    );
  });

  it('artefakt EAS - z dopiskiem, bo wygasa po kilku tygodniach', () => {
    expect(downloadMeta({ url: EAS_URL, version: '4.0.0', number: '7', date })).toBe(
      'wersja 4.0.0 (build 7) · 8 października 2026 · build EAS',
    );
  });
});

describe('przepisanie strony pobierania', () => {
  const build = { url: RELEASE_URL, version: '4.0.0', number: '7', date };

  it('podmienia adres, przekierowanie i podpis', () => {
    const result = rewriteDownloadPage(page(RELEASE_URL, 'wersja 3.1.0 (build 6) · 26 września 2026'), build);
    expect(result.changed).toBe(true);
    expect(result.html).toBe(page(RELEASE_URL, 'wersja 4.0.0 (build 7) · 8 października 2026'));
  });

  it('strona już aktualna NIE jest błędem - drugi przebieg przy wydaniu z serwerem przed APK', () => {
    const current = page(RELEASE_URL, 'wersja 4.0.0 (build 7) · 8 października 2026');
    const result = rewriteDownloadPage(current, build);
    expect(result.changed).toBe(false);
    expect(result.html).toBe(current);
  });

  it('strona bez przekierowania też przechodzi - znacznikami są wyłącznie przycisk i podpis', () => {
    const html = `<a id="apk-link" href="${EAS_URL}"><small id="apk-meta">stary</small></a>`;
    expect(rewriteDownloadPage(html, build).changed).toBe(true);
  });

  it('brak znacznika przycisku albo podpisu jest błędem i nazywa, którego brakuje', () => {
    expect(() => rewriteDownloadPage('<p id="apk-meta">x</p>', build)).toThrow(/apk-link/);
    expect(() => rewriteDownloadPage(`<a id="apk-link" href="${EAS_URL}">x</a>`, build)).toThrow(/apk-meta/);
  });
});
