/**
 * UZ Aero — bramka jakości śladu: KTÓRY punkt wchodzi do trasy i dlaczego nie.
 *
 * Detektor ma już `fixUsable` i ono jest tu źródłem prawdy — ten moduł nie wprowadza
 * własnych progów, tylko NAZYWA powód. Różnica jest wyłącznie w bogactwie odpowiedzi:
 * automatowi w locie wystarczy „użyteczny / nie", a ekranowi diagnostycznemu po locie
 * potrzebny jest powód do wpisania w kolumnę „Uwagi" (mockup A02c).
 *
 * Spójność obu funkcji pilnuje test — gdyby ktoś zmienił próg w jednym miejscu,
 * a w drugim nie, ślad przestałby pokazywać to, co naprawdę widział algorytm.
 */

import { fixUsable } from '../detection/flightDetector';
import { distanceM, METERS_PER_NM } from '../detection/geo';
import { GPS_THRESHOLDS, type GpsThresholds } from '../detection/thresholds';
import type { RawTrackEntry, TrackRejection } from './point';

/** Godzina w milisekundach — do przeliczenia skoku pozycji na prędkość implikowaną. */
const MS_PER_HOUR = 3_600_000;

/** Wpis śladu w postaci, jakiej oczekuje `fixUsable` (kontrakt `null` = brak pomiaru). */
function toFix(entry: RawTrackEntry) {
  return {
    time: entry.time,
    groundSpeedKt: entry.gs ?? null,
    altitudeFt: entry.alt ?? null,
    trackDeg: entry.trackDeg ?? null,
    lat: entry.lat ?? null,
    lon: entry.lon ?? null,
    accuracyM: entry.accuracyM ?? null,
  };
}

/**
 * Prędkość implikowana przez przeskok między dwoma odczytami (węzły).
 *
 * Ten sam test, którym detektor odsiewa teleportację (`flightDetector.ts` §plauzybilność).
 * Zwraca `null`, gdy odstęp czasu jest zerowy albo ujemny — dzielenie przez zero dałoby
 * nieskończoność i odrzuciłoby poprawny punkt tylko dlatego, że dwa fixy mają ten sam
 * znacznik czasu (zdarza się przy zapisie wsadowym).
 */
export function impliedSpeedKt(
  from: { lat: number; lon: number; time: number },
  to: { lat: number; lon: number; time: number },
): number | null {
  const dtMs = to.time - from.time;
  if (dtMs <= 0) return null;
  const meters = distanceM({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon });
  return (meters / METERS_PER_NM) * (MS_PER_HOUR / dtMs);
}

/**
 * Powód odrzucenia punktu albo `null`, gdy punkt jest dobry.
 *
 * @param previous ostatni PRZYJĘTY punkt — do testu skoku. Null przy pierwszym punkcie
 *   trasy: nie ma względem czego mierzyć przeskoku, więc test skoku się nie stosuje.
 */
export function rejectionReason(
  entry: RawTrackEntry,
  previous: { lat: number; lon: number; time: number } | null,
  thresholds: GpsThresholds = GPS_THRESHOLDS,
): TrackRejection | null {
  if (entry.lat == null || entry.lon == null) return 'no-position';

  // Kolejność ma znaczenie dla czytelności logu: najpierw to, co odbiornik sam o sobie
  // mówi (dokładność, prędkość), potem dopiero wniosek z porównania dwóch odczytów.
  if (entry.accuracyM != null && entry.accuracyM > thresholds.MAX_FIX_ACCURACY_M) {
    return 'accuracy';
  }
  if (entry.gs != null && entry.gs > thresholds.MAX_PLAUSIBLE_SPEED_KT) {
    return 'speed';
  }

  if (previous != null) {
    const implied = impliedSpeedKt(previous, {
      lat: entry.lat,
      lon: entry.lon,
      time: entry.time,
    });
    if (implied != null && implied > thresholds.MAX_PLAUSIBLE_SPEED_KT) return 'jump';
  }

  return null;
}

/**
 * Czy wpis przeszedłby bramkę DETEKTORA (bez testu skoku, który wymaga kontekstu).
 * Istnieje po to, żeby test spójności miał czego pilnować — patrz nagłówek modułu.
 */
export function entryUsableByDetector(
  entry: RawTrackEntry,
  thresholds: GpsThresholds = GPS_THRESHOLDS,
): boolean {
  return fixUsable(toFix(entry), thresholds);
}
