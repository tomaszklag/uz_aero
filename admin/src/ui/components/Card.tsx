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
  /**
   * Ton karty niosącej decyzję (`danger` - odwołanie, `warn` - uprzedzenie).
   * Ton siedzi we WŁOSIE I TLE, nie w wypełnieniu: karta w pełnym kolorze byłaby
   * najgłośniejszym elementem szuflady, a intencją wchodzącego jest przeczytanie
   * szczegółów, nie kasowanie.
   */
  tone?: 'danger' | 'warn';
  children: ReactNode;
}

export function Card({ title, actions, style, span2 = false, tone, children }: CardProps) {
  return (
    <div className={['card', span2 ? 'span-2' : null, tone].filter((c) => c != null).join(' ')} style={style}>
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
