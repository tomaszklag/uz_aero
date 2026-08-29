/**
 * UZ Aero - panel: plakietka stanu (`.pill` z `SZABLON.html`).
 *
 * `dot` = kropka w tonie akcentu, `live` = kropka pulsująca (stan TRWAJĄCY, np.
 * samolot w locie). Puls bez trwania byłby ozdobą, a ruch na ekranie ma znaczyć,
 * że coś się właśnie dzieje.
 */

import type { ReactNode } from 'react';

export type PillTone = 'green' | 'amber' | 'red' | 'blue' | 'dim';

interface PillProps {
  tone: PillTone;
  dot?: boolean;
  live?: boolean;
  children: ReactNode;
}

export function Pill({ tone, dot = false, live = false, children }: PillProps) {
  return (
    <span className={`pill ${tone}`}>
      {dot || live ? <span className={live ? 'dot live' : 'dot'} /> : null}
      {children}
    </span>
  );
}
