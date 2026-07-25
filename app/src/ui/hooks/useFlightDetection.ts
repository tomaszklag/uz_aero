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
  createDetectorState,
  stepDetector,
  type Detection,
  type DetectorState,
  type GpsFix,
} from '../../domain';
import type { GpsPort } from '../../application/ports';
import { useSessionStore } from '../store';

/** Oczekujące zdarzenie w oknie „COFNIJ". */
export interface PendingDetection {
  detection: Detection;
  /** Fix, który wywołał detekcję — z niego bierzemy czas zdarzenia. */
  fix: GpsFix;
  secondsLeft: number;
}

export interface FlightDetectionState {
  /** Ostatni fix — zasila siatkę GPS w kokpicie. */
  fix: GpsFix | null;
  /** Detekcja czekająca na potwierdzenie ciszą albo cofnięcie. */
  pending: PendingDetection | null;
  /** Anuluje oczekującą detekcję — nic nie zostaje zapisane. */
  undo: () => void;
  /** GPS nie dostarcza fixów (brak uprawnień / brak sygnału). */
  gpsAvailable: boolean;
}

export interface UseFlightDetectionOptions {
  /** Port GPS; brak = detekcja wyłączona (np. ekran otwarty bez uprawnień). */
  gps: GpsPort | null;
  /** Czy nasłuchiwać. Zwykle: silnik pracuje. */
  enabled: boolean;
  /** Elewacja lotniska (ft) — z fixa przy ENGINE START. */
  fieldElevationFt?: number | null;
  /** Długość okna „COFNIJ" (s). */
  windowSec?: number;
}

export function useFlightDetection({
  gps,
  enabled,
  fieldElevationFt = null,
  windowSec = AUTODETECT_TOAST_SEC,
}: UseFlightDetectionOptions): FlightDetectionState {
  const takeoff = useSessionStore((s) => s.takeoff);
  const landing = useSessionStore((s) => s.landing);

  const [fix, setFix] = useState<GpsFix | null>(null);
  const [pending, setPending] = useState<PendingDetection | null>(null);
  const [gpsAvailable, setGpsAvailable] = useState(false);

  const detector = useRef<DetectorState>(createDetectorState(fieldElevationFt));
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elewacja pojawia się dopiero przy starcie silnika — aktualizujemy bez resetu fazy,
  // żeby nie zgubić stanu „w powietrzu" przy ponownym renderze.
  useEffect(() => {
    detector.current = { ...detector.current, fieldElevationFt };
  }, [fieldElevationFt]);

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
    async (d: Detection, at: GpsFix) => {
      setPending(null);
      try {
        if (d === 'takeoff') await takeoff('auto', null);
        else await landing('auto', null);
      } catch {
        // Twarde odrzucenie inwariantu (np. landing bez startu) trafia do `lastError`
        // w store i jest pokazywane na ekranie — tutaj nie ma czego dodać.
      }
    },
    [landing, takeoff],
  );

  const schedule = useCallback(
    (d: Detection, at: GpsFix) => {
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
        setFix(incoming);
        setGpsAvailable(true);

        const step = stepDetector(detector.current, incoming);
        detector.current = step.state;
        if (step.detection) schedule(step.detection, incoming);
      });
    })();

    return () => {
      cancelled = true;
      stop?.();
      clearTimers();
    };
  }, [clearTimers, enabled, gps, schedule]);

  return { fix, pending, undo, gpsAvailable };
}
