/**
 * Ninerdeck - strona pobierania: CEL PRZYCISKU w `site/src/pobierz/index.html` (czyste
 * funkcje).
 *
 * Osobny moduł, bo `update-download.mjs` wykonuje się przy imporcie (pyta EAS, publikuje
 * release, pisze plik) - testu nie da się na nim postawić bez efektów ubocznych. Ta sama
 * decyzja, co przy `release-title.mjs`. Test: `server/test/downloadPage.test.ts`.
 *
 * ══ STRONA JUŻ AKTUALNA TO NIE BŁĄD ══
 * Do 4.0.0 skrypt rzucał „strona nie ma oczekiwanych znaczników", gdy przepisanie niczego
 * nie zmieniło - czyli także wtedy, gdy strona JUŻ wskazywała ten sam plik. A to jest
 * normalny przebieg wydania z serwerem PRZED APK (4.0.0: migracje i nowe trasy): stronę
 * przepisuje się na trwały adres przed merge'em, a plik publikuje dopiero po wdrożeniu -
 * drugi przebieg skryptu (`--release`) nie ma już czego zmieniać. Rozróżniamy więc dwie
 * rzeczy, które stary warunek zlewał w jedną: BRAK ZNACZNIKA (strona przebudowana, skrypt
 * pisałby w próżnię - błąd) i BRAK ZMIANY (strona aktualna - `changed: false`).
 *
 * ══ DOPISEK „· build EAS" ZALEŻY OD ADRESU, NIE OD FLAGI ══
 * Stały plik wydania nie dostaje dopisku: miejsce przechowywania nie jest informacją dla
 * pilota. Artefakt EAS dostaje, bo wygasa po kilku tygodniach i strona ma to zdradzać.
 * Do 4.0.0 decydowała flaga `--release`, więc przepisanie strony ręcznie na trwały adres
 * (`--url <adres stałego pliku>`) doklejało dopisek do adresu, który go mieć nie powinien.
 */

export const RELEASE_REPO = 'tomaszklag/uz_aero';
/** Trwały adres najnowszego pliku wydania - przekierowuje na release oznaczony jako najnowszy. */
export const RELEASE_URL = `https://github.com/${RELEASE_REPO}/releases/latest/download/ninerdeck.apk`;

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

/** „8 października 2026" - data w strefie komputera, który uruchamia skrypt. */
export function polishDate(date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Podpis przycisku: „wersja 4.0.0 (build 7) · 8 października 2026" (+ „· build EAS"). */
export function downloadMeta(build) {
  const suffix = build.url === RELEASE_URL ? '' : ' · build EAS';
  return `wersja ${build.version} (build ${build.number}) · ${polishDate(build.date)}${suffix}`;
}

const LINK = /id="apk-link" href="[^"]+"/;
const META = /id="apk-meta">[^<]*</;
/** Przekierowanie `<meta http-equiv="refresh">` - opcjonalne, strona może go nie mieć. */
const REFRESH = /content="2;url=[^"]+"/;

/**
 * Strona po podmianie celu: `{ html, meta, changed }`. Rzuca, gdy brakuje któregoś
 * z dwóch znaczników przycisku (`apk-link`, `apk-meta`) - wtedy skrypt pisałby w próżnię.
 */
export function rewriteDownloadPage(html, build) {
  const missing = [['apk-link', LINK], ['apk-meta', META]].filter(([, re]) => !re.test(html)).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Strona pobierania nie ma znaczników ${missing.join(', ')} - sprawdź site/src/pobierz/index.html.`);
  }
  const meta = downloadMeta(build);
  const next = html
    .replace(REFRESH, `content="2;url=${build.url}"`)
    .replace(LINK, `id="apk-link" href="${build.url}"`)
    .replace(META, `id="apk-meta">${meta}<`);
  return { html: next, meta, changed: next !== html };
}
