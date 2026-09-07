/**
 * UZ Aero - BRAMKA REZYGNACJI Z FORMULARZA (issue #55, poprawiona przy issue #84 pkt 7).
 *
 * Jeden hook na dwie drogi do lotu - preflight (02) i wpis ręczny (15) - bo obie robią
 * DOKŁADNIE to samo: łapią „wstecz" nad niepustym formularzem, pytają arkuszem
 * o rezygnację i dopiero po potwierdzeniu wypuszczają zatrzymaną akcję nawigacji.
 * Dwie kopie tej sekwencji miały też dwie kopie tej samej wywrotki na Androidzie
 * (`abandonExit.ts` - tam pełne uzasadnienie kolejności faz).
 *
 * Czego hook NIE robi i robić nie może: nie decyduje, KIEDY pytać. Warunek bramki
 * należy do formularza - preflight pyta o niepusty szkic, a stepper wpisu ręcznego
 * najpierw cofa krok i pyta dopiero z pierwszego. Ta różnica jest treścią obu ekranów,
 * nie wspólną mechaniką.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePreventRemove, type NavigationAction } from '@react-navigation/native';

import {
  abandonDispatches,
  abandonGuards,
  abandonSheetMounted,
  nextAbandonPhase,
  type AbandonPhase,
} from './abandonExit';

export interface UseAbandonExit {
  /** Arkusz rezygnacji wolno trzymać w drzewie - patrz `abandonSheetMounted`. */
  sheetMounted: boolean;
  /** Zapytaj o rezygnację, trzymając tę akcję nawigacji na później. */
  ask: (action: NavigationAction) => void;
  /** Zostaw pilota w formularzu (anuluj, „wstecz", tapnięcie w tło). */
  stay: () => void;
  /** Pilot potwierdził rezygnację - rusza sekwencja wyjścia. */
  leave: () => void;
}

/**
 * @param navigation ekran, z którego wychodzimy - `dispatch` wykonuje zatrzymaną akcję.
 * @param when czy bramka ma w ogóle łapać „wstecz" (niepusty formularz).
 * @param onIntercept przechwycenie WŁASNE formularza; zwróć `true`, gdy „wstecz"
 *   znaczy coś innego niż wyjście (stepper cofa krok) - wtedy hook nie pyta o nic.
 * @param onLeave sprzątanie przed wyjściem (wyczyszczenie szkicu). Woła się RAZ,
 *   w chwili potwierdzenia.
 */
export function useAbandonExit(
  navigation: { dispatch: (action: NavigationAction) => void },
  when: boolean,
  onIntercept?: () => boolean,
  onLeave?: () => void,
): UseAbandonExit {
  const [phase, setPhase] = useState<AbandonPhase>('form');
  const [action, setAction] = useState<NavigationAction | null>(null);

  const ask = useCallback((next: NavigationAction) => {
    setAction(next);
    setPhase('asking');
  }, []);

  const stay = useCallback(() => {
    setAction(null);
    setPhase('form');
  }, []);

  const leave = useCallback(() => {
    setPhase('closing');
    onLeave?.();
  }, [onLeave]);

  /*
   * Bramka opada z chwilą potwierdzenia (`abandonGuards`), więc zatrzymana akcja ma
   * już czym wyjechać. Warunek `when` liczy formularz - hook go tylko przepuszcza.
   */
  usePreventRemove(when && abandonGuards(phase), ({ data }) => {
    if (onIntercept?.() === true) return;
    ask(data.action);
  });

  /*
   * `closing` → `leaving` po JEDNEJ klatce. To nie jest kosmetyczne opóźnienie: arkusz
   * wypadł z drzewa dopiero w tym renderze, a zdjęcie okna modala dzieje się na wątku
   * UI systemu. Bez tej klatki nawigacja zabierałaby powierzchnię spod okna, które
   * jeszcze się zamyka - i to jest cała treść zgłoszonego wyjątku.
   */
  useEffect(() => {
    const next = nextAbandonPhase(phase);
    if (next == null) return;
    const id = requestAnimationFrame(() => setPhase(next));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  // Zatrzymana akcja jedzie dopiero PO re-renderze z opuszczoną bramką: dispatch
  // w tym samym tiku trafiałby w listener pamiętający jeszcze bramkę podniesioną.
  useEffect(() => {
    if (abandonDispatches(phase) && action != null) navigation.dispatch(action);
  }, [phase, action, navigation]);

  return { sheetMounted: abandonSheetMounted(phase), ask, stay, leave };
}
