/**
 * Ninerdeck - CZYJA TO BINARKA: z faktów o zainstalowanym pakiecie wyprowadza wydanie
 * NASZEJ aplikacji albo `null`.
 *
 * Moduł CZYSTY - fakty dostaje w argumencie, więc jest testowalny w Node bez
 * `expo-application` (ten importuje wyłącznie `nativeRelease.ts` obok). Rozdział jak
 * `deviceRelease.ts` ↔ `bugContext.ts`: jeden plik pyta system, drugi rozstrzyga.
 *
 * ══ PO CO TA DECYZJA ══
 * `expo-application` opisuje aplikację, która NAPRAWDĘ działa. W Expo Go jest nią
 * klient Expo: `nativeApplicationVersion` to wersja Expo Go, `nativeBuildVersion` -
 * jego build. Liczba prawdziwa o niewłaściwej rzeczy jest gorsza od kreski, więc obok
 * wersji jedzie identyfikator pakietu i wzorzec z `app.json` - gdy się różnią, wydania
 * NIE ZNAMY. Bez wzorca (platforma bez wpisu w konfiguracji) ufamy binarce: odmowa
 * „na wszelki wypadek" gasiłaby wiersz wszędzie tam, gdzie nie ma z czym porównać.
 *
 * ══ WARIANT DEWELOPERSKI JEST NASZĄ BINARKĄ (2026-09-17) ══
 * Dev build stoi pod osobnym pakietem (`scripts/app-variant.js`), żeby mieścił się na
 * telefonie obok produkcji. To wciąż nasz kod, więc wydanie jest znane - ale NAZWANE:
 * `dev: true` dokłada do napisu wersji dopisek, bo „2.0.0 (build 3)" o dev buildzie
 * i o APK z produkcji byłoby tym samym zdaniem o dwóch różnych binarkach, dokładnie
 * tą pomyłką, przed którą broni cały ten moduł.
 */

/** Co system mówi o zainstalowanym pakiecie - plus czego się spodziewamy. */
export interface NativeRelease {
  /** `Application.nativeApplicationVersion` - versionName APK; `null` na web. */
  version: string | null;
  /** `Application.nativeBuildVersion` - versionCode APK; `null` na web. */
  build: string | null;
  /** `Application.applicationId` - pakiet binarki, która działa (w Expo Go: Expo Go). */
  applicationId: string | null;
  /** Pakiet z `app.json` dla bieżącej platformy; `null` = konfiguracja go nie niesie. */
  ownApplicationId: string | null;
  /** Pakiet wariantu deweloperskiego (`app.config.js`); `null` = bez wzorca, jak wyżej. */
  devApplicationId: string | null;
}

/** Wydanie własnej binarki. `build` bywa `null` - wersja bez numeru builda nadal coś mówi. */
export interface AppRelease {
  version: string;
  build: string | null;
  /** Wariant deweloperski (osobny pakiet) - napis wersji mówi to dopiskiem. */
  dev: boolean;
}

const nonEmpty = (value: string | null): string | null =>
  value != null && value.length > 0 ? value : null;

export function ownRelease(facts: NativeRelease): AppRelease | null {
  const version = nonEmpty(facts.version);
  if (version == null) return null;
  const build = nonEmpty(facts.build);
  // Bez wzorca nie ma z czym porównać - ufamy binarce.
  if (facts.ownApplicationId == null) return { version, build, dev: false };
  if (facts.applicationId === facts.ownApplicationId) return { version, build, dev: false };
  if (facts.devApplicationId != null && facts.applicationId === facts.devApplicationId) {
    return { version, build, dev: true };
  }
  // Znamy własne pakiety, a binarka ma inny (albo żadnego) - to nie my.
  return null;
}
