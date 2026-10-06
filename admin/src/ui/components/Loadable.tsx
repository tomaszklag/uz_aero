/**
 * Ninerdeck - panel 2.0: „czekamy" jako KOMPONENT, nie jako `if` na ekranie.
 *
 * Trzyma obie granice z `skeletonGate.ts`: plamki pojawiają się dopiero po progu
 * (odpowiedź w 90 ms nie ma prawa mrugnąć) i zostają co najmniej minimum (skeleton
 * pokazany i schowany w 30 ms czyta się jak usterka rysowania).
 *
 * Pod progiem nie rysuje NIC - ani plamek, ani treści (`loadableView`). Do 2026-10-05
 * rysował wtedy treść, a ta liczyła wiersze z `data ?? []`: pierwsze wejście w moduł
 * potrafiło pokazać „nikogo nie ma", zanim wyszły plamki albo dane. Co ma stać
 * w trakcie odczytu (nagłówek, filtry, pola), stoi POZA `Loadable`.
 *
 * `loaded` jest WYMAGANE (2026-10-06): po nieudanym odczycie `pending` gaśnie, a danych
 * nie ma, więc treść rysowała stan pusty pod banerem błędu. Ekran podaje, czy dane są
 * (`query.data != null`), i bez nich nie dostaje treści także po odczycie - a baner
 * błędu (`loadErrorMessage`) stoi POZA `Loadable`, żeby było co przeczytać. Prop bez
 * wartości domyślnej, bo zapomniany wracałby po cichu do starej usterki.
 *
 * Dlaczego komponent, a nie hook: reguła panelu mówi, że plik `.tsx` eksportuje
 * wyłącznie komponenty, a moduł `.ts` w `ui/` nie zna Reacta. Timer musi więc mieszkać
 * w komponencie - a przy okazji wychodzi z tego lepsze API: ekran pisze, CO pokazać
 * zamiast treści, a nie żongluje flagą.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { loadableView, remainingHoldMs, SKELETON_DELAY_MS } from './skeletonGate';

interface LoadableProps {
  /** Odczyt w drodze, a danych jeszcze nie ma - od tego liczy się próg plamek. */
  pending: boolean;
  /** Czy treść ma z czego się policzyć (zwykle `query.data != null`). */
  loaded: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}

export function Loadable({ pending, loaded, skeleton, children }: LoadableProps) {
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

  const view = loadableView(pending, visible, loaded);
  return <>{view === 'skeleton' ? skeleton : view === 'content' ? children : null}</>;
}
