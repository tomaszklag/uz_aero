/**
 * UZ Aero - panel: OŚ ZDARZEŃ, kontener (`.tl` z `SZABLON.html`).
 *
 * Oś czyta się jak rejestr, nie jak lista: kolejność jest chronologiczna, a wiersze
 * są rodzeństwem bez własnych opakowań, bo to `.tl-row:not(:last-child)` rysuje szynę
 * między kropkami i `.tl-row:last-child` zdejmuje ostatnią kreskę. Dodatkowy `<div>`
 * wokół wiersza zepsułby oba selektory naraz.
 *
 * Element jest `<ol>`, mimo że mockup używa `<div>`: oś ma znaczenie porządkowe, więc
 * czytnik ekranu ma prawo usłyszeć „lista, 84 pozycje", zamiast dostać ciąg akapitów.
 * Wygląd bez zmian - `list-style` zdejmuje arkusz.
 */

import type { ReactNode } from 'react';

/**
 * `compact` to wariant osi w WĄSKIEJ kolumnie bocznej (pulpit, `A01`): trzy tory
 * siatki zamiast czterech i stopień mniejsze rozmiary. Modyfikator, nie osobny
 * komponent - zachowanie, znaczenie kolorów kropek i stan `voided` są identyczne,
 * zmienia się wyłącznie ilość miejsca.
 */
export function Timeline({ compact = false, children }: { compact?: boolean; children: ReactNode }) {
  return <ol className={compact ? 'tl compact' : 'tl'}>{children}</ol>;
}
