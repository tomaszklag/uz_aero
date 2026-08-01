/**
 * UZ Aero — panel: przycisk, który jest LINKIEM (`<a class="btn">` z `SZABLON.html`).
 *
 * Osobny komponent od `Button`, bo to inny element i inne zachowanie: link można
 * otworzyć w nowej karcie, skopiować i wkleić — a `Button` z `navigate()` w `onClick`
 * tego nie umie i psuje scenariusz deep linków, dla którego panel istnieje.
 *
 * `disabled` NIGDY nie występuje bez `reason`, tak samo jak w `Button`: **powód
 * blokady jest widocznym tekstem, nie tooltipem**. Link zablokowany przestaje być
 * linkiem (`<span>`), a nie „linkiem z `preventDefault`" — link, który wygląda jak
 * link i nie działa, jest osiągalny tabem i myli klawiaturę.
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/** Warianty jak w `Button` — `ok` to zielona obramówka (akcja przywracająca). */
type Variant = 'primary' | 'ghost' | 'danger' | 'ok' | 'default';

interface LinkButtonProps {
  to: string;
  variant?: Variant;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Wymagany, gdy `disabled` — dopisuje się do etykiety i trafia do `title`. */
  reason?: string;
  children: ReactNode;
}

export function LinkButton({
  to,
  variant = 'default',
  size = 'md',
  disabled = false,
  reason,
  children,
}: LinkButtonProps) {
  const classes = ['btn', variant === 'default' ? null : variant, size === 'sm' ? 'sm' : null]
    .filter((c) => c != null)
    .join(' ');

  if (disabled) {
    return (
      <span className={`${classes} disabled`} aria-disabled="true" title={reason}>
        {children}
        {reason == null ? null : ` — ${reason.toLowerCase()}`}
      </span>
    );
  }

  return (
    <Link className={classes} to={to}>
      {children}
    </Link>
  );
}
