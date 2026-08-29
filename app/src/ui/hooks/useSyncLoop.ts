/**
 * UZ Aero - pętla okazji synchronizacji (§4.3: „sieć to okazja, nie warunek").
 *
 * Sam silnik (`SyncEngine`) niczego nie nasłuchuje - ten hook dostarcza mu OKAZJE:
 *  • start aplikacji,
 *  • powrót z tła (AppState) - najczęstszy moment odzyskania zasięgu w praktyce,
 *  • przyrost outboxa (nowe zdarzenie w locie),
 *  • puls co 60 s jako siatka bezpieczeństwa.
 *
 * Sam przebieg (silnik → wynik → store) to `syncNow` w store sesji - ta sama droga,
 * którą chodzi przycisk „SYNCHRONIZUJ TERAZ" na ekranie 11. Zasada z `CLAUDE.md`
 * bez zmian: jeden globalny wskaźnik, żadnych komunikatów o sieci rozsianych po ekranach.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';

/** Puls awaryjny - rzadki, bo prawdziwe okazje i tak przychodzą ze zdarzeń. */
const HEARTBEAT_MS = 60_000;

export function useSyncLoop(): void {
  const status = useAuthStore((s) => s.status);
  const engine = useSessionStore((s) => s.sync);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const syncNow = useSessionStore((s) => s.syncNow);
  const restoreEvents = useSessionStore((s) => s.restoreEvents);
  const refreshReference = useSessionStore((s) => s.refreshReference);
  const uploadTraces = useSessionStore((s) => s.uploadTraces);
  const syncThemePrefs = useSessionStore((s) => s.syncThemePrefs);

  // Jedna trwająca obietnica - okazje w trakcie przebiegu są zbędne (silnik i tak
  // dopije outbox do dna), a AppState potrafi strzelić kilka razy pod rząd.
  const inFlight = useRef(false);

  useEffect(() => {
    if (engine == null || status !== 'signed_in') return;

    const kick = async (): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        // Kolejność = priorytet: najpierw rejestr dnia (nasze `day_close` zmienia
        // claimy), potem cache referencyjny (brama wieku - zwykle darmowy powrót),
        // NA KOŃCU ślad kalibracyjny - jemu nigdzie się nie śpieszy.
        await syncNow();
        // Odtworzenie rejestru (§4.9, issue #32) PO wysyłce, nie przed: telefon
        // z niepustym outboxem najpierw oddaje to, co ma tylko on. Własna brama
        // wieku, więc puls co 60 s nie zamienia się w odpytywanie.
        await restoreEvents();
        await refreshReference();
        // Motyw pilota (decyzja 2026-07-29): push zaległej zmiany od razu, pull
        // z własną bramą wieku - puls co 60 s nie zamienia się w odpytywanie.
        await syncThemePrefs();
        await uploadTraces();
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
  }, [
    engine,
    status,
    outboxCount,
    syncNow,
    restoreEvents,
    refreshReference,
    syncThemePrefs,
    uploadTraces,
  ]);
}
