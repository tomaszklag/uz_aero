/**
 * UZ Aero — port GPS.
 *
 * Aplikacja potrzebuje strumienia fixów; nie obchodzi jej, czy pochodzą z `expo-location`,
 * z odtworzenia zapisu lotu, czy z testu. Dzięki temu detekcję i ekrany da się sprawdzić
 * w Node, bez urządzenia i bez czekania, aż samolot wystartuje.
 */

import type { GpsFix } from '../../domain';

/** Odbiorca kolejnych fixów. */
export type GpsListener = (fix: GpsFix) => void;

/** Stan uprawnień — pilot może odmówić dostępu do lokalizacji. */
export type GpsPermission = 'granted' | 'denied' | 'undetermined';

export interface GpsPort {
  /**
   * Prosi o uprawnienia (w tym „w tle", bo GPS musi działać przy wygaszonym ekranie —
   * §8 wymienia zabicie procesu przez Androida jako ryzyko 🔴).
   */
  requestPermission(): Promise<GpsPermission>;

  /**
   * Rozpoczyna nasłuch. Zwraca funkcję zatrzymującą — wołający odpowiada za sprzątanie.
   *
   * Każde wywołanie to OSOBNA subskrypcja tego odbiorcy, a zwrócona funkcja wypisuje
   * wyłącznie jego. Odbiornik pracuje, dopóki został choć jeden słuchacz. Kontrakt jest
   * tu twardy, bo w kokpicie słuchają dwa ekrany naraz (autodetekcja i diagnostyka GPS
   * na 13) — port, który pozwalał drugiemu wołającemu przejąć albo zgasić strumień
   * pierwszemu, zabierał autodetekcję na resztę dnia lotnego.
   */
  start(listener: GpsListener): Promise<() => void>;

  /** Ostatni znany fix (np. do stempla `gpsTime` przy zdarzeniu) lub null. */
  lastFix(): GpsFix | null;
}
