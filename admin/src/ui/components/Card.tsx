/**
 * Ninerdeck - panel: karta (`.card` + `.card-title` z `SZABLON.html`).
 *
 * `actions` to slot po prawej stronie tytułu (`.spacer` w mockupie) - używa go
 * A00a, wstawiając tam plakietkę `401`.
 */

import type { CSSProperties, ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  actions?: ReactNode;
  /** Szerokość karty formularza z mockupu (A00: 420 px). Wyłącznie wymiar układu. */
  style?: CSSProperties;
  /**
   * Karta na OBIE kolumny siatki `.card-grid` (`.span-2` z mockupu `konto`).
   *
   * Prop, a nie styl inline u wołającego: klasa jest w arkuszu, więc makieta i panel
   * mówią o tej samej regule układu jedną nazwą - a `gridColumn` wpisany w JSX byłby
   * drugą definicją tego samego, niewidoczną dla generatora `panel.css`.
   */
  span2?: boolean;
  children: ReactNode;
}

export function Card({ title, actions, style, span2 = false, children }: CardProps) {
  return (
    <div className={span2 ? 'card span-2' : 'card'} style={style}>
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
