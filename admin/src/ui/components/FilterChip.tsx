/**
 * UZ Aero - panel 2.0: zawężenie listy (`.chip`).
 *
 * `<button>` z `aria-pressed`, a nie `<span onClick>`: filtr, którego nie da się
 * ustawić z klawiatury, psuje scenariusz „przygotuj link do tego wycinka".
 *
 * Bez licznika przy nazwie - uzasadnienie stoi w `styles/components/filters.css`.
 */

interface FilterChipProps {
  label: string;
  on: boolean;
  onToggle: () => void;
}

export function FilterChip({ label, on, onToggle }: FilterChipProps) {
  return (
    <button type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={onToggle}>
      {label}
    </button>
  );
}
