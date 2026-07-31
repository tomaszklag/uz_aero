/**
 * UZ Aero — panel: szuflada szczegółu (`.drawer` z `SZABLON.html`).
 *
 * Szuflada istnieje po to, żeby wejście w sprawę NIE KOSZTOWAŁO kontekstu listy —
 * lista zostaje pod spodem, a adres jest deep-linkowalny (`#/flagi/1046`). Stąd dwa
 * zachowania, których mockup nie mógł mieć, bo jest statycznym plikiem:
 *
 *  • **Esc zamyka.** Otwarta warstwa nad treścią musi mieć wyjście z klawiatury.
 *  • **Fokus wraca tam, skąd przyszedł.** Bez tego użytkownik klawiatury po zamknięciu
 *    szuflady ląduje na początku dokumentu i traci miejsce w tabeli — czyli dokładnie
 *    ten kontekst, dla którego szuflada powstała.
 *
 * Przesłona jest `<button>`, a nie `<div onClick>`: kliknięcie w tło to akcja,
 * a akcja ma być osiągalna tak samo dla myszy i dla czytnika ekranu.
 */

import { useEffect, useRef, type ReactNode } from 'react';

import { CloseIcon } from './icons';

interface DrawerProps {
  title: string;
  sub: ReactNode;
  /** Stopka z akcjami (`.drawer-foot`) — kolejność jak w mockupie: anuluj, potem akcja. */
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function Drawer({ title, sub, footer, onClose, children }: DrawerProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Fokus wchodzi w szufladę, żeby czytnik ekranu ogłosił jej treść, a Tab
    // prowadził po jej wnętrzu, a nie po liście pod spodem.
    panel.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [onClose]);

  return (
    <>
      <button type="button" className="drawer-scrim" aria-label="Zamknij szufladę" onClick={onClose} />
      <div
        ref={panel}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{title}</div>
            <div className="drawer-sub">{sub}</div>
          </div>
          <button type="button" className="x-btn" aria-label="Zamknij" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="drawer-body">{children}</div>

        {footer == null ? null : <div className="drawer-foot">{footer}</div>}
      </div>
    </>
  );
}
