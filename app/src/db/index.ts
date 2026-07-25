/**
 * Barrel warstwy danych.
 *
 * Uwaga: `ExpoSqliteAdapter` NIE jest tu re-eksportowany celowo — import tego barrela
 * nie może wciągać modułu natywnego `expo-sqlite` (inaczej padłyby testy Node/Jest oraz
 * konteksty czysto-JS). Adapter SQLite importuj wprost:
 *   `import { ExpoSqliteAdapter } from '../db/expoSqliteAdapter';`
 */

export * from './storageAdapter';
export * from './eventsRepo';
