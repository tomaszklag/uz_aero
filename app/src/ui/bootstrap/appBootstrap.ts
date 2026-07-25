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

import { useEffect, useState } from 'react';

import { createEventsRepo } from '../../infrastructure';
import { ExpoSqliteAdapter } from '../../infrastructure/storage/expoSqliteAdapter';
import { useSessionStore } from '../store';

/** Stan startu aplikacji — UI musi wiedzieć, czy baza jest gotowa. */
export type BootstrapStatus =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

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

        attachRepo(createEventsRepo(storage));
        setStatus({ phase: 'ready' });
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
