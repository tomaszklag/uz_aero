/**
 * UZ Aero - BRAMKA SKELETONU: kiedy plamki wolno pokazać, a kiedy trzeba je utrzymać.
 *
 * Reguła 5 wzorca (`design/LOADERY.html`) i jedyny kawałek tego wzorca, który jest
 * logiką, a nie wyglądem - dlatego mieszka osobno i ma test.
 *
 * Problem jest w rozkładzie czasów, nie w samym czekaniu. Prawie wszystko, na co czeka
 * ta aplikacja, jest LOKALNE (SQLite): doba pilota, historia dni, cache referencyjny.
 * Typowy odczyt to kilkadziesiąt milisekund - skeleton pokazany natychmiast byłby
 * mrugnięciem, które czyta się gorzej niż spokojna pustka. Ale ten sam odczyt na
 * strumieniu po sezonie albo zaraz po odtworzeniu rejestru z serwera (§4.9) trwa
 * zauważalnie i wtedy pustka wygląda jak zawieszona aplikacja.
 *
 * Stąd dwa progi:
 *  • `SKELETON_DELAY_MS` - dopóki czekanie jest krótsze, ekran nie rysuje NIC. Zwykły
 *    odczyt kończy się w tym oknie i pilot widzi po prostu gotową treść;
 *  • `SKELETON_MIN_MS` - gdy plamki zdążyły się pojawić, zostają na minimalny czas.
 *    Bez tego dane, które przyszły 20 ms po progu, kasowałyby skeleton w połowie
 *    pierwszego pulsu - czyli produkowały dokładnie to mignięcie, którego próg unika.
 *
 * Funkcja jest czysta i pytana o KONKRETNĄ chwilę; harmonogramem przerysowań zajmuje
 * się `useSkeleton`.
 */

/** Ile czekania trzeba, żeby skeleton w ogóle się pokazał. */
export const SKELETON_DELAY_MS = 180;

/** Ile skeleton zostaje na ekranie, kiedy już się pokazał. */
export const SKELETON_MIN_MS = 420;

export interface SkeletonGateInput {
  /** Czy dane wciąż są w drodze. */
  pending: boolean;
  /** Chwila, w której zaczęło się bieżące czekanie (`null` = nie czekamy). */
  pendingSince: number | null;
  /** Chwila, w której plamki weszły na ekran (`null` = jeszcze się nie pokazały). */
  shownSince: number | null;
  now: number;
}

/** Czy w chwili `now` na ekranie mają być plamki. */
export function skeletonVisible({
  pending,
  pendingSince,
  shownSince,
  now,
}: SkeletonGateInput): boolean {
  if (pending) {
    if (shownSince != null) return true;
    return pendingSince != null && now - pendingSince >= SKELETON_DELAY_MS;
  }

  // Dane doszły. Skeleton, który zdążył się pokazać, dotrzymuje minimum; ten, który
  // się nie pokazał, nie ma czego dotrzymywać.
  return shownSince != null && now - shownSince < SKELETON_MIN_MS;
}

/**
 * Za ile milisekund odpowiedź `skeletonVisible` sama się zmieni - `null`, gdy stan jest
 * stabilny i nie ma po co budzić Reacta. Hook zamienia to na jeden `setTimeout`.
 */
export function skeletonNextChangeIn({
  pending,
  pendingSince,
  shownSince,
  now,
}: SkeletonGateInput): number | null {
  if (pending) {
    if (shownSince != null || pendingSince == null) return null;
    return Math.max(0, pendingSince + SKELETON_DELAY_MS - now);
  }

  if (shownSince == null) return null;
  const left = shownSince + SKELETON_MIN_MS - now;
  return left > 0 ? left : null;
}
