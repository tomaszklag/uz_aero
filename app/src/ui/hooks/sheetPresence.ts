/**
 * UZ Aero - REJESTR OTWARTYCH ARKUSZY: czy nad ekranem stoi w tej chwili `SheetSurface`.
 *
 * ══ PO CO ══
 * Bo zdarzenia klawiatury w React Native są GLOBALNE dla aplikacji, a arkusz żyje we
 * własnym oknie natywnym (`Modal`). Ekran pod spodem dostaje więc `keyboardDidShow` od
 * pola, którego u siebie nie ma - i reaguje: kurczy się o wysokość klawiatury (`Screen`)
 * oraz dociąga listę (`useKeyboardAwareScroll`). Skutek widać dopiero przy ZAMYKANIU
 * arkusza i opisuje go zgłoszenie z urządzenia (2026-09-04): „czasem jak mam na manualnym
 * locie przejście na ekran z przebiegiem operacji, to tak jakby dwa razy muszę kliknąć
 * DALEJ" - pilot tapie przycisk tam, gdzie go widzi, a layout w tej samej chwili wraca
 * na miejsce, bo `keyboardDidHide` pada na Androidzie dopiero po animacji chowania.
 *
 * Rejestr jest odpowiedzią na pytanie „czyja to klawiatura", a decyzję, co z tego wynika,
 * podejmuje `keyboardBorrowedBySheet` (`keyboardGeometry.ts`) - tam też pełne uzasadnienie.
 *
 * ══ DLACZEGO LICZNIK, A NIE FLAGA ══
 * Arkusze bywają nad sobą: zamykany trzyma jeszcze okno przez animację wyjazdu, gdy
 * następny już się montuje. Flaga zgasłaby na tym styku i ekran złapałby cudzą
 * klawiaturę dokładnie w chwili przejścia między arkuszami.
 *
 * Czysty moduł: bez Reacta, bez RN. Adapter dla komponentów to `useOwnKeyboardHeight`.
 */

let open = 0;
const listeners = new Set<() => void>();

/**
 * Zgłasza arkusz jako obecny i oddaje funkcję zwalniającą. Zwolnienie jest
 * jednorazowe - podwójne wywołanie (odmontowanie po ręcznym zwolnieniu) nie może
 * zejść poniżej zera, bo licznik przestałby wtedy widzieć następne arkusze.
 */
export function registerSheet(): () => void {
  open += 1;
  emit();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    open -= 1;
    emit();
  };
}

/** Czy nad ekranem stoi choć jeden arkusz. */
export function sheetsOpen(): boolean {
  return open > 0;
}

/** Subskrypcja dla `useSyncExternalStore`; zwraca funkcję odsubskrybowania. */
export function subscribeSheets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Wyłącznie dla testów - stan globalny nie może przeciekać między przypadkami. */
export function resetSheetPresence(): void {
  open = 0;
  listeners.clear();
}

function emit(): void {
  for (const listener of listeners) listener();
}
