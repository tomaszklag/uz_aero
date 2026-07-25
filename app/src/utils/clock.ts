/**
 * UZ Aero — zegar zdarzeń: dwa niezależne czasy (docs/_main.md.txt §4.1 pkt 6, §4.5).
 *
 * Każde zdarzenie niesie `deviceTime` (zegar telefonu) i `gpsTime` (czas z fixa GPS).
 * GPS jest niezależny od sieci i ustawień telefonu — serwer po nim wykrywa przestawiony
 * zegar (flaga CLOCK_DRIFT). Ten moduł jest jedynym miejscem, które „stempluje" czas.
 *
 * Zakres Fazy 1 (warstwa danych): interfejs + zaślepka. Realny GPS (expo-location)
 * podłączymy później przez `DeviceClock.setGpsFix(...)` w hooku lokalizacji — tu NIE
 * importujemy expo-location, żeby moduł działał w Node/Jest.
 */

import type { EpochMillis } from '../types/time';

/** Źródło obu czasów zdarzenia. Wstrzykiwane do `EventsRepo` (testowalność). */
export interface Clock {
  /** Zegar telefonu (UTC, epoch ms). */
  now(): EpochMillis;
  /** Czas ostatniego świeżego fixa GPS (UTC, epoch ms) — null gdy brak/nieświeży. */
  gpsTime(): EpochMillis | null;
}

/**
 * Zegar produkcyjny. `now()` = `Date.now()`. `gpsTime()` zwraca surowy czas ostatniego
 * fixa, o ile jest świeży (młodszy niż `maxAgeMs`) — inaczej null. NIE ekstrapolujemy
 * czasu GPS zegarem urządzenia (to zniweczyłoby niezależność obu zegarów); brak świeżego
 * fixa = uczciwy null.
 *
 * Hook lokalizacji woła `setGpsFix(fix.timestamp)` przy każdym odczycie GPS.
 */
export class DeviceClock implements Clock {
  private lastGpsMs: EpochMillis | null = null;
  private lastFixDeviceMs: EpochMillis | null = null;

  /** Maksymalny wiek fixa uznawanego za „teraz" (ms). Do kalibracji z pilotami. */
  constructor(private readonly maxAgeMs: number = 10_000) {}

  now(): EpochMillis {
    return Date.now();
  }

  gpsTime(): EpochMillis | null {
    if (this.lastGpsMs == null || this.lastFixDeviceMs == null) return null;
    if (Date.now() - this.lastFixDeviceMs > this.maxAgeMs) return null;
    return this.lastGpsMs;
  }

  /**
   * Zapisuje nowy fix GPS.
   * @param gpsTimeMs        czas z fixa (UTC, epoch ms)
   * @param capturedAtDevice zegar telefonu w chwili odbioru fixa (domyślnie `Date.now()`)
   */
  setGpsFix(gpsTimeMs: EpochMillis, capturedAtDevice: EpochMillis = Date.now()): void {
    this.lastGpsMs = gpsTimeMs;
    this.lastFixDeviceMs = capturedAtDevice;
  }

  /** Kasuje ostatni fix (np. gdy GPS zgubił sygnał). */
  clearGpsFix(): void {
    this.lastGpsMs = null;
    this.lastFixDeviceMs = null;
  }
}

/**
 * Zegar deterministyczny do testów. `now()` można krokować `advance()`.
 * `gpsTime()` zwraca ustaloną wartość (null = brak fixa).
 */
export class FixedClock implements Clock {
  constructor(
    private current: EpochMillis,
    private gps: EpochMillis | null = null,
  ) {}

  now(): EpochMillis {
    return this.current;
  }

  gpsTime(): EpochMillis | null {
    return this.gps;
  }

  /** Ustawia „teraz" na konkretną wartość. */
  set(now: EpochMillis): void {
    this.current = now;
  }

  /** Przesuwa „teraz" o `ms` i zwraca nową wartość. */
  advance(ms: number): EpochMillis {
    this.current += ms;
    return this.current;
  }

  /** Ustawia czas GPS zwracany przez `gpsTime()`. */
  setGps(gps: EpochMillis | null): void {
    this.gps = gps;
  }
}

/** Domyślny zegar aplikacji (singleton). Hook GPS woła `defaultClock.setGpsFix(...)`. */
export const defaultClock = new DeviceClock();
