/**
 * UZ Aero - reprezentacja czasu w warstwie danych.
 *
 * Cała aplikacja liczy w UTC (CLAUDE.md: „UTC jest domyślnym czasem wszędzie").
 * Wewnętrznie czas trzymamy jako **epoch milliseconds** (liczba) - reprezentacja
 * z natury niezależna od strefy, trywialna w arytmetyce projekcji (block time =
 * różnica dwóch znaczników), sortowalna i wprost mapowalna na kolumnę SQLite INTEGER.
 * Formatowanie na LT/UTC do wyświetlenia robi warstwa UI (dayjs) - nie ten moduł.
 */

/** Znacznik czasu jako epoch milliseconds (UTC). `Date.now()` zwraca dokładnie to. */
export type EpochMillis = number;
