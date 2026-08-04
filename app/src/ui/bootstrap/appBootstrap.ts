/**
 * UZ Aero — COMPOSITION ROOT aplikacji.
 *
 * Jedyne miejsce, w którym warstwy schodzą się w całość: adapter natywny (SQLite)
 * → repozytorium → komendy/zapytania → store UI. Reszta kodu nie wie, skąd biorą się
 * zależności — dostaje je gotowe (§5 architektury: porty i adaptery).
 *
 * Import `ExpoSqliteAdapter` jest tu WPROST, a nie przez barrel infrastruktury —
 * barrel celowo nie wciąga modułu natywnego, żeby testy w Node działały bez urządzenia.
 */

import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createEventsRepo, seedReferenceIfEmpty, ThemePrefsStore } from '../../infrastructure';
import { ExpoSqliteAdapter } from '../../infrastructure/storage/expoSqliteAdapter';
import { ExpoLocationAdapter } from '../../infrastructure/gps/expoLocationAdapter';
import { HttpServerApi } from '../../infrastructure/api/httpServerApi';
import { apiBaseUrl } from '../../infrastructure/api/apiBaseUrl';
import { SecureCredentials } from '../../infrastructure/auth/secureCredentials';
import { PinCrypto } from '../../infrastructure/auth/pinCrypto';
import {
  AuthService,
  FlightTrackQueries,
  ReferenceSync,
  SyncEngine,
  ThemePrefsSync,
  TraceRecorder,
  TraceSync,
} from '../../application';
import { defaultClock } from '../../infrastructure/clock';
import { ExpoSensorsAdapter } from '../../infrastructure/sensors/expoSensorsAdapter';
import type { GpsPort, SensorPort } from '../../application/ports';
import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';

/** Stan startu aplikacji — UI musi wiedzieć, czy baza jest gotowa. */
export type BootstrapStatus =
  | { phase: 'loading' }
  | { phase: 'ready'; trace: TraceRecorder }
  | { phase: 'error'; message: string };

/**
 * Port GPS aplikacji. Tworzony raz — adapter trzyma subskrypcję, więc nie może
 * powstawać przy każdym renderze.
 */
export function useGpsPort(): GpsPort {
  return useMemo(() => new ExpoLocationAdapter(), []);
}

/**
 * Port czujników pokładowych. Jak wyżej — adapter trzyma subskrypcje i okno agregacji.
 *
 * Zawsze `ExpoSensorsAdapter`, także na telefonach bez barometru: adapter sam pyta
 * `isAvailableAsync()` i nie zakłada nasłuchu na czujnik, którego nie ma. Rozgałęzianie
 * tutaj wymagałoby asynchronicznego pytania przed pierwszym renderem, a zysku nie ma
 * żadnego. `NullSensorAdapter` służy testom i odtwarzaniu tras.
 */
export function useSensorPort(): SensorPort {
  return useMemo(() => new ExpoSensorsAdapter(), []);
}

/**
 * Otwiera bazę na urządzeniu, buduje warstwy i podłącza je do store'u.
 *
 * Uruchamiane raz przy starcie. Błąd otwarcia bazy jest stanem terminalnym —
 * bez lokalnego zapisu aplikacja nie ma prawa udawać, że działa (offline-first
 * stoi na tym, że zapis jest zawsze; §4.1).
 */
export function useAppBootstrap(): BootstrapStatus {
  const [status, setStatus] = useState<BootstrapStatus>({ phase: 'loading' });
  const attachRepo = useSessionStore((s) => s.attachRepo);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const storage = new ExpoSqliteAdapter();
        await storage.init();
        if (cancelled) return;

        const repo = createEventsRepo(storage);
        // Zaślepka floty do czasu `GET /reference` — wstawiana tylko przy pustym cache,
        // więc nigdy nie nadpisze danych z serwera.
        await seedReferenceIfEmpty(repo);
        if (cancelled) return;

        attachRepo(repo);

        // Warstwa synca (M3): HTTP → serwis poświadczeń → silnik. Store auth dostaje
        // serwis i od razu czyta magazyn — to on przełącza bramkę login/aplikacja;
        // silnik idzie do store'u sesji, skąd żyją pętla okazji i ekran 11.
        const server = new HttpServerApi(apiBaseUrl());
        const auth = new AuthService(server, new SecureCredentials(), new PinCrypto());
        useAuthStore.getState().attach(auth);
        void useAuthStore.getState().restore();

        // Rejestrator śladu (faza 5): zawsze włączony; retencja przycina przy starcie.
        const trace = new TraceRecorder(storage, defaultClock);
        void trace.purgeExpired().catch(() => {});

        // Odczyt śladu dla ekranu 14 — ten sam magazyn, przeciwny kierunek. Podłączany
        // osobno od `attachRepo`, bo łączy rejestr (repo) ze śladem (storage), czyli
        // dwa magazyny o różnych gwarancjach.
        useSessionStore.getState().attachTrack(new FlightTrackQueries(repo, storage));

        useSessionStore
          .getState()
          .attachSync(
            new SyncEngine(repo, server, auth),
            new ReferenceSync(repo, server, auth),
            new TraceSync(storage, server, auth),
            // Motyw pilota (decyzja 2026-07-29): ten sam format klucza czyta
            // ThemeProvider — jedno miejsce wie, jak wygląda rekord (ThemePrefsStore).
            new ThemePrefsSync(new ThemePrefsStore(AsyncStorage), server, auth),
          );

        setStatus({ phase: 'ready', trace });
      } catch (err) {
        if (cancelled) return;
        setStatus({
          phase: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachRepo]);

  return status;
}
