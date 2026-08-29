/**
 * UZ Aero - ADAPTERY zegara (`ClockPort`): dwa niezależne czasy (§4.1 pkt 6, §4.5).
 *
 * Każde zdarzenie niesie `deviceTime` (zegar telefonu) i `gpsTime` (czas z fixa GPS).
 * GPS jest niezależny od sieci i ustawień telefonu - serwer po nim wykrywa przestawiony
 * zegar (flaga CLOCK_DRIFT). Ten moduł jest jedynym miejscem, które „stempluje" czas.
 *
 * Realny GPS (expo-location) podłączymy przez `DeviceClock.setGpsFix(...)` w hooku
 * lokalizacji - tu NIE importujemy expo-location, żeby moduł działał też w Node/Jest.
 */

import type { EpochMillis } from '../domain';
import type { ClockPort } from '../application/ports';

/**
 * Zegar produkcyjny. `now()` = `Date.now()`. `gpsTime()` zwraca surowy czas ostatniego
 * fixa, o ile jest świeży (młodszy niż `maxAgeMs`) - inaczej null. NIE ekstrapolujemy
 * czasu GPS zegarem urządzenia (to zniweczyłoby niezależność obu zegarów); brak świeżego
 * fixa = uczciwy null.
 *
 * Hook lokalizacji woła `setGpsFix(fix.timestamp)` przy każdym odczycie GPS.
 */
export class DeviceClock implements ClockPort {
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
export class FixedClock implements ClockPort {
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
