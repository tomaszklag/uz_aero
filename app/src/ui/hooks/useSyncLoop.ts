/**
 * UZ Aero — pętla okazji synchronizacji (§4.3: „sieć to okazja, nie warunek").
 *
 * Sam silnik (`SyncEngine`) niczego nie nasłuchuje — ten hook dostarcza mu OKAZJE:
 *  • start aplikacji,
 *  • powrót z tła (AppState) — najczęstszy moment odzyskania zasięgu w praktyce,
 *  • przyrost outboxa (nowe zdarzenie w locie),
 *  • puls co 60 s jako siatka bezpieczeństwa.
 *
 * Sam przebieg (silnik → wynik → store) to `syncNow` w store sesji — ta sama droga,
 * którą chodzi przycisk „SYNCHRONIZUJ TERAZ" na ekranie 11. Zasada z `CLAUDE.md`
 * bez zmian: jeden globalny wskaźnik, żadnych komunikatów o sieci rozsianych po ekranach.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';

/** Puls awaryjny — rzadki, bo prawdziwe okazje i tak przychodzą ze zdarzeń. */
const HEARTBEAT_MS = 60_000;

export function useSyncLoop(): void {
  const status = useAuthStore((s) => s.status);
  const engine = useSessionStore((s) => s.sync);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const syncNow = useSessionStore((s) => s.syncNow);
  const refreshReference = useSessionStore((s) => s.refreshReference);

  // Jedna trwająca obietnica — okazje w trakcie przebiegu są zbędne (silnik i tak
  // dopije outbox do dna), a AppState potrafi strzelić kilka razy pod rząd.
  const inFlight = useRef(false);

  useEffect(() => {
    if (engine == null || status !== 'signed_in') return;

    const kick = async (): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        // Najpierw wysyłka (nasze `day_close` zmienia claimy), potem odświeżenie
        // cache referencyjnego — z bramą wieku, więc zwykle to darmowy powrót.
        await syncNow();
        await refreshReference();
      } finally {
        inFlight.current = false;
      }
    };

    void kick(); // start / zmiana licznika = okazja

    const timer = setInterval(() => void kick(), HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void kick();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [engine, status, outboxCount, syncNow, refreshReference]);
}
