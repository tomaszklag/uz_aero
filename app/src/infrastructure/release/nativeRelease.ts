/**
 * Ninerdeck - WYDANIE BINARKI: wersja i numer builda z zainstalowanego pakietu.
 *
 * JEDYNE miejsce, które importuje `expo-application` (exact-list w `architecture.test.ts`),
 * i JEDYNE źródło wersji w aplikacji: czyta z niego karta „O aplikacji" (13) i zgłoszenie
 * błędu (`deviceRelease.ts`). Sam plik zbiera FAKTY - decyzję „czy to nasza binarka"
 * podejmuje czysty `ownRelease.ts`, a napis składa `ui/screens/logic/appVersion.ts`.
 *
 * ══ DLACZEGO PAKIET, A NIE KONFIGURACJA (decyzja 2026-09-06) ══
 * Do tej pory wersję niosły DWA źródła i oba czytały konfigurację, nie binarkę:
 * `Constants.expoConfig.version` na ekranie 13 oraz import `app.json` w zgłoszeniu
 * błędu. Konfiguracja nie zna numeru builda (`versionCode` wchodzi do APK przy budowie),
 * a wydania w `docs/CHANGELOG.md` i na stronie opisują się jako „wersja (build N)" -
 * tester musi umieć odczytać z telefonu DOKŁADNIE ten napis. `expo-application` czyta
 * versionName i versionCode z pakietu, który naprawdę stoi na urządzeniu.
 *
 * Moduł należy do Expo SDK i nie ma pluginu konfiguracji; ta sama biblioteka wchodziła
 * już do bundle'a z `expo-auth-session`, więc dołożenie jej do zależności nie jest
 * nową zależnością natywną w sensie reguły „bez modułów natywnych dla wygody".
 *
 * ══ EXPO GO ══
 * Tam `expo-application` opisuje Expo Go - stąd `applicationId` obok wersji i wzorzec
 * z `app.json`; porównanie robi `ownRelease`, a ekran pokazuje kreskę.
 */

import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { ownRelease, type AppRelease } from './ownRelease';

// Konfiguracja Expo - `android.package` to identyfikator, który prebuild wpisuje do APK.
// Import JSON-a, bo to statyczny fakt o buildzie, a nie odczyt z systemu.
import appConfig from '../../../app.json';

/**
 * Pakiet, którego się spodziewamy na bieżącej platformie. Projekt buduje wyłącznie
 * Android; `app.json` nie niesie `ios.bundleIdentifier`, więc poza Androidem wzorca
 * nie ma i `ownRelease` ufa binarce.
 */
function ownApplicationId(): string | null {
  if (Platform.OS !== 'android') return null;
  return appConfig?.expo?.android?.package ?? null;
}

/** Wydanie NASZEJ aplikacji albo `null` (Expo Go, web, brak danych). */
export function appRelease(): AppRelease | null {
  return ownRelease({
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
    applicationId: Application.applicationId,
    ownApplicationId: ownApplicationId(),
  });
}
