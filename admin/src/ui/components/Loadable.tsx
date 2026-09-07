/**
 * UZ Aero - panel 2.0: „czekamy" jako KOMPONENT, nie jako `if` na ekranie.
 *
 * Trzyma obie granice z `skeletonGate.ts`: plamki pojawiają się dopiero po progu
 * (odpowiedź w 90 ms nie ma prawa mrugnąć) i zostają co najmniej minimum (skeleton
 * pokazany i schowany w 30 ms czyta się jak usterka rysowania).
 *
 * Dlaczego komponent, a nie hook: reguła panelu mówi, że plik `.tsx` eksportuje
 * wyłącznie komponenty, a moduł `.ts` w `ui/` nie zna Reacta. Timer musi więc mieszkać
 * w komponencie - a przy okazji wychodzi z tego lepsze API: ekran pisze, CO pokazać
 * zamiast treści, a nie żongluje flagą.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { remainingHoldMs, SKELETON_DELAY_MS } from './skeletonGate';

interface LoadableProps {
  pending: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}

export function Loadable({ pending, skeleton, children }: LoadableProps) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (pending) {
      // Odliczamy próg. Gdy odpowiedź przyjdzie wcześniej, sprzątanie efektu skasuje
      // timer i plamki nie pojawią się ani na klatkę.
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, SKELETON_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // Dane przyszły. Jeśli plamek nigdy nie było, nie ma czego trzymać.
    const hold = remainingHoldMs(shownAt.current, Date.now());
    if (hold === 0) {
      shownAt.current = null;
      setVisible(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      shownAt.current = null;
      setVisible(false);
    }, hold);
    return () => clearTimeout(timer);
  }, [pending]);

  return <>{visible ? skeleton : children}</>;
}
