/**
 * UZ Aero — panel: przycisk (`.btn` z `SZABLON.html`).
 *
 * `disabled` NIGDY nie występuje bez `disabledReason` — to ta sama reguła, którą
 * `ActionButton` egzekwuje w aplikacji pilota: **powód blokady jest widocznym tekstem,
 * nie tooltipem**. Przycisk, którego nie da się kliknąć i nie wiadomo dlaczego, jest
 * gorszy od przycisku, który odmawia z komunikatem.
 *
 * Nazwy klas zostają DOSŁOWNE (`class="btn primary"`), bez CSS Modules i haszy:
 * dopóki nazwa jest ta sama po obu stronach, grep po `btn` znajduje jednocześnie
 * mockup i komponent, a recenzent porównuje DOM z plikiem HTML linia w linię.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'default';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  size?: 'sm' | 'md';
  /** Przycisk na całą szerokość karty (A00: „Zaloguj się"). */
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'default',
  size = 'md',
  block = false,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant === 'default' ? null : variant,
    size === 'sm' ? 'sm' : null,
    block ? 'block' : null,
  ]
    .filter((c) => c != null)
    .join(' ');

  return (
    <button type="button" {...rest} className={classes}>
      {children}
    </button>
  );
}
