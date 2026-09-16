/**
 * Ninerdeck - WYDANIE I URZĄDZENIE dla zgłoszenia błędu (issue #87).
 *
 * Jedyne miejsce w reporterze, które pyta React Native o cokolwiek - dzięki temu
 * `bugContext.ts` zostaje czysty i testowalny bez telefonu (testy aplikacji jadą
 * w Node, bez RN - patrz `jest.config.js`).
 *
 * ══ JEDNO ŹRÓDŁO WERSJI (decyzja 2026-09-06, faza testów) ══
 * Wersja idzie z `infrastructure/release/nativeRelease.ts` - z ZAINSTALOWANEGO pakietu
 * przez `expo-application` - i jest TYM SAMYM napisem „1.0.0 (build 1)", który pilot
 * czyta w karcie „O aplikacji" (13). Do tej pory zgłoszenie importowało `app.json`,
 * a ekran czytał `Constants.expoConfig`: dwa źródła, oba konfiguracyjne, żadne nie znało
 * numeru builda - a tester porównujący zgłoszenie z ekranem mógł dostać dwa różne napisy.
 * `null` = wydania nie znamy (Expo Go opisuje siebie): wiersz „Aplikacja" wtedy nie
 * powstaje, tak jak nie powstają wiersze operacji bez operacji.
 *
 * ══ WYDANIE BINARKI TO NIE WYDANIE KODU (2026-09-07) ══
 * Po włączeniu EAS Update `appVersion` opisuje APK, a nie działający bundle JS.
 * Dlatego obok niego jedzie `updateId` z `infrastructure/release/otaUpdate.ts` -
 * bez tego każde zgłoszenie po pierwszej aktualizacji byłoby nierozróżnialne od
 * zgłoszenia sprzed niej, a to jest cała wartość tego modułu w fazie testów.
 *
 * ══ BEZ INNYCH ZALEŻNOŚCI ══
 * `expo-device` dałoby ładniejsze pola urządzenia, ale projekt nie dokłada modułów
 * natywnych dla wygody (ta sama reguła, przez którą mapa śladu ma własny renderer,
 * a ikony jadą fontem). Model i wersja systemu wychodzą z `Platform`, które już mamy.
 */

import { Platform } from 'react-native';

import { appRelease } from '../../../infrastructure/release/nativeRelease';
import { otaUpdate } from '../../../infrastructure/release/otaUpdate';
import { SCHEMA_VERSION } from '../../../infrastructure/storage/schema';
import { releaseLabel } from '../../screens/logic/appVersion';
import type { BugRelease } from './bugContext';

/**
 * `Platform.constants` niesie na Androidzie `Model` i `Release`, na iOS `osVersion`.
 * Typ jest w RN celowo szeroki (kształt zależy od systemu), więc czytamy go ostrożnie -
 * brakujące pole ma dać `null`, a nie wywrócić arkusz zgłoszenia.
 */
function constant(key: string): string | null {
  const bag = Platform.constants as unknown as Record<string, unknown> | undefined;
  const value = bag?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function deviceRelease(): BugRelease {
  const release = appRelease();
  const update = otaUpdate();
  return {
    appVersion: release == null ? null : releaseLabel(release),
    platform: Platform.OS,
    // Na Androidzie `Platform.Version` to poziom API (liczba), a `Release` - wersja
    // widoczna dla człowieka („14"). Bierzemy tę drugą, a poziom API zostawiamy:
    // zgłoszenie ma być czytelne, a nie kompletne.
    osVersion: constant('Release') ?? constant('osVersion') ?? String(Platform.Version),
    deviceModel: constant('Model') ?? constant('systemName'),
    schemaVersion: SCHEMA_VERSION,
    // `embedded` nie jedzie osobno: pusty `updateId` znaczy dokładnie to samo,
    // a dwa pola o jednym fakcie rozjeżdżają się przy pierwszej zmianie.
    updateId: update?.embedded === false ? update.updateId : null,
    updateChannel: update?.channel ?? null,
  };
}
