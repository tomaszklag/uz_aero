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
import { GpsFanout } from './gpsFanout';

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
  private readonly fanout = new GpsFanout();
  private subscription: Location.LocationSubscription | null = null;
  /** Trwające otwieranie subskrypcji — dwaj odbiorcy naraz nie mogą jej otworzyć dwa razy. */
  private opening: Promise<void> | null = null;
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

  /**
   * Każde wywołanie to OSOBNA subskrypcja odbiorcy nad jedną subskrypcją systemową.
   * Zwrócona funkcja wypisuje wyłącznie tego odbiorcę; odbiornik gaśnie dopiero,
   * gdy zejdzie ostatni (patrz `GpsFanout` — kokpit i diagnostyka słuchają naraz).
   */
  async start(listener: GpsListener): Promise<() => void> {
    this.fanout.add(listener);
    await this.open();
    return () => this.release(listener);
  }

  lastFix(): GpsFix | null {
    return this.last;
  }

  /**
   * Wypisanie ostatniego odbiorcy gasi odbiornik NATYCHMIAST, jeszcze w tym samym takcie.
   * To nie jest mikrooptymalizacja: hook detekcji odbudowuje nasłuch przez `stop()` →
   * `start()`, żeby zerwać ewentualną martwą subskrypcję systemową. Gdyby zamknięcie
   * czekało na mikrozadanie, nowy `start()` zdążyłby zastać starą subskrypcję na miejscu,
   * uznać, że wszystko stoi, i odbudowa nie odbudowałaby niczego.
   */
  private release(listener: GpsListener): void {
    if (!this.fanout.remove(listener)) return;
    if (this.opening != null) {
      // Subskrypcja jeszcze wstaje — nie ma czego zdejmować; dokończy ją `open()`,
      // który po fakcie sprawdzi, że nikt już nie słucha.
      void this.opening.then(
        () => this.closeIfIdle(),
        () => undefined,
      );
      return;
    }
    this.closeIfIdle();
  }

  private closeIfIdle(): void {
    // Ktoś mógł dołączyć w międzyczasie — wtedy odbiornik zostaje.
    if (!this.fanout.empty) return;
    this.subscription?.remove();
    this.subscription = null;
  }

  private async open(): Promise<void> {
    if (this.subscription != null) return;
    this.opening ??= Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: INTERVAL_MS,
        distanceInterval: 0,
      },
      (loc) => {
        const fix = toFix(loc);
        this.last = fix;
        this.fanout.emit(fix);
      },
    )
      .then((subscription) => {
        this.subscription = subscription;
      })
      .finally(() => {
        this.opening = null;
      });
    await this.opening;
    // Odbiorca mógł wypisać się, zanim subskrypcja wstała — wtedy nikt jej nie zamknie.
    this.closeIfIdle();
  }
}
