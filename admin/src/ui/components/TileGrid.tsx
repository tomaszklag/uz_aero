/**
 * UZ Aero — panel: siatka kafli (`.tiles` z `SZABLON.html`).
 *
 * Osobny plik od `Tile`, bo to osobna odpowiedzialność: siatka odpowiada za układ
 * (`auto-fit`, `minmax(180px, 1fr)`), kafel — za treść. Dzięki temu kafle da się
 * ustawić także poza siatką, gdy ekran tego wymaga.
 */

import type { ReactNode } from 'react';

export function TileGrid({ children }: { children: ReactNode }) {
  return <div className="tiles">{children}</div>;
}
