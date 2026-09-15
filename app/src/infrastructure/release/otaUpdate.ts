/**
 * Ninerdeck - WYDANIE JS: która aktualizacja OTA naprawdę działa (2026-09-07).
 *
 * JEDYNE miejsce, które importuje `expo-updates` (exact-list w `architecture.test.ts`) -
 * ta sama reguła, co przy `expo-application` w `nativeRelease.ts` i z tego samego
 * powodu: dwa importy znaczyłyby dwa źródła prawdy o tym, co stoi na telefonie.
 *
 * ══ PO CO TO ISTNIEJE ══
 * `nativeRelease.ts` czyta wersję z PAKIETU - i po włączeniu EAS Update ta wersja
 * przestaje wystarczać. Aktualizacja OTA podmienia bundle JS, nie podmieniając APK,
 * więc dziesięć różnych wydań kodu opisze się tym samym napisem „1.1.0 (build 2)".
 * W fazie testów z pilotami to jest realna strata: przychodzi zgłoszenie błędu
 * i nie wiadomo, którą wersję kodu tester miał na ekranie.
 *
 * `updateId` to identyfikator KONKRETNEGO bundle'a nadany przez EAS - z niego da się
 * odtworzyć, co dokładnie działało w chwili zgłoszenia.
 *
 * ══ GDZIE TO TRAFIA, A GDZIE NIE ══
 * WYŁĄCZNIE do kontekstu zgłoszenia błędu, obok wersji schematu bazy i stanu kolejki -
 * czyli tam, gdzie i tak jadą fakty techniczne dla tego, kto błąd naprawia. Na kartę
 * „O aplikacji" (13) to NIE wchodzi: identyfikator aktualizacji jest opisem wewnętrznej
 * budowy aplikacji, a takie napisy issue #72 i #43 z ekranów wyrzucały. Pilot czyta
 * „1.1.0 (build 2)" i to jest cała odpowiedź, jakiej potrzebuje.
 *
 * ══ KIEDY NIE MA CZEGO CZYTAĆ ══
 * W Expo Go i w dev clientcie aktualizacje są wyłączone (`isEnabled === false`),
 * a w świeżo zainstalowanym APK działa bundle wbudowany - wtedy `updateId` jest pusty.
 * Zwracamy `null` zamiast zmyślonej wartości: brak aktualizacji to fakt, nie brak danych.
 */

import * as Updates from 'expo-updates';

export interface OtaUpdate {
  /**
   * Identyfikator bundle'a nadany przez EAS. `null` = działa bundle WBUDOWANY w APK,
   * czyli żadna aktualizacja jeszcze nie weszła - i to też jest odpowiedź.
   */
  updateId: string | null;
  /** Kanał aktualizacji z `eas.json` (`production` / `development`). */
  channel: string | null;
  /** Czy działa bundle wbudowany w binarkę (a nie pobrany). */
  embedded: boolean;
}

/** Fakty o działającym bundle'u albo `null`, gdy aktualizacje są wyłączone. */
export function otaUpdate(): OtaUpdate | null {
  if (!Updates.isEnabled) return null;
  return {
    updateId: Updates.updateId,
    channel: Updates.channel,
    embedded: Updates.isEmbeddedLaunch,
  };
}
