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
}

/** Wydanie własnej binarki. `build` bywa `null` - wersja bez numeru builda nadal coś mówi. */
export interface AppRelease {
  version: string;
  build: string | null;
}

const nonEmpty = (value: string | null): string | null =>
  value != null && value.length > 0 ? value : null;

export function ownRelease(facts: NativeRelease): AppRelease | null {
  const version = nonEmpty(facts.version);
  if (version == null) return null;
  // Znamy własny pakiet, a binarka ma inny (albo żadnego) - to nie my.
  if (facts.ownApplicationId != null && facts.applicationId !== facts.ownApplicationId) return null;
  return { version, build: nonEmpty(facts.build) };
}
