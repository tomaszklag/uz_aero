/**
 * Barrel warstwy INFRASTRUKTURY (adaptery portów).
 *
 * Uwaga: adaptery modułów NATYWNYCH nie są tu re-eksportowane celowo - import tego
 * barrela nie może wciągać `expo-sqlite` ani `expo-location` (inaczej padłyby testy
 * Node/Jest oraz konteksty czysto-JS). Importuj je wprost:
 *   `import { ExpoSqliteAdapter } from './storage/expoSqliteAdapter';`
 *   `import { ExpoLocationAdapter } from './gps/expoLocationAdapter';`
 */

export * from './clock';
export * from './id';
export * from './createEventsRepo';
export * from './storage/inMemoryAdapter';
export * from './gps/replayGpsAdapter';
// Czyste klasy (magazyn wstrzykiwany) - AsyncStorage podaje wołający, barrel go nie wciąga.
export * from './prefs/themePrefsStore';
export * from './prefs/taskMemoryStore';
