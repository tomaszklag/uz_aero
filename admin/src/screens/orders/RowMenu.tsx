/**
 * Ninerdeck - panel: „⋯" PRZY ADRESACIE ZLECENIA i jego menu (makieta `zlecenia-szczegoly`,
 * ZL3b; 4.0.0, epik Z-D #248).
 *
 * Przycisk cichy, w stałej kolumnie wiersza (`.rcp-icon`, jak ołówek osi), a menu jest
 * warstwą nad kartą (`Menu` - ta sama obsługa klawiatury, co menu wolnej komórki
 * kalendarza). Pozycje liczy `recipientMenu.ts`; wybór pozycji oddaje czynność szufladzie,
 * która stawia pytanie w miejscu wiersza - menu niczego nie zapisuje.
 */

import { useRef, useState, type ReactNode } from 'react';

import { Menu } from '../../ui/components';
import { MoreIcon, PersonMinusIcon, PersonXIcon, SwapIcon } from '../../ui/components/icons';
import type { MenuEntry, RecipientAction } from './recipientMenu';

interface Props {
  /** Nazwisko osoby wiersza - do etykiet czytnika ekranu. */
  name: string;
  entries: readonly MenuEntry[];
  disabled: boolean;
  onSelect: (action: RecipientAction) => void;
}

const ICONS: Record<RecipientAction['kind'], () => ReactNode> = {
  swap: () => <SwapIcon />,
  remove: () => <PersonMinusIcon />,
  unassign: () => <PersonXIcon size={14} />,
};

export function RowMenu({ name, entries, disabled, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  if (entries.length === 0) return null;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="rcp-icon"
        aria-label={`Więcej · ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
      >
        <MoreIcon />
      </button>
      {open ? (
        <Menu
          label={`Czynności · ${name}`}
          trigger={trigger}
          onClose={() => setOpen(false)}
          items={entries.map((entry) => ({
            key: entry.action.kind,
            label: entry.label,
            icon: ICONS[entry.action.kind](),
            danger: entry.danger,
            onSelect: () => onSelect(entry.action),
          }))}
        />
      ) : null}
    </>
  );
}
