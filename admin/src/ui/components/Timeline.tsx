/**
 * UZ Aero — panel: OŚ ZDARZEŃ, kontener (`.tl` z `SZABLON.html`).
 *
 * Oś czyta się jak rejestr, nie jak lista: kolejność jest chronologiczna, a wiersze
 * są rodzeństwem bez własnych opakowań, bo to `.tl-row:not(:last-child)` rysuje szynę
 * między kropkami i `.tl-row:last-child` zdejmuje ostatnią kreskę. Dodatkowy `<div>`
 * wokół wiersza zepsułby oba selektory naraz.
 *
 * Element jest `<ol>`, mimo że mockup używa `<div>`: oś ma znaczenie porządkowe, więc
 * czytnik ekranu ma prawo usłyszeć „lista, 84 pozycje", zamiast dostać ciąg akapitów.
 * Wygląd bez zmian — `list-style` zdejmuje arkusz.
 */

import type { ReactNode } from 'react';

export function Timeline({ children }: { children: ReactNode }) {
  return <ol className="tl">{children}</ol>;
}
