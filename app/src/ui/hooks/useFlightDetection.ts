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
  flightPhase,
  stepDetector,
  type Detection,
  type DetectorState,
  type GpsFix,
  type PhaseReading,
} from '../../domain';
import type { GpsPort } from '../../application/ports';
import { useSessionStore } from '../store';

/** Oczekujące zdarzenie w oknie „COFNIJ". */
export interface PendingDetection {
  /** Tylko start i lądowanie trafiają do okna „COFNIJ" — kołowanie zapisuje się od razu. */
  detection: Exclude<Detection, 'taxi'>;
  /** Fix, który wywołał detekcję — z niego bierzemy czas zdarzenia. */
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

  const [fix, setFix] = useState<GpsFix | null>(null);
  const [phase, setPhase] = useState<PhaseReading>({ phase: 'idle', verticalSpeedFpm: null });
  const [pending, setPending] = useState<PendingDetection | null>(null);
  const [gpsAvailable, setGpsAvailable] = useState(false);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);

  /** Okno fixów do liczenia prędkości pionowej — trzymamy tylko tyle, ile potrzeba. */
  const window = useRef<GpsFix[]>([]);
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
    setPending(null);
  }, [clearTimers]);

  /** Po upływie okna zapisujemy zdarzenie — metodą `auto`, z czasem z fixa GPS. */
  const commit = useCallback(
    async (d: Exclude<Detection, 'taxi'>, at: GpsFix) => {
      setPending(null);
      try {
        // Czas zdarzenia to chwila fixa, NIE moment wyjścia z okna „COFNIJ" — inaczej
        // każdy start byłby zapisany 10 s za późno, o czym nikt później nie wie (§5.1).
        if (d === 'takeoff') await takeoff('auto', null, at.time);
        else await landing('auto', null, at.time);
      } catch {
        // Twarde odrzucenie inwariantu (np. landing bez startu) trafia do `lastError`
        // w store i jest pokazywane na ekranie — tutaj nie ma czego dodać.
      }
    },
    [landing, takeoff],
  );

  const schedule = useCallback(
    (d: Exclude<Detection, 'taxi'>, at: GpsFix) => {
      clearTimers();
      setPending({ detection: d, fix: at, secondsLeft: windowSec });

      tickTimer.current = setInterval(() => {
        setPending((p) => (p == null ? p : { ...p, secondsLeft: p.secondsLeft - 1 }));
      }, 1000);

      commitTimer.current = setTimeout(() => {
        clearTimers();
        void commit(d, at);
      }, windowSec * 1000);
    },
    [clearTimers, commit, windowSec],
  );

  useEffect(() => {
    if (!gps || !enabled) {
      setGpsAvailable(false);
      return;
    }

    let stop: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const permission = await gps.requestPermission();
      if (cancelled || permission !== 'granted') {
        setGpsAvailable(false);
        return;
      }

      stop = await gps.start((incoming) => {
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
        if (step.detection === 'taxi') {
          void taxi('auto', null, incoming.time).catch(() => {
            // Powód odrzucenia trafia do `lastError` w store i jest widoczny w kokpicie.
          });
        }

        // Okno prędkości pionowej — z zapasem jednego fixa, żeby po odrzuceniu
        // przeterminowanych zawsze zostały co najmniej dwa punkty.
        window.current = [...window.current, incoming].filter(
          (f) => incoming.time - f.time <= VS_WINDOW_SEC * 1000,
        );
        if (window.current.length < 2) window.current = [incoming];
        setPhase(flightPhase(step.state.phase === 'airborne', window.current));

        if (step.detection === 'takeoff' || step.detection === 'landing') {
          schedule(step.detection, incoming);
        }
      });
    })();

    // Watchdog świeżości (mockup 05g): sam brak KOLEJNYCH fixów nie wywołuje żadnego
    // callbacku, więc ciszę trzeba zauważyć aktywnie. Po `GPS_STALE_SEC` bez fixa
    // `gpsAvailable` gaśnie — kokpit wystawia baner-przyrząd i ręczny zapis; powrót
    // sygnału gasi baner sam (pierwszy świeży fix ustawia flagę z powrotem).
    const staleTimer = setInterval(() => {
      const at = lastFixDeviceMs.current;
      if (at != null && Date.now() - at > GPS_STALE_SEC * 1000) setGpsAvailable(false);
    }, 2_000);

    return () => {
      cancelled = true;
      stop?.();
      clearTimers();
      clearInterval(staleTimer);
    };
  }, [clearTimers, enabled, gps, schedule, taxi]);

  return { fix, phase, pending, undo, gpsAvailable, lastFixAt };
}
