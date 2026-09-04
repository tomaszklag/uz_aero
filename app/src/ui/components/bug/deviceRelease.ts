/**
 * UZ Aero - WYDANIE I URZĄDZENIE dla zgłoszenia błędu (issue #87).
 *
 * Jedyne miejsce w reporterze, które pyta React Native o cokolwiek - dzięki temu
 * `bugContext.ts` zostaje czysty i testowalny bez telefonu (testy aplikacji jadą
 * w Node, bez RN - patrz `jest.config.js`).
 *
 * ══ BEZ NOWYCH ZALEŻNOŚCI ══
 * `expo-constants`, `expo-device` i `expo-application` dałyby ładniejsze pola, ale
 * projekt nie dokłada modułów natywnych dla wygody (ta sama reguła, przez którą mapa
 * śladu ma własny renderer, a ikony jadą fontem). Wszystko poniżej wychodzi z rzeczy,
 * które już mamy: `Platform` z RN i `app.json`, czyli plik konfiguracji budowany razem
 * z aplikacją.
 */

import { Platform } from 'react-native';

import { SCHEMA_VERSION } from '../../../infrastructure/storage/schema';
import type { BugRelease } from './bugContext';

// Konfiguracja Expo - `version` jest tym samym numerem, który widać w sklepie i w EAS.
// Import JSON-a, bo to statyczny fakt o buildzie, a nie odczyt z systemu.
import appConfig from '../../../../app.json';

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
  const version = appConfig?.expo?.version ?? null;
  return {
    appVersion: version,
    platform: Platform.OS,
    // Na Androidzie `Platform.Version` to poziom API (liczba), a `Release` - wersja
    // widoczna dla człowieka („14"). Bierzemy tę drugą, a poziom API zostawiamy:
    // zgłoszenie ma być czytelne, a nie kompletne.
    osVersion: constant('Release') ?? constant('osVersion') ?? String(Platform.Version),
    deviceModel: constant('Model') ?? constant('systemName'),
    schemaVersion: SCHEMA_VERSION,
  };
}
