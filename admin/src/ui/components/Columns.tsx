/**
 * UZ Aero — panel: siatka dwukolumnowa treści (`.cols` z `SZABLON.html`).
 *
 * Domyślnie `1fr 380px`: po lewej rzecz główna (oś zdarzeń dnia), po prawej przypisy
 * do niej (kafle sesji, paliwa, motogodzin). `even` daje `1fr 1fr` tam, gdzie obie
 * kolumny są równorzędne.
 *
 * `wide` (`1fr 400px`) doszedł razem z pulpitem (`A01`) — jedynym ekranem, na którym
 * prawa kolumna niesie WŁASNĄ treść (puls rejestru: napływ zdarzeń, ostatnio przyjęte,
 * dziś w liczbach), a nie przypis do lewej. Baza zostaje bez zmian, bo szersza prawa
 * znaczy węższa lewa, a w lewej stoją tabele — 20 px mniej potrafi przyciąć kolumnę.
 *
 * Warianty są PROPSAMI LOGICZNYMI, a nie napisem: `variant="wide"` z literówką byłoby
 * cichym powrotem do bazy, a `wide` niebędące `true` po prostu się nie kompiluje.
 */

import type { ReactNode } from 'react';

interface ColumnsProps {
  /** `even` = `1fr 1fr`; bez tego prawa kolumna ma stałe 380 px. */
  even?: boolean;
  /** `wide` = `1fr 400px`. Wyklucza się z `even` — pierwszeństwo ma `even`. */
  wide?: boolean;
  children: ReactNode;
}

/** Pełne literały klas, nigdy sklejenie — reguła z `admin/test/architecture.test.ts`. */
function columnsClass(even: boolean, wide: boolean): string {
  if (even) return 'cols even';
  return wide ? 'cols wide' : 'cols';
}

export function Columns({ even = false, wide = false, children }: ColumnsProps) {
  return <div className={columnsClass(even, wide)}>{children}</div>;
}
