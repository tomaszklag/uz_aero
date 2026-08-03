/**
 * UZ Aero — panel: karta (`.card` + `.card-title` z `SZABLON.html`).
 *
 * `actions` to slot po prawej stronie tytułu (`.spacer` w mockupie) — używa go
 * A00a, wstawiając tam plakietkę `401`.
 */

import type { CSSProperties, ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  actions?: ReactNode;
  /** Szerokość karty formularza z mockupu (A00: 420 px). Wyłącznie wymiar układu. */
  style?: CSSProperties;
  children: ReactNode;
}

export function Card({ title, actions, style, children }: CardProps) {
  return (
    <div className="card" style={style}>
      {title == null ? null : (
        <div className="card-title">
          {title}
          {actions == null ? null : (
            <>
              <span className="spacer" />
              {actions}
            </>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
