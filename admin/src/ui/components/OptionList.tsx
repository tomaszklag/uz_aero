/**
 * UZ Aero — panel: lista kart wyboru (`.opt-list` z `SZABLON.html`).
 *
 * Jedyny dozwolony „select" w całym produkcie (`CLAUDE.md`: zakaz natywnego
 * `<select>` — wybór to zawsze widoczna lista kart). W szufladzie flagi ta sama
 * lista służy do NAWIGACJI: pozycje są linkami w głąb, do kart dni objętych sprawą.
 */

import type { ReactNode } from 'react';

interface OptionListProps {
  children: ReactNode;
  /**
   * Nazwa grupy dla czytnika ekranu. Podana — lista staje się `radiogroup`, czyli
   * WYBOREM jednej opcji; pominięta — zostaje zwykłym kontenerem, bo w szufladzie
   * flagi te same karty są linkami w głąb, a nie wyborem.
   */
  ariaLabel?: string;
}

export function OptionList({ children, ariaLabel }: OptionListProps) {
  if (ariaLabel == null) return <div className="opt-list">{children}</div>;
  return (
    <div className="opt-list" role="radiogroup" aria-label={ariaLabel}>
      {children}
    </div>
  );
}
