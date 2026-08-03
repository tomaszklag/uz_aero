/**
 * UZ Aero — panel: pasek filtrów (`.filters` z `SZABLON.html`).
 *
 * Wiersz zawijalny; treść wstawia ekran, bo to ekran wie, co da się filtrować.
 * Mockup `A03` używa dwóch takich pasków jeden pod drugim (status i zakres,
 * potem typy) — komponent nie zna tej liczby i nie powinien.
 */

import type { ReactNode } from 'react';

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filters">{children}</div>;
}
