/**
 * Ninerdeck - LISTA OBSERWOWANYCH w Ustawieniach (`GET /aircraft/watches`; obserwowanie
 * 3.2.0, sekcja 13C, `docs/obserwowanie-samolotu.md` §6.6).
 *
 * ══ TRZY ODPOWIEDZI SERWERA, DWA STANY EKRANU ══
 * Lista → wiersze z przełącznikami; `'forbidden'` → sekcji NIE MA (osoba bez zdolności
 * jej nie widzi - brak sekcji, nie sekcja wyszarzona); `null` (brak sieci) → jedno
 * zdanie w miejscu listy, ale WYŁĄCZNIE u osoby, której serwer kiedyś odpowiedział
 * listą (`watchAccess` pamięta samą odpowiedź na pytanie o zdolność, nie listę).
 * Bez tej pamięci każdy pilot bez zasięgu oglądałby zdanie o liście, której nigdy nie
 * miał.
 *
 * ══ STAN „TERAZ" NA ŻYWO Z KANAŁU KLUBU ══ (4.0.0, K1, K3)
 * Podpis każdego wiersza („w powietrzu od 08:12") zmienia się z każdym lotem floty, więc
 * lista słucha CAŁEGO rodzaju `aircraft` i czyta się po cichu od nowa. Odpytywania nie
 * ma: lista w stanie „nie wiem" wraca sama z powitaniem łącza (wzorzec kalendarza).
 *
 * ══ PRZEŁĄCZNIK ZAPISUJE WPROST ══
 * `PUT`/`DELETE /aircraft/:id/watch` bez outboxa (§2.2). Po udanym zapisie lista
 * odświeża się z serwera - to on jest źródłem prawdy o stanie „teraz" w podpisie.
 * Nieudany zapis wraca `false`, a ekran mówi to powodem przy wierszu.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import type { RemoteWatchList } from '../../application/ports';
import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useCurrentPilot } from '../store/currentPilot';
import { readWatchAccess, rememberWatchAccess } from '../store/watchAccess';

import { quietResult } from '../screens/logic/liveRefresh';
import { useLiveTopic } from './useLiveTopic';

/** Każda maszyna klubu - stan „teraz" w podpisach wierszy. */
const WATCH_TOPICS = ['aircraft'];

export interface UseAircraftWatches {
  /** `undefined` = pytanie w toku, `null` = nie wiadomo, lista = odpowiedź. */
  data: RemoteWatchList | null | undefined;
  /**
   * Czy sekcja ma w ogóle istnieć: `true` po liście albo z pamięci, `false` po odmowie
   * albo z pamięci, `null` = nikt jeszcze nie wie (świeża instalacja bez zasięgu).
   */
  visible: boolean | null;
  /** Zapis obserwowania; `false` = nie dojechało. Po `true` lista czyta się na nowo. */
  setWatch: (aircraftId: string, on: boolean) => Promise<boolean>;
}

export function useAircraftWatches(): UseAircraftWatches {
  const sync = useSessionStore((s) => s.sync);
  const pilotId = useCurrentPilot((p) => p.id);
  const orgId = useAuthStore((s) => s.org?.id ?? null);
  const [data, setData] = useState<RemoteWatchList | null | undefined>(undefined);
  const [remembered, setRemembered] = useState<boolean | null>(null);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (orgId == null) return;
    let cancelled = false;
    void readWatchAccess(pilotId, orgId).then((value) => {
      if (!cancelled) setRemembered(value);
    });
    return () => {
      cancelled = true;
    };
  }, [pilotId, orgId]);

  /**
   * `quiet` = sygnał kanału: bez plamek, a brak odpowiedzi zostawia to, co było.
   * Odmowa (`forbidden`) nie jest brakiem odpowiedzi - zdolność odebrano, sekcja znika
   * także po cichu.
   */
  const read = useCallback(
    (quiet: boolean): Promise<void> => {
      if (sync == null || orgId == null) {
        setData(null);
        return Promise.resolve();
      }
      if (!quiet) setData(undefined);
      return sync
        .fetchAircraftWatches()
        .then((wire) => {
          if (!alive.current) return;
          if (wire === 'forbidden') {
            setAnswered(false);
            setData(null);
            void rememberWatchAccess(pilotId, orgId, false);
            return;
          }
          if (wire != null) {
            setAnswered(true);
            void rememberWatchAccess(pilotId, orgId, true);
          }
          setData((previous) => (quiet ? quietResult(previous, wire) : wire));
        })
        .catch(() => {
          if (alive.current && !quiet) setData(null);
        });
    },
    [sync, orgId, pilotId],
  );

  // Bez zwracania obietnicy: `useFocusEffect` przyjmuje wyłącznie funkcję sprzątającą.
  const load = useCallback(() => {
    void read(false);
  }, [read]);
  const refresh = useCallback(() => {
    void read(true);
  }, [read]);

  useFocusEffect(load);
  // Osoba bez zdolności nie ma czego słuchać - sekcji i tak nie ma.
  useLiveTopic(answered === false ? null : WATCH_TOPICS, refresh);

  const setWatch = useCallback(
    async (aircraftId: string, on: boolean): Promise<boolean> => {
      if (sync == null) return false;
      const done = await sync.setAircraftWatch(aircraftId, on);
      // Lista stoi przed oczami pilota - po zapisie czyta się po cichu, bez plamek,
      // a zapis kończy się dopiero z nową listą: przełącznik, który przestał być
      // „zajęty" przed jej przyjściem, mignąłby na chwilę starym stanem.
      if (done && alive.current) await read(true);
      return done;
    },
    [sync, read],
  );

  return { data, visible: answered ?? remembered, setWatch };
}
