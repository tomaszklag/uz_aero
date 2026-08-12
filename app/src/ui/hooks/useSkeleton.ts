/**
 * UZ Aero — useSkeleton: „czy w tej chwili rysować plamki?".
 *
 * Jedno wejście dla całej aplikacji do wzorca ładowania (issue #33). Ekran mówi tylko,
 * czy dane są w drodze; próg pojawienia się i minimalny czas na ekranie liczy czysta
 * bramka (`screens/logic/skeletonGate.ts`), a hook dokłada do niej to, czego czysta
 * funkcja mieć nie może: pamięć chwil i jeden `setTimeout` na granicę progu.
 *
 * Budzimy Reacta wyłącznie na tych granicach — nie ma tu tykania co klatkę. Przy odczycie
 * krótszym niż próg nie ma go w ogóle: bramka odpowiada „nie" i nigdy nie zmienia zdania.
 */

import { useEffect, useRef, useState } from 'react';

import { skeletonNextChangeIn, skeletonVisible } from '../screens/logic/skeletonGate';

export function useSkeleton(pending: boolean): boolean {
  const [visible, setVisible] = useState(false);
  /** Kiedy zaczęło się bieżące czekanie. */
  const pendingSince = useRef<number | null>(null);
  /** Kiedy plamki weszły na ekran — od tego liczy się minimum. */
  const shownSince = useRef<number | null>(null);

  useEffect(() => {
    if (pending) {
      pendingSince.current ??= Date.now();
    } else {
      pendingSince.current = null;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const evaluate = (): void => {
      const now = Date.now();
      const next = skeletonVisible({
        pending,
        pendingSince: pendingSince.current,
        shownSince: shownSince.current,
        now,
      });

      // Chwilę pojawienia się zapamiętujemy DOKŁADNIE raz — kolejne przeliczenia w tym
      // samym czekaniu nie mają prawa przesuwać końca minimum w przód.
      if (next && shownSince.current == null) shownSince.current = now;
      if (!next) shownSince.current = null;

      setVisible(next);

      const wait = skeletonNextChangeIn({
        pending,
        pendingSince: pendingSince.current,
        shownSince: shownSince.current,
        now,
      });
      if (wait != null) timer = setTimeout(evaluate, wait);
    };

    evaluate();

    return () => {
      if (timer != null) clearTimeout(timer);
    };
  }, [pending]);

  return visible;
}
