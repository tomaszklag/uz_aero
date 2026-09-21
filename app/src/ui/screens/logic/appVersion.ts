/**
 * Ninerdeck - napis wersji aplikacji: „1.0.0 (build 1)".
 *
 * Czysta logika karty „O aplikacji" (13) - i zgłoszenia błędu, bo oba mają mówić
 * TO SAMO: tester czyta wersję z Ustawień, administrator z kolumny „Wersja aplikacji"
 * w panelu, a wydania w `docs/CHANGELOG.md` i na stronie opisują się tym samym zdaniem
 * „wersja (build N)". Wydanie podaje `infrastructure/release/nativeRelease.ts` (jedyne
 * źródło - zainstalowany pakiet, nie konfiguracja); tu jest wyłącznie format.
 *
 * Wariant deweloperski (osobny pakiet, `scripts/app-variant.js`) dostaje dopisek „· dev":
 * dev build i APK z produkcji niosą tę samą wersję i ten sam numer builda, więc bez
 * dopisku zgłoszenie błędu z dev builda wyglądałoby jak zgłoszenie z produkcji.
 */

import type { AppRelease } from '../../../infrastructure/release/ownRelease';

/** Wiersz „Wersja", gdy wydania nie znamy (Expo Go, web): kreska, jak w reszcie karty. */
export const NO_RELEASE = '-';

/** Dopisek wariantu deweloperskiego: „2.0.0 (build 3) · dev". */
export const DEV_VARIANT_SUFFIX = ' · dev';

/** „1.0.0 (build 1)"; bez numeru builda sama wersja - „(build null)" nie istnieje. */
export function releaseLabel(release: AppRelease): string {
  const base = release.build == null ? release.version : `${release.version} (build ${release.build})`;
  return release.dev ? `${base}${DEV_VARIANT_SUFFIX}` : base;
}

/**
 * Wartość wiersza „Wersja" na 13. Napis także przy braku: `KeyValueRow` czyta `null`
 * jako „jeszcze czytamy" i rysuje plamkę (issue #33), a brak wydania jest odpowiedzią.
 */
export function versionRowValue(release: AppRelease | null): string {
  return release == null ? NO_RELEASE : releaseLabel(release);
}
