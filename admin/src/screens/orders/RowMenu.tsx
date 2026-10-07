/**
 * Ninerdeck - panel: „⋯" PRZY ADRESACIE ZLECENIA i jego menu (makieta `zlecenia-szczegoly`,
 * ZL3b; 4.0.0, epik Z-D #248).
 *
 * Przycisk cichy, w stałej kolumnie wiersza (`.rcp-icon`, jak ołówek osi), a menu jest
 * warstwą nad kartą (`.menu`). Pozycje liczy `recipientMenu.ts` - tu są wyłącznie zachowania:
 *  · otwarcie przenosi fokus na pierwszą pozycję, strzałki chodzą po pozycjach;
 *  · Escape zamyka menu (nie szufladę pod nim) i oddaje fokus przyciskowi, Tab
 *    i kliknięcie obok zamykają;
 *  · wybór pozycji zamyka menu i oddaje czynność szufladzie, która stawia pytanie
 *    w miejscu wiersza - menu niczego nie zapisuje.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

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
  const menu = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector<HTMLButtonElement>('.menu-item')?.focus();
    const outside = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key === 'Escape') {
      // Szuflada zamyka się na Escape nasłuchem na dokumencie - zdarzenie zatrzymuje się
      // tu, bo Escape w otwartym menu zamyka MENU, a nie szufladę pod nim.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('.menu-item') ?? []);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  };

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
        <span ref={menu} className="menu" role="menu" aria-label={`Czynności · ${name}`} onKeyDown={onKeyDown}>
          {entries.map((entry) => (
            <button
              key={entry.action.kind}
              type="button"
              role="menuitem"
              className={entry.danger ? 'menu-item danger' : 'menu-item'}
              onClick={() => {
                setOpen(false);
                onSelect(entry.action);
              }}
            >
              {ICONS[entry.action.kind]()}
              {entry.label}
            </button>
          ))}
        </span>
      ) : null}
    </>
  );
}
