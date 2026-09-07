/**
 * UZ Aero - panel: baner (`.banner` z `SZABLON.html`, typy z `docs/design-notes.md`).
 *
 * **Ikona wynika z TONU, nigdy z propsa.** To nie jest oszczędność API: baner
 * ostrzegawczy z ikoną informacji uczy, że kolor nic nie znaczy - a w panelu kolor
 * jest jedyną rzeczą, którą widać kątem oka.
 *
 * Cztery tony: `status` (przyrząd - stan świata), `warn` (ostrzeżenie warunkowe),
 * `danger` (błąd), `ok` (potwierdzenie). Banery panelu NIE SĄ zamykalne - trzeci typ
 * z `design-notes.md` (pouczający jednorazowy) należy do aplikacji pilota.
 */

import type { ReactNode } from 'react';

import { ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from './icons';

export type BannerTone = 'status' | 'warn' | 'danger' | 'ok';

const ICONS: Record<BannerTone, (props: { size?: number }) => ReactNode> = {
  status: InfoIcon,
  warn: WarningIcon,
  danger: ErrorIcon,
  ok: SuccessIcon,
};

interface BannerProps {
  tone: BannerTone;
  /** `role="alert"` dla treści, która POJAWIA SIĘ w reakcji na akcję (np. odmowa 401). */
  live?: boolean;
  style?: React.CSSProperties;
  children: ReactNode;
}

export function Banner({ tone, live = false, style, children }: BannerProps) {
  const Icon = ICONS[tone];
  return (
    <div className={`banner ${tone}`} style={style} role={live ? 'alert' : undefined}>
      <Icon size={15} />
      <span>{children}</span>
    </div>
  );
}
