/**
 * UZ Aero - panel: siatka wyboru / pól w rzędzie (`.opt-grid` z `SZABLON.html`).
 *
 * Ten sam kontener obsługuje dwa zastosowania, bo obydwa są tą samą rzeczą: rzędem,
 * który zwija się na wąskim ekranie. `SZABLON.html` definiuje klasę przy KARTACH
 * WYBORU, a `A07a-samolot.html` używa jej dla dwóch PÓL formularza („Rok produkcji"
 * obok „Pojemności zbiorników"). Osobny komponent na każdy z tych przypadków dałby
 * dwie nazwy dla jednej reguły CSS.
 */

import type { ReactNode } from 'react';

export function OptionGrid({ children }: { children: ReactNode }) {
  return <div className="opt-grid">{children}</div>;
}
