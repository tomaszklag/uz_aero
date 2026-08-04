/**
 * UZ Aero — adapter GPS na `expo-location`.
 *
 * Jedyne miejsce w kodzie, które wie o `expo-location`. Ma DWA źródła fixów za tym
 * samym fanoutem, więc odbiorcy (kokpit, diagnostyka na 13) nie widzą różnicy:
 *  - `watch` — `watchPositionAsync`, ekran włączony (domyślne),
 *  - `service` — usługa pierwszoplanowa z powiadomieniem (`startLocationUpdatesAsync`
 *    + task `uzaero-location`), gdy silnik pracuje: fixy płyną też przy wygaszonym
 *    ekranie, a usługa przeżywa śmierć procesu (wtedy pisze writer headless).
 * Trybem steruje `setBackgroundMode` (spoina UI na zboczach `engineRunning`).
 *
 * Czas fixa pochodzi z **GPS-a, nie z zegara telefonu** (§4.5: zegar telefonu bywa
 * przestawiony, a czasy blokowe muszą być wiarygodne offline).
 *
 * UWAGA: modułu natywnego nie wolno wciągać do barrela infrastruktury — importuj wprost.
 */

import * as Location from 'expo-location';
import { AppState } from 'react-native';

import type { GpsFix } from '../../domain';
import type { GpsListener, GpsPermission, GpsPort } from '../../application/ports';
import { BACKGROUND_LOCATION_TASK, setBackgroundFixSink } from './backgroundLocationTask';
import { serviceCommand, type GpsSourceMode } from './backgroundModePolicy';
import { GpsFanout } from './gpsFanout';
// Konwersja odczyt→fix (i kontrakt null-nie-zero z 2026-07-30) mieszka w czystym
// module — współdzielą ją watchPositionAsync i task usługi tła.
import { locationToFix } from './locationToFix';

/** Odstęp odczytów: 1 s — tyle zakłada algorytm detekcji (progi w sekundach, §3.3). */
const INTERVAL_MS = 1000;

/**
 * Opcje usługi pierwszoplanowej — kadencja IDENTYCZNA jak w trybie watch (progi
 * detekcji liczą w sekundach). BEZ `deferredUpdates*`: dosyłka paczkami tworzyłaby
 * ciszę > `GPS_STALE_SEC` (watchdog zrywałby nasłuch) i przerwy > `MAX_FIX_GAP_SEC`
 * (detektor zerowałby kandydatów).
 */
const SERVICE_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: INTERVAL_MS,
  distanceInterval: 0,
  foregroundService: {
    notificationTitle: 'UZ Aero — rejestracja lotu',
    notificationBody: 'Zapis śladu GPS trwa (silnik pracuje).',
    // `--green` z design systemu — powiadomienie to przyrząd stanu, nie ozdoba.
    notificationColor: '#2ECC71',
    // Usługa przeżywa śmierć procesu: Android wskrzesza ją headless i fixy dalej
    // trafiają do śladu (writer headless) zamiast lecieć w próżnię.
    killServiceOnDestroy: false,
  },
};

export class ExpoLocationAdapter implements GpsPort {
  private readonly fanout = new GpsFanout();
  private subscription: Location.LocationSubscription | null = null;
  /** Trwające otwieranie subskrypcji — dwaj odbiorcy naraz nie mogą jej otworzyć dwa razy. */
  private opening: Promise<void> | null = null;
  private last: GpsFix | null = null;
  private mode: GpsSourceMode = 'watch';
  /** Uzbrojenie usługi nie wyszło (np. aplikacja w tle) — ponowimy przy `active`. */
  private rearmPending = false;
  /**
   * Usługa TWARDO nie wstała (stary dev client bez task-managera, Expo Go na
   * Androidzie). Wtedy tryb `service` degraduje do zwykłego nasłuchu — pilot nie
   * może zostać bez GPS przy włączonym ekranie tylko dlatego, że tło jest
   * niedostępne. Flaga otwiera `open()` mimo trybu `service`.
   */
  private serviceUnavailable = false;

  constructor() {
    // Adapter jest żywym odbiorcą taska usługi: fixy z tła płyną tym samym fanoutem,
    // którym płynęły z watchPositionAsync — kokpit, detekcja i 13 nie widzą różnicy.
    setBackgroundFixSink((fixes) => {
      for (const fix of fixes) {
        this.last = fix;
        this.fanout.emit(fix);
      }
    });
    // Jedyny moment, w którym wolno dokończyć odroczone uzbrojenie (zakaz startu
    // usługi pierwszoplanowej z tła). Adapter żyje przez cały czas życia aplikacji —
    // subskrypcji nie zdejmujemy.
    AppState.addEventListener('change', (state) => {
      if (state === 'active' && this.rearmPending) void this.armService();
    });
  }

  async requestPermission(): Promise<GpsPermission> {
    // Wystarcza „podczas używania": śledzenie przy wygaszonym ekranie zapewnia usługa
    // pierwszoplanowa (`SERVICE_OPTIONS.foregroundService`), której Android nie każe
    // mieć uprawnienia „w tle". Dawna miękka prośba o tło odpadła celowo — na
    // Androidzie 11+ była wycieczką pilota do ustawień systemowych bez żadnej korzyści.
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) {
      return foreground.canAskAgain ? 'undetermined' : 'denied';
    }
    return 'granted';
  }

  /**
   * Każde wywołanie to OSOBNA subskrypcja odbiorcy nad jedną subskrypcją systemową.
   * Zwrócona funkcja wypisuje wyłącznie tego odbiorcę; odbiornik gaśnie dopiero,
   * gdy zejdzie ostatni (patrz `GpsFanout` — kokpit i diagnostyka słuchają naraz).
   *
   * W trybie `service` dołączenie odbiorcy NIE otwiera watcha — fixy przynosi task
   * usługi; `armService` jest idempotentne (adopcja przez `hasStarted...`), więc
   * watchdogowa odbudowa nasłuchu z `useFlightDetection` nie gasi i nie restartuje
   * usługi.
   */
  async start(listener: GpsListener): Promise<() => void> {
    this.fanout.add(listener);
    if (this.mode === 'service') await this.armService();
    else await this.open();
    return () => this.release(listener);
  }

  /**
   * Przełącznik źródła (kontrakt portu: nigdy nie odrzuca).
   *
   * Wejście w tryb usługi zamyka watch PRZED jej startem — na przełączce wolimy
   * lukę 1–2 s niż dublet (fix o cofniętym czasie i tak odpada w `pushFix`,
   * a `replay.ts` sortuje po czasie). Wyjście sprząta usługę (także osieroconą
   * po poprzednim życiu procesu) i wraca do watcha, jeśli ktoś jeszcze słucha.
   */
  async setBackgroundMode(enabled: boolean): Promise<void> {
    this.mode = enabled ? 'service' : 'watch';
    if (enabled) {
      this.closeWatch();
      await this.armService();
      return;
    }
    this.rearmPending = false;
    // Czysty stan na następny cykl silnika — niedostępność usługi nie jest wieczna
    // (użytkownik mógł w międzyczasie przebudować dev client).
    this.serviceUnavailable = false;
    await this.disarmService();
    if (!this.fanout.empty) await this.open();
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
    // Ktoś mógł dołączyć w międzyczasie — wtedy odbiornik zostaje. Dotyczy WYŁĄCZNIE
    // subskrypcji watch: usługą rządzi `setBackgroundMode` (zbocza `engineRunning`),
    // nie liczba słuchaczy — przy wygaszonym ekranie bywa zero, a zapis ma trwać.
    if (!this.fanout.empty) return;
    this.subscription?.remove();
    this.subscription = null;
  }

  /**
   * Zamyka watch na przełączce w tryb usługi. Osobne od `closeIfIdle`, bo tu
   * słuchacze ZOSTAJĄ (przejmuje ich task) — zamykamy źródło, nie odbiorców.
   */
  private closeWatch(): void {
    if (this.opening != null) {
      // Subskrypcja właśnie wstaje — dokończenie zamknięcia po jej otwarciu
      // (ten sam wzorzec co w `release`).
      void this.opening.then(
        () => {
          if (this.mode === 'service') {
            this.subscription?.remove();
            this.subscription = null;
          }
        },
        () => undefined,
      );
      return;
    }
    this.subscription?.remove();
    this.subscription = null;
  }

  /**
   * Uzbraja usługę wg czystej polityki (`backgroundModePolicy`). Idempotentne:
   * działającą usługę ADOPTUJE (zero mrugnięć powiadomieniem po headless-restarcie).
   * Każde niepowodzenie kończy się `rearmPending` — nigdy wyjątkiem w górę.
   */
  private async armService(): Promise<void> {
    try {
      const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      const cmd = serviceCommand({
        desired: this.mode,
        started,
        appActive: AppState.currentState === 'active',
      });
      if (cmd === 'start') {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, SERVICE_OPTIONS);
      }
      this.rearmPending = cmd === 'retry-later';
      if (this.mode === 'service' && (cmd === 'start' || cmd === 'none')) {
        // Usługa stoi — fallbackowy watch (jeśli zdążył wstać) schodzi, żeby nie
        // dublować fixów; wcześniejsza niedostępność przestaje obowiązywać.
        this.serviceUnavailable = false;
        this.closeWatch();
      }
    } catch {
      // Np. `ForegroundServiceStartNotAllowed` (wyścig z przejściem w tło), stary
      // dev client bez task-managera albo Expo Go — ponowimy przy `active`, o ile
      // tryb wciąż chce, a DO TEGO CZASU pilot dostaje zwykły nasłuch: usługa jest
      // ulepszeniem (ekran wygaszony), nie warunkiem działania GPS (§4.1).
      this.rearmPending = this.mode === 'service';
      if (this.mode === 'service') {
        this.serviceUnavailable = true;
        if (!this.fanout.empty) await this.open();
      }
    }
  }

  private async disarmService(): Promise<void> {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {
      // Brak task-managera w starym dev clencie nie może wywrócić aplikacji.
    }
  }

  private async open(): Promise<void> {
    // W trybie usługi fixy przynosi task — watch zostaje zamknięty. Wyjątek:
    // usługa twardo niedostępna → watch jest jedynym źródłem (degradacja).
    if (this.mode === 'service' && !this.serviceUnavailable) return;
    if (this.subscription != null) return;
    this.opening ??= Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: INTERVAL_MS,
        distanceInterval: 0,
      },
      (loc) => {
        const fix = locationToFix(loc);
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
