/**
 * UZ Aero — spoina: GPS → automat detekcji → toast → komenda.
 *
 * Rozdział ról jest tu celowy i wynika z §3.2:
 *   • `GpsPort`         daje fixy (urządzenie albo odtworzenie trasy),
 *   • `stepDetector`    czysta domena: decyduje, CZY coś się wydarzyło,
 *   • ten hook          trzyma okno „COFNIJ" i dopiero po nim woła komendę,
 *   • ekran             tylko wyświetla to, co hook zwraca.
 *
 * Dzięki temu zdarzenie NIE powstaje w chwili detekcji. Gdyby powstawało, cofnięcie
 * musiałoby kasować zapis — a rejestr jest append-only. Tak jest uczciwiej: dopóki
 * okno trwa, nic nie zostało zapisane.
 *
 * Elewację lotniska bierzemy z fixa w chwili ENGINE START (§3.3) — bez niej wysokość
 * nad terenem jest nieznana, a wtedy automat świadomie nie zgaduje lądowania.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AUTODETECT_TOAST_SEC,
  GPS_STALE_SEC,
  VS_WINDOW_SEC,
  createDetectorState,
  fixUsable,
  fixesInWindow,
  flightPhase,
  stepDetector,
  type Detection,
  type DetectorState,
  type GpsFix,
  type PhaseReading,
} from '../../domain';
import type { GpsPort } from '../../application/ports';
import { useSessionStore } from '../store';
import { useTrace } from '../bootstrap/servicesContext';

/** Oczekujące zdarzenie w oknie „COFNIJ". */
export interface PendingDetection {
  /** Tylko start i lądowanie trafiają do okna „COFNIJ" — kołowanie zapisuje się od razu. */
  detection: Exclude<Detection, 'taxi'>;
  /**
   * RETRO-DATOWANY czas zdarzenia (`DetectorStep.detectedAt`) — ten trafia do rejestru
   * i ten pokazuje toast. Bywa o kilkanaście sekund wcześniejszy niż fix potwierdzający.
   */
  at: number;
  /** Fix, który detekcję POTWIERDZIŁ — źródło wartości pokazywanych w toaście. */
  fix: GpsFix;
  secondsLeft: number;
}

export interface FlightDetectionState {
  /** Ostatni fix — zasila siatkę GPS w kokpicie. Zostaje też PO utracie sygnału. */
  fix: GpsFix | null;
  /** Faza lotu i prędkość pionowa — napis w `PhaseHero` (mockup 05). */
  phase: PhaseReading;
  /** Detekcja czekająca na potwierdzenie ciszą albo cofnięcie. */
  pending: PendingDetection | null;
  /** Anuluje oczekującą detekcję — nic nie zostaje zapisane. */
  undo: () => void;
  /**
   * GPS ŻYJE: fixy przychodzą i najświeższy ma mniej niż `GPS_STALE_SEC`.
   * `false` = brak uprawnień, brak sygnału ALBO sygnał właśnie umilkł (mockup 05g) —
   * kokpit pokazuje wtedy baner-przyrząd i przestawia zapis na ręczny.
   */
  gpsAvailable: boolean;
  /** Chwila ostatniego fixa (czas fixa) — „Ostatni fix 15:58 UTC" na banerze 05g. */
  lastFixAt: number | null;
  /**
   * Pilot odmówił uprawnienia lokalizacji — jedyny powód ciszy, którego sygnał
   * nie naprawi sam (baner dostaje wtedy instrukcję ustawień, nie „szukam nieba").
   */
  permissionDenied: boolean;
}

export interface UseFlightDetectionOptions {
  /** Port GPS; brak = detekcja wyłączona (np. ekran otwarty bez uprawnień). */
  gps: GpsPort | null;
  /** Czy nasłuchiwać. Zwykle: silnik pracuje. */
  enabled: boolean;
  /** Elewacja lotniska (ft) — z fixa przy ENGINE START. */
  fieldElevationFt?: number | null;
  /**
   * Operacja lata Z i NA to samo lotnisko (skoki) — włącza geofence lądowania
   * w detektorze. Ferry/przelot MUSI zostawić `false`.
   */
  sameFieldOnly?: boolean;
  /** Długość okna „COFNIJ" (s). */
  windowSec?: number;
}

export function useFlightDetection({
  gps,
  enabled,
  fieldElevationFt = null,
  sameFieldOnly = false,
  windowSec = AUTODETECT_TOAST_SEC,
}: UseFlightDetectionOptions): FlightDetectionState {
  const taxi = useSessionStore((s) => s.taxi);
  const takeoff = useSessionStore((s) => s.takeoff);
  const landing = useSessionStore((s) => s.landing);
  const sessionUuid = useSessionStore((s) => s.context?.sessionUuid ?? null);
  const trace = useTrace();

  const [fix, setFix] = useState<GpsFix | null>(null);
  const [phase, setPhase] = useState<PhaseReading>({ phase: 'idle', verticalSpeedFpm: null });
  const [pending, setPending] = useState<PendingDetection | null>(null);
  const [gpsAvailable, setGpsAvailable] = useState(false);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  /** Zegar URZĄDZENIA z chwili odbioru fixa — świeżość liczymy własnym zegarem,
   *  bo martwy GPS z definicji nie powie nam, że umarł (mockup 05g). */
  const lastFixDeviceMs = useRef<number | null>(null);

  const detector = useRef<DetectorState>(createDetectorState(fieldElevationFt, { sameFieldOnly }));
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elewacja pojawia się dopiero przy starcie silnika — aktualizujemy bez resetu fazy,
  // żeby nie zgubić stanu „w powietrzu" przy ponownym renderze. Tryb operacji tak samo.
  useEffect(() => {
    detector.current = { ...detector.current, fieldElevationFt, sameFieldOnly };
  }, [fieldElevationFt, sameFieldOnly]);

  const clearTimers = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    commitTimer.current = null;
    tickTimer.current = null;
  }, []);

  const undo = useCallback(() => {
    clearTimers();
    setPending((p) => {
      // Marker COFNIJ do śladu (faza 5): fałszywa detekcja oznaczona przez pilota —
      // rejestr zdarzeń tego nie widzi, bo COFNIJ z definicji zapobiega zdarzeniu.
      if (p != null) trace?.marker('undo', p.detection, p.at, sessionUuid);
      return null;
    });
  }, [clearTimers, sessionUuid, trace]);

  /** Po upływie okna zapisujemy zdarzenie — metodą `auto`, z czasem RETRO-DATOWANYM. */
  const commit = useCallback(
    async (d: Exclude<Detection, 'taxi'>, at: number) => {
      setPending(null);
      try {
        // Czas zdarzenia to moment, w którym rzecz NASTĄPIŁA (`detectedAt` z detektora),
        // a nie moment wyjścia z okna „COFNIJ" ani nawet fixa potwierdzającego. Inaczej
        // każde zdarzenie byłoby w dokumentach spóźnione, a nikt później tego nie widzi (§5.1).
        if (d === 'takeoff') await takeoff('auto', null, at);
        else await landing('auto', null, at);
      } catch {
        // Twarde odrzucenie inwariantu (np. landing bez startu) trafia do `lastError`
        // w store i jest pokazywane na ekranie — tutaj nie ma czego dodać.
      }
    },
    [landing, takeoff],
  );

  const schedule = useCallback(
    (d: Exclude<Detection, 'taxi'>, at: number, fix: GpsFix) => {
      clearTimers();
      // Marker do śladu (faza 5): „toast pokazany". Razem z ewentualnym `undo`
      // i zdarzeniem w rejestrze daje pełny obraz trafności progu.
      trace?.marker('detection', d, at, sessionUuid);
      setPending({ detection: d, at, fix, secondsLeft: windowSec });

      tickTimer.current = setInterval(() => {
        setPending((p) => (p == null ? p : { ...p, secondsLeft: p.secondsLeft - 1 }));
      }, 1000);

      commitTimer.current = setTimeout(() => {
        clearTimers();
        void commit(d, at);
      }, windowSec * 1000);
    },
    [clearTimers, commit, sessionUuid, trace, windowSec],
  );

  useEffect(() => {
    if (!gps || !enabled) {
      setGpsAvailable(false);
      return;
    }

    let stop: (() => void) | null = null;
    let cancelled = false;
    let attaching = false;

    const handleFix = (incoming: GpsFix) => {
      // Ślad kalibracyjny (faza 5): SUROWY fix, PRZED kwarantanną — śmieci to
      // najcenniejszy materiał do progów bramki jakości.
      trace?.fix(incoming, sessionUuid);

      // Kwarantanna śmieciowego fixa (zakłócenia — audyt 2026-07-29): nie karmimy nim
      // ANI detektora, ani siatki, ani świeżości. Strumień samych śmieci wygasza
      // `gpsAvailable` watchdogiem → kokpit uczciwie pokaże 05g „autodetekcja
      // wstrzymana", a diagnostyka na 13 surowe fixy dalej widzi (własna subskrypcja).
      if (!fixUsable(incoming)) return;

      setFix(incoming);
      setGpsAvailable(true);
      setLastFixAt(incoming.time);
      lastFixDeviceMs.current = Date.now();

      const step = stepDetector(detector.current, incoming);
      detector.current = step.state;

      // Kołowanie zapisujemy OD RAZU, bez okna „COFNIJ". Okno istnieje po to, żeby
      // fałszywy start albo lądowanie nie trafiły do czasów lotu — kołowanie żadnego
      // czasu nie wyznacza, więc pytanie „czy na pewno?" byłoby samym szumem.
      //
      // Gdy projekcja już wie o trwającym kołowaniu, detekcja jest duplikatem z odrodzonego
      // detektora (powrót na ekran, restart aplikacji) — pomijamy ją PO CICHU. Gwardia
      // `ALREADY_TAXIING` odrzuciłaby zapis i tak, ale jej odmowa ląduje w `lastError`,
      // a pilot nie powinien oglądać błędu za zdarzenie, którego sam nie wywołał.
      if (step.detection === 'taxi' && !useSessionStore.getState().projection.taxiing) {
        void taxi('auto', null, step.detectedAt ?? incoming.time).catch(() => {
          // Powód odrzucenia trafia do `lastError` w store i jest widoczny w kokpicie.
        });
      }

      // Okno prędkości pionowej bierzemy z historii DETEKTORA — hook nie prowadzi już
      // własnego bufora. Dwa bufory tych samych fixów to dwie prawdy o tym, co widział
      // algorytm, i pierwsza rozbieżność wyszłaby dopiero przy analizie nagrania.
      setPhase(
        flightPhase(
          step.state.phase === 'airborne',
          fixesInWindow(step.state.history, VS_WINDOW_SEC),
        ),
      );

      if (step.detection === 'takeoff' || step.detection === 'landing') {
        schedule(step.detection, step.detectedAt ?? incoming.time, incoming);
      }
    };

    /**
     * Podnosi nasłuch od nowa. Stara subskrypcja schodzi PRZED założeniem nowej, żeby
     * przez chwilę nie stały dwie i detektor nie dostał tego samego fixa dwa razy.
     * Bez pytania o uprawnienia — te załatwia pierwsze wejście; powtarzanie prośby przy
     * każdej odbudowie potrafiłoby wystawić pilotowi systemowe okno w locie.
     */
    const attach = async (): Promise<void> => {
      if (attaching) return;
      attaching = true;
      try {
        stop?.();
        stop = null;
        const release = await gps.start(handleFix);
        if (cancelled) {
          release();
          return;
        }
        stop = release;
        // Cisza liczy się od chwili, gdy nasłuch STOI — inaczej watchdog mierzyłby
        // czas do fixa, którego nikt jeszcze nie miał komu podać.
        lastFixDeviceMs.current = Date.now();
      } finally {
        attaching = false;
      }
    };

    void (async () => {
      const permission = await gps.requestPermission();
      if (cancelled) return;
      if (permission !== 'granted') {
        // Odmowa to INNY stan niż cisza sygnału: baner dostaje instrukcję ustawień
        // zamiast „szukam nieba" (rozróżnienie stanów — decyzja UX 2026-08-04).
        setPermissionDenied(true);
        setGpsAvailable(false);
        return;
      }
      setPermissionDenied(false);
      await attach();
    })();

    // Watchdog świeżości (mockup 05g): sam brak KOLEJNYCH fixów nie wywołuje żadnego
    // callbacku, więc ciszę trzeba zauważyć aktywnie. Po `GPS_STALE_SEC` bez fixa
    // `gpsAvailable` gaśnie — kokpit wystawia baner-przyrząd i ręczny zapis; powrót
    // sygnału gasi baner sam (pierwszy świeży fix ustawia flagę z powrotem).
    const staleTimer = setInterval(() => {
      const at = lastFixDeviceMs.current;
      if (at == null || Date.now() - at <= GPS_STALE_SEC * 1000) return;
      setGpsAvailable(false);

      // Cisza ma dwie przyczyny nie do odróżnienia z zewnątrz: nie ma sygnału ALBO
      // umarła NASZA subskrypcja (Android potrafi ją ubić po powrocie z tła albo przy
      // przełączeniu dostawcy lokalizacji). Martwej subskrypcji sygnał już nie obudzi —
      // baner zostałby na ekranie do końca dnia, choć telefon dawno ma fixa. Dlatego
      // co `GPS_STALE_SEC` podnosimy nasłuch od nowa; `attach` przestawia zegar ciszy,
      // więc odbudowa sama się reguluje i nie robi tego częściej.
      void attach();
    }, 2_000);

    return () => {
      cancelled = true;
      stop?.();
      clearTimers();
      clearInterval(staleTimer);
    };
  }, [clearTimers, enabled, gps, schedule, sessionUuid, taxi, trace]);

  return { fix, phase, pending, undo, gpsAvailable, lastFixAt, permissionDenied };
}
