/**
 * Barrel warstwy INFRASTRUKTURY (adaptery portów).
 *
 * Uwaga: `ExpoSqliteAdapter` NIE jest tu re-eksportowany celowo — import tego barrela
 * nie może wciągać modułu natywnego `expo-sqlite` (inaczej padłyby testy Node/Jest oraz
 * konteksty czysto-JS). Adapter SQLite importuj wprost:
 *   `import { ExpoSqliteAdapter } from '../infrastructure/storage/expoSqliteAdapter';`
 */

export * from './clock';
export * from './id';
export * from './createEventsRepo';
export * from './storage/inMemoryAdapter';
