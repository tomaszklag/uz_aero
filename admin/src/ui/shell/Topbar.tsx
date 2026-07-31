/**
 * UZ Aero — panel: topbar (`.topbar` z `SZABLON.html`).
 *
 * Okruszki po lewej, zegar UTC po prawej. Nic więcej — mockup nie przewiduje tu
 * ani wyszukiwarki globalnej, ani powiadomień, a topbar widoczny na każdym ekranie
 * jest najgorszym miejscem na „jeszcze jedną drobną rzecz".
 */

import { Breadcrumbs } from './Breadcrumbs';
import { UtcClock } from './UtcClock';

export function Topbar({ trail }: { trail: string[] }) {
  return (
    <div className="topbar">
      <Breadcrumbs trail={trail} />
      <div className="topbar-right">
        <UtcClock />
      </div>
    </div>
  );
}
