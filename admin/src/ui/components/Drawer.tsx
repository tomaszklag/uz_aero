/**
 * UZ Aero - panel: szuflada szczegółu (`.drawer` z `SZABLON.html`).
 *
 * Szuflada istnieje po to, żeby wejście w sprawę NIE KOSZTOWAŁO kontekstu listy -
 * lista zostaje pod spodem, a adres jest deep-linkowalny (`#/flagi/1046`). Stąd dwa
 * zachowania, których mockup nie mógł mieć, bo jest statycznym plikiem:
 *
 *  • **Esc zamyka.** Otwarta warstwa nad treścią musi mieć wyjście z klawiatury.
 *  • **Fokus wraca tam, skąd przyszedł.** Bez tego użytkownik klawiatury po zamknięciu
 *    szuflady ląduje na początku dokumentu i traci miejsce w tabeli - czyli dokładnie
 *    ten kontekst, dla którego szuflada powstała.
 *  • **Fokus NIE WYCHODZI szufladą `Tab`** (dołożone 2026-08-01). Lista zostaje pod
 *    spodem w drzewie DOM, więc bez pułapki `Tab` z ostatniego pola formularza schodzi
 *    do tabeli pod przesłoną: człowiek pisze w wierszach, których nie widzi, a
 *    `aria-modal="true"` mówi nieprawdę. Regułę zawijania trzyma `focusTrap.ts`
 *    (czysta, z testem); tutaj zostaje odczyt DOM-u i `focus()`.
 *
 * Przesłona jest `<button>`, a nie `<div onClick>`: kliknięcie w tło to akcja,
 * a akcja ma być osiągalna tak samo dla myszy i dla czytnika ekranu.
 */

// `KeyboardEvent` Reacta pod własną nazwą - globalny `KeyboardEvent` DOM-u jest w tym
// pliku potrzebny obok, przy nasłuchu `Esc` na dokumencie.
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

import { trapTarget } from './focusTrap';
import { CloseIcon } from './icons';

/**
 * Elementy, które mogą dostać fokus - w kolejności dokumentu.
 *
 * `:not([disabled])` i `tabindex="-1"` odsiewamy w selektorze, bo przycisk zablokowany
 * z powodem (wzorzec całego panelu) zostaje w DOM-ie i zawijanie na nim zatrzymałoby
 * `Tab` w martwym punkcie. `offsetParent` odsiewa to, co jest schowane - element
 * niewidoczny, na który skacze fokus, wygląda jak zawieszona klawiatura.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement | null): HTMLElement[] {
  if (root == null) return [];
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null,
  );
}

interface DrawerProps {
  title: string;
  sub: ReactNode;
  /** Stopka z akcjami (`.drawer-foot`) - kolejność jak w mockupie: anuluj, potem akcja. */
  footer?: ReactNode;
  /**
   * Szuflada 660 px zamiast 520 (`.drawer.wide`) - dla szuflady, która jest
   * FORMULARZEM, a nie podglądem. Korekta administratora (`A02b`) niesie kartę
   * „przed → po", pole powodu i pełny opis skutków; w wąskiej szufladzie każdy wiersz
   * klucz–wartość łamie się na dwie linie i karta przestaje się czytać kolumnami.
   */
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Drawer({ title, sub, footer, wide = false, onClose, children }: DrawerProps) {
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

  // Nasłuch na PANELU, nie na dokumencie: pułapka ma działać wtedy i tylko wtedy, gdy
  // fokus jest w środku. Nasłuch globalny przejmowałby `Tab` także wtedy, gdy człowiek
  // wrócił myszą do listy - czyli więziłby go w szufladzie zamiast pilnować jej granicy.
  const onTab = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return;

    const items = focusablesIn(panel.current);
    const current = items.indexOf(document.activeElement as HTMLElement);
    const target = trapTarget(items.length, current, event.shiftKey);
    if (target == null) return;

    event.preventDefault();
    items[target]?.focus();
  };

  return (
    <>
      <button type="button" className="drawer-scrim" aria-label="Zamknij szufladę" onClick={onClose} />
      <div
        ref={panel}
        className={wide ? 'drawer wide' : 'drawer'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onTab}
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
