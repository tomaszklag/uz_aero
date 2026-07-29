/**
 * UZ Aero — adapter GPS na `expo-location`.
 *
 * Jedyne miejsce w kodzie, które wie o `expo-location`. Tłumaczy odczyt platformy na
 * `GpsFix` domeny: metry → stopy, m/s → węzły, i pilnuje, żeby czas fixa pochodził
 * z **GPS-a, nie z zegara telefonu** (§4.5: zegar telefonu bywa przestawiony, a czasy
 * blokowe muszą być wiarygodne offline).
 *
 * UWAGA: modułu natywnego nie wolno wciągać do barrela infrastruktury — importuj wprost.
 */

import * as Location from 'expo-location';

import type { GpsFix } from '../../domain';
import type { GpsListener, GpsPermission, GpsPort } from '../../application/ports';

const METERS_TO_FEET = 3.280839895;
const MPS_TO_KNOTS = 1.943844492;

/** Odstęp odczytów: 1 s — tyle zakłada algorytm detekcji (progi w sekundach, §3.3). */
const INTERVAL_MS = 1000;

/** Konwersja odczytu platformy na fix domeny. */
function toFix(loc: Location.LocationObject): GpsFix {
  const { coords, timestamp } = loc;
  return {
    // `timestamp` pochodzi z fixa, nie z zegara aplikacji — to jest ten „drugi zegar".
    time: timestamp,
    groundSpeedKt: Math.max(0, (coords.speed ?? 0) * MPS_TO_KNOTS),
    altitudeFt: coords.altitude == null ? null : coords.altitude * METERS_TO_FEET,
    // Pozycja i dokładność zasilają diagnostykę GPS (ekran 13) — detektor ich nie czyta.
    lat: coords.latitude,
    lon: coords.longitude,
    accuracyM: coords.accuracy ?? null,
  };
}

export class ExpoLocationAdapter implements GpsPort {
  private subscription: Location.LocationSubscription | null = null;
  private last: GpsFix | null = null;

  async requestPermission(): Promise<GpsPermission> {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) {
      return foreground.canAskAgain ? 'undetermined' : 'denied';
    }

    // Uprawnienie „w tle" jest miękkie: bez niego aplikacja nadal działa przy włączonym
    // ekranie, więc odmowa nie może blokować dnia lotnego (offline-first §4.1 — nic nie
    // blokuje pracy pilota). Śledzenie przy wygaszonym ekranie wymaga foreground service
    // (§8) — to osobny krok wdrożenia.
    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch {
      // Brak zgody na tło nie jest błędem krytycznym.
    }

    return 'granted';
  }

  async start(listener: GpsListener): Promise<() => void> {
    // Idempotencja: powtórny start nie mnoży subskrypcji.
    if (this.subscription) this.stop();

    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: INTERVAL_MS,
        distanceInterval: 0,
      },
      (loc) => {
        const fix = toFix(loc);
        this.last = fix;
        listener(fix);
      },
    );

    return () => this.stop();
  }

  lastFix(): GpsFix | null {
    return this.last;
  }

  private stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }
}
