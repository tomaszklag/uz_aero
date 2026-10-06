/**
 * Ninerdeck - panel 2.0: KIEDY pokazać plamki ładowania, a kiedy nie.
 *
 * Moduł CZYSTY (bez Reacta), bo to jedyna część stanu ładowania sprawdzalna bez
 * przeglądarki - i ta, która psuje się najciszej.
 *
 * Reguła jest ta sama, co w aplikacji pilota (`app/src/ui/screens/logic/skeletonGate.ts`,
 * issue #33) i z tych samych dwóch powodów:
 *  • **próg** - odpowiedź, która wróciła w 90 ms, nie ma prawa mrugnąć plamkami;
 *    skeleton pokazany i schowany szybciej, niż oko go złapie, czyta się jak usterka
 *    rysowania;
 *  • **minimum** - skeleton, który JUZ się pokazał, zostaje chwilę, nawet gdy dane
 *    przyszły zaraz po nim. Bez tego wolniejsze łącze daje błysk plamek zamiast
 *    spokojnego przejścia.
 *
 * Pod progiem nie ma też TREŚCI (`loadableView`): stan pusty narysowany w trakcie
 * odczytu jest nieprawdą o danych. Na telefonie ten sam efekt daje flaga `loaded`,
 * na którą czeka stan pusty.
 *
 * Panel czyta z sieci, nie z lokalnej bazy, więc próg przekracza tu więcej odpowiedzi
 * niż na telefonie - i tak ma być: to jest ta sama reguła, tylko postawiona przed
 * wolniejszym źródłem.
 */

/** Poniżej tego czasu odpowiedzi nie rysujemy nic - ekran po prostu się pojawia. */
export const SKELETON_DELAY_MS = 180;

/** Gdy już pokazaliśmy plamki, zostają co najmniej tyle. */
export const SKELETON_MIN_MS = 420;

/**
 * Ile jeszcze trzymać plamki, gdy dane przyszły w chwili `now`.
 *
 * `shownAt == null` znaczy „plamek nigdy nie pokazaliśmy" - wtedy nie ma czego
 * trzymać i odpowiedź wchodzi natychmiast. Wynik nigdy nie jest ujemny.
 */
export function remainingHoldMs(shownAt: number | null, now: number): number {
  if (shownAt == null) return 0;
  const elapsed = now - shownAt;
  return elapsed >= SKELETON_MIN_MS ? 0 : SKELETON_MIN_MS - elapsed;
}

/** Co `Loadable` rysuje w danej chwili. */
export type LoadableView = 'skeleton' | 'nothing' | 'content';

/**
 * Co rysuje `Loadable` przy danym stanie odczytu (`pending`) i plamek (`visible`).
 *
 * Stany są TRZY, nie dwa: pod progiem odczyt trwa, a plamek jeszcze nie ma - i wtedy
 * nie rysujemy NIC. Treść w tym oknie nie jest neutralna: ekrany liczą wiersze
 * z `query.data ?? []`, więc pusta tablica rysowała stan pusty („nikogo nie ma"), zanim
 * wyszły plamki albo dane. Skeleton nie jest stanem pustym, a stan pusty pokazany
 * w trakcie odczytu jest nieprawdą o danych.
 *
 * Plamki wygrywają z `pending`: po przyjściu danych dotrzymują minimum
 * (`remainingHoldMs`), więc `visible` bez `pending` to nadal skeleton.
 */
export function loadableView(pending: boolean, visible: boolean): LoadableView {
  if (visible) return 'skeleton';
  return pending ? 'nothing' : 'content';
}
