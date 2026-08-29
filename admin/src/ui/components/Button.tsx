/**
 * UZ Aero - panel: przycisk (`.btn` z `SZABLON.html`).
 *
 * `disabled` NIGDY nie występuje bez `disabledReason` - to ta sama reguła, którą
 * `ActionButton` egzekwuje w aplikacji pilota: **powód blokady jest widocznym tekstem,
 * nie tooltipem**. Przycisk, którego nie da się kliknąć i nie wiadomo dlaczego, jest
 * gorszy od przycisku, który odmawia z komunikatem.
 *
 * Nazwy klas zostają DOSŁOWNE (`class="btn primary"`), bez CSS Modules i haszy:
 * dopóki nazwa jest ta sama po obu stronach, grep po `btn` znajduje jednocześnie
 * mockup i komponent, a recenzent porównuje DOM z plikiem HTML linia w linię.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * `ok` to zielona OBRAMÓWKA (`.btn.ok`), czyli odwrotność `danger` - akcja
 * przywracająca („Aktywuj" konta na A06). `primary` zostaje akcją GŁÓWNĄ ekranu
 * i w kolumnie tabeli nie ma czego szukać: kilkanaście przycisków głównych naraz
 * znaczy, że żaden nie jest główny.
 */
type Variant = 'primary' | 'ghost' | 'danger' | 'ok' | 'default';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  size?: 'sm' | 'md';
  /** Przycisk na całą szerokość karty (A00: „Zaloguj się"). */
  block?: boolean;
  /**
   * Powód blokady - dopisuje się do ETYKIETY i trafia do `title`, dokładnie jak
   * w `LinkButton`.
   *
   * Nagłówek tego pliku deklarował tę regułę od pierwszego przekroju, a komponent jej
   * NIE MIAŁ: dopóki wszystkie zablokowane przyciski panelu były linkami, różnicy nie
   * było widać. Pierwszą prawdziwą akcją z powodem blokady jest „Ponów" na `A05`
   * („najpierw rozstrzygnij flagę #1046"), więc reguła dostaje wreszcie implementację
   * zamiast obietnicy w prozie.
   */
  reason?: string;
  children: ReactNode;
}

export function Button({
  variant = 'default',
  size = 'md',
  block = false,
  reason,
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

  const blocked = rest.disabled === true && reason != null;

  return (
    <button type="button" {...rest} {...(blocked ? { title: reason } : {})} className={classes}>
      {children}
      {/* Powód pokazujemy WYŁĄCZNIE przy faktycznej blokadzie: dopisany do przycisku
          czynnego byłby zdaniem o stanie, którego nie ma. */}
      {blocked ? ` - ${reason.toLowerCase()}` : null}
    </button>
  );
}
