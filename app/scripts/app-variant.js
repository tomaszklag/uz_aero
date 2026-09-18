/**
 * Ninerdeck - WARIANT konfiguracji Expo: produkcyjny (`app.json` bez zmian) albo
 * DEWELOPERSKI - osobny pakiet Android, żeby dev build stał na telefonie OBOK
 * produkcyjnego APK.
 *
 * Czysta logika bez importów Node (testy: `src/__tests__/appVariant.test.ts`). Czytają ją
 * DWA miejsca i to jest powód, dla którego istnieje jako osobny moduł CommonJS:
 * `app.config.js` (Expo CLI ewaluuje go gołym Node, zanim cokolwiek się zbunduje) oraz
 * `src/infrastructure/release/nativeRelease.ts` (rozstrzyga, czy zainstalowany pakiet
 * jest naszą binarką - a wariant deweloperski NIĄ JEST). Sufiks zapisany w dwóch plikach
 * rozjechałby się przy pierwszej zmianie.
 *
 * ══ DLACZEGO OSOBNY PAKIET (decyzja 2026-09-17) ══
 * Dev build (`expo-dev-client`, profil `development` w `eas.json`) z pakietem produkcyjnym
 * zastępowałby na telefonie APK z produkcji, a zapisane w nim tokeny produkcji jechałyby
 * do lokalnego serwera. `com.ninerdeck.app.dev` ma własne dane, własną ikonę na ekranie
 * i własny klucz EAS (poświadczenia EAS są per pakiet) - stąd osobny klient OAuth typu
 * Android w Google Cloud dla tego pakietu i jego odcisku SHA-1.
 *
 * ══ KTO USTAWIA `APP_VARIANT` ══
 * - Metro / `expo run:android`: `app/.env` (Expo CLI wczytuje go przed ewaluacją
 *   konfiguracji, a zmienne bez prefiksu `EXPO_PUBLIC_` do bundle'a nie trafiają);
 * - `eas build --profile development`: `eas.json` → build.development.env;
 * - `eas build --profile production` i `npm run update:prod`: `eas.json` →
 *   build.production.env mówi JAWNIE `production`, bo zmienne procesu wygrywają z `.env` -
 *   inaczej OTA eksportowane na komputerze z `APP_VARIANT=development` w `.env` niosłoby
 *   w manifeście nazwę i pakiet wariantu deweloperskiego.
 * Każda inna wartość (albo brak) znaczy produkcję: wariant deweloperski trzeba wybrać
 * świadomie, a literówka nie ma prawa zbudować pakietu o dziwnej nazwie.
 */

'use strict';

/** Wartość `APP_VARIANT`, która włącza wariant deweloperski. */
const DEVELOPMENT_VARIANT = 'development';

/** Sufiks pakietu Android wariantu deweloperskiego: `com.ninerdeck.app` → `com.ninerdeck.app.dev`. */
const DEV_PACKAGE_SUFFIX = '.dev';

/** Dopisek do nazwy aplikacji na ekranie telefonu, żeby dwie ikony dało się odróżnić. */
const DEV_NAME_SUFFIX = ' Dev';

/**
 * @param {Record<string, string | undefined> | undefined} env zmienne środowiska (`process.env`)
 * @returns {boolean}
 */
function isDevelopmentVariant(env) {
  return env != null && env.APP_VARIANT === DEVELOPMENT_VARIANT;
}

/**
 * Pakiet wariantu deweloperskiego dla pakietu bazowego.
 * @param {string} basePackage
 * @returns {string}
 */
function devPackage(basePackage) {
  return `${basePackage}${DEV_PACKAGE_SUFFIX}`;
}

/**
 * Konfiguracja Expo dla bieżącego wariantu. Poza wariantem deweloperskim oddaje bazę
 * BEZ ZMIAN (ten sam obiekt), więc produkcja nie zależy od tego modułu w niczym.
 *
 * W wariancie deweloperskim zmieniają się DOKŁADNIE trzy rzeczy: nazwa, pakiet Android
 * i schemat adresu równy pakietowi (powrót z logowania Google składa się z
 * `Application.applicationId` - patrz `ui/hooks/useGoogleSignIn.ts`; schemat pakietu dev
 * stoi PIERWSZY, żeby istniał nawet wtedy, gdy baza go nie wymienia). Pozostałe schematy
 * (`ninerdeck`) zostają, wersja, `versionCode`, ikony i projekt EAS też - wariant to
 * ta sama aplikacja pod innym adresem, nie inna aplikacja.
 *
 * @param {Record<string, any>} base konfiguracja z `app.json` (klucz `expo`)
 * @param {Record<string, string | undefined> | undefined} env
 * @returns {Record<string, any>}
 */
function variantConfig(base, env) {
  if (!isDevelopmentVariant(env)) return base;
  const basePackage = base.android?.package;
  if (typeof basePackage !== 'string' || basePackage === '') {
    throw new Error(
      'app-variant: konfiguracja bazowa nie ma android.package - nie ma z czego złożyć pakietu dev',
    );
  }
  const pkg = devPackage(basePackage);
  const baseSchemes = Array.isArray(base.scheme) ? base.scheme : base.scheme == null ? [] : [base.scheme];
  return {
    ...base,
    name: `${base.name}${DEV_NAME_SUFFIX}`,
    scheme: [pkg, ...baseSchemes.filter((s) => s !== basePackage && s !== pkg)],
    android: { ...base.android, package: pkg },
  };
}

module.exports = {
  DEVELOPMENT_VARIANT,
  DEV_PACKAGE_SUFFIX,
  DEV_NAME_SUFFIX,
  isDevelopmentVariant,
  devPackage,
  variantConfig,
};
