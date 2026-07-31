/**
 * UZ Aero — panel: lista kart wyboru (`.opt-list` z `SZABLON.html`).
 *
 * Jedyny dozwolony „select" w całym produkcie (`CLAUDE.md`: zakaz natywnego
 * `<select>` — wybór to zawsze widoczna lista kart). W szufladzie flagi ta sama
 * lista służy do NAWIGACJI: pozycje są linkami w głąb, do kart dni objętych sprawą.
 */

import type { ReactNode } from 'react';

export function OptionList({ children }: { children: ReactNode }) {
  return <div className="opt-list">{children}</div>;
}
