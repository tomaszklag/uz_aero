/**
 * UZ Aero - zaznaczenie pola wpisu przy otwarciu arkusza (`ReadingSheet`, `OilSheet`).
 *
 * Historia w DWÓCH zgłoszeniach z urządzenia:
 *  1. (2026-07-30) `selectTextOnFocus` na polu sterowanym odnawia zaznaczenie przy
 *     każdym programowym ustawieniu tekstu - druga wpisana cyfra wymazywała pierwszą.
 *     Stąd zaznaczenie STEROWANE, ustawiane jawnie przy otwarciu.
 *  2. (2026-09-02, arkusz oleju) sterowane ZAZNACZ WSZYSTKO trzymane aż do pierwszej
 *     cyfry walczyło z palcem: każde odświeżenie pola przywracało zaznaczenie całości,
 *     więc kursora nie dało się postawić tapnięciem W OGÓLE. „Zamiast zaznaczać całość
 *     daj kursor na koniec i otwórz klawiaturę."
 *
 * Reguła po obu: przy otwarciu KURSOR NA KOŃCU wpisu (`cursorAtEnd` - dopisanie cyfry
 * jest bezpieczne, a skasowanie całości to przytrzymany backspace), a sterowanie oddaje
 * się polu w chwili, w której natywna strona doniesie zadaną pozycję
 * (`selectionApplied` → `setSelection(undefined)`). Od tej chwili kursorem rządzi palec.
 *
 * Zwolnienie porównuje zdarzenie Z CELEM, a nie zwalnia na pierwszym z brzegu:
 * `onSelectionChange` potrafi dojść z pozycją z fokusu ({0,0}) albo sprzed maski,
 * a zwolnienie na takim zdarzeniu zostawiłoby kursor tam, gdzie nikt nie celował.
 * Z tego samego powodu pozycji ZE zdarzenia nigdy nie wpisujemy do stanu - stan
 * zaznaczenia zna wyłącznie dwie wartości: cel z otwarcia i `undefined`.
 */

export interface SelectionRange {
  start: number;
  end: number;
}

/** Kursor za ostatnim znakiem, bez zaznaczenia - pozycja pola przy otwarciu arkusza. */
export function cursorAtEnd(text: string): SelectionRange {
  return { start: text.length, end: text.length };
}

/**
 * Czy natywne pole doniosło DOKŁADNIE zadaną pozycję - wtedy (i tylko wtedy)
 * sterowanie zaznaczeniem oddaje się polu. `undefined` = sterowania już nie ma,
 * więc nie ma też czego zwalniać.
 */
export function selectionApplied(
  target: SelectionRange | undefined,
  reported: SelectionRange,
): boolean {
  return target != null && reported.start === target.start && reported.end === target.end;
}
