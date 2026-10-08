/**
 * Ninerdeck - panel: MENU CZYNNOŚCI (`.menu`) - warstwa z listą pozycji nad kartą albo osią.
 *
 * Jedno zachowanie dla dwóch miejsc: „⋯" przy adresacie zlecenia (ZL3b) i wolna komórka
 * kalendarza dla osoby ze „Zlecaniem lotów" (`.menu.cell-menu`, K1; 4.0.0). Dwie kopie tej
 * samej obsługi klawiatury rozjechałyby się przy pierwszej poprawce jednej z nich:
 *  - otwarcie przenosi fokus na pierwszą pozycję, strzałki chodzą po pozycjach w kółko;
 *  - Escape zamyka MENU (nie szufladę pod nim - ta nasłuchuje na dokumencie, więc zdarzenie
 *    zatrzymuje się tutaj) i oddaje fokus przyciskowi, który je otworzył;
 *  - Tab i kliknięcie obok zamykają; kliknięcie w przycisk otwierający nie jest „obok" -
 *    przełącza go sam przycisk;
 *  - wybór pozycji najpierw zamyka menu, potem oddaje czynność wołającemu: menu niczego nie
 *    zapisuje, a czynność bywa otwarciem szuflady, która zabiera fokus.
 *
 * Menu rysuje się WYŁĄCZNIE otwarte - stan „otwarte" trzyma wołający, bo to on ma przycisk.
 */

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

export interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** Czynność, która komuś coś odbiera - czerwień, jak w makiecie ZL3b. */
  danger?: boolean;
  onSelect: () => void;
}

interface Props {
  /** Etykieta czytnika ekranu - „Czynności · Jakub Wrona", „SP-ELG, sobota 20 września". */
  label: string;
  /** Klasa położenia obok `menu` - `cell-menu` zaczepia warstwę o lewą krawędź komórki. */
  placement?: string;
  items: readonly MenuItem[];
  /** Przycisk otwierający - kliknięcie w niego nie zamyka „obok", Escape oddaje mu fokus. */
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

export function Menu({ label, placement, items, trigger, onClose }: Props) {
  const menu = useRef<HTMLSpanElement>(null);
  // Najświeższe `onClose` bez ponawiania efektu - ponowiony oddawałby fokus pierwszej
  // pozycji przy każdym renderze ekranu pod spodem (kanał klubu odświeża listy w tle).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('.menu-item')?.focus();
    const outside = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || menu.current?.contains(target)) return;
      close.current();
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [trigger]);

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close.current();
      trigger.current?.focus();
      return;
    }
    if (event.key === 'Tab') {
      close.current();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const entries = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('.menu-item') ?? []);
    const at = entries.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    entries[(at + step + entries.length) % entries.length]?.focus();
  };

  return (
    <span
      ref={menu}
      className={placement == null ? 'menu' : `menu ${placement}`}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={item.danger === true ? 'menu-item danger' : 'menu-item'}
          onClick={() => {
            close.current();
            item.onSelect();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </span>
  );
}
