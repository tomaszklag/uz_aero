/**
 * UZ Aero - hak nad `TaskMemoryStore`: podpowiedź zadania z ostatniego dnia.
 *
 * Dzieli się na dwie czynności, bo dzieją się w innych momentach:
 *  • `remembered` - odczyt przy wejściu na krok „co dziś robimy" (02e), zanim pilot
 *    czegokolwiek dotknie;
 *  • `remember(...)` - zapis przy przejściu DALEJ, czyli wtedy, gdy pilot świadomie
 *    zaakceptował wartości (nie po każdym stuknięciu w formularz).
 *
 * `null` w `remembered` znaczy „nie ma czego podpowiedzieć" - pierwszy dzień pilota
 * albo pierwszy dzień na tym samolocie. To normalny stan, nie błąd.
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  TaskMemoryStore,
  type RememberedRoute,
  type RememberedTask,
} from '../../infrastructure';
import { useCurrentPilot } from './currentPilot';

const store = new TaskMemoryStore(AsyncStorage);

export interface TaskMemory {
  /** Operacja i klient tego pilota; `null` przy pierwszym dniu. */
  task: RememberedTask | null;
  /** Trasa tego samolotu; `null` przy pierwszym dniu na nim. */
  route: RememberedRoute | null;
  /** Czy odczyt z dysku się zakończył - przed nim nie podpowiadamy niczego. */
  ready: boolean;
  remember: (task: RememberedTask, route: RememberedRoute) => void;
}

export function useTaskMemory(aircraftId: string | null): TaskMemory {
  const pilotId = useCurrentPilot((s) => s.id);
  const [task, setTask] = useState<RememberedTask | null>(null);
  const [route, setRoute] = useState<RememberedRoute | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    void Promise.all([
      store.readTask(pilotId),
      aircraftId != null ? store.readRoute(aircraftId) : Promise.resolve(null),
    ]).then(([lastTask, lastRoute]) => {
      if (cancelled) return;
      setTask(lastTask);
      setRoute(lastRoute);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [pilotId, aircraftId]);

  const remember = useCallback(
    (nextTask: RememberedTask, nextRoute: RememberedRoute) => {
      // Zapis jest skutkiem ubocznym przejścia dalej - interfejs na niego nie czeka.
      void store.writeTask(pilotId, nextTask);
      if (aircraftId != null) void store.writeRoute(aircraftId, nextRoute);
    },
    [pilotId, aircraftId],
  );

  return { task, route, ready, remember };
}
