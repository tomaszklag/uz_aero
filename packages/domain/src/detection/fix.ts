/**
 * UZ Aero - pojedynczy odczyt GPS w postaci, jakiej potrzebuje detekcja.
 *
 * Wydzielony z automatu, bo czytają go teraz wszystkie moduły detekcji, a automat
 * czyta je wszystkie - wspólny typ w pliku automatu robił cykl importów.
 *
 * KONTRAKT PÓL NIEZNANYCH (poprawka audytu 2026-07-30): `null` znaczy „odbiornik nie
 * podał", nigdy „wartość wynosi zero". Adapter długo mapował brakującą prędkość na
 * `0` i to była realna przyczyna spóźnionego wykrywania kołowania: Android przy małych
 * prędkościach albo nie podaje prędkości w ogóle, albo zeruje ją filtrem static-hold
 * w układzie GNSS (żeby zaparkowany telefon nie dryfował po mapie). Detektor widział
 * wtedy „stoi" i miał rację co do liczby, a nie co do rzeczywistości. Teraz brak
 * prędkości jest jawny, a `trends.ts` odtwarza ją z przemieszczenia.
 */

import type { EpochMillis } from '../time';
import type { LatLon } from './geo';

export interface GpsFix {
  /** Czas fixa (UTC, epoch ms) - zegar GPS, nie telefonu (§4.5). */
  time: EpochMillis;
  /** Prędkość względem ziemi (węzły) z dopplera; `null` = odbiornik NIE PODAŁ. */
  groundSpeedKt: number | null;
  /** Wysokość (stopy AMSL); null gdy fix bez wysokości. */
  altitudeFt: number | null;
  /**
   * Kurs nad ziemią (stopnie 0–360). Odbiorniki podają go tylko powyżej pewnej
   * prędkości - na postoju bywa `null` albo losowy, i tak ma być: prędkość kątowa
   * z kursu ma sens wyłącznie w ruchu (`trends.ts` sam pilnuje kompletu danych).
   */
  trackDeg?: number | null;
  /** Pozycja i dokładność. */
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
}

/** Pozycja fixa albo null, gdy odczyt jej nie niesie. */
export function fixPosition(fix: GpsFix): LatLon | null {
  return fix.lat != null && fix.lon != null ? { lat: fix.lat, lon: fix.lon } : null;
}
