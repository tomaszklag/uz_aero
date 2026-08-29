/**
 * UZ Aero - panel: chip filtra (`.chip`, `.chip.on` z `SZABLON.html`).
 *
 * Chip jest `<button>`, a nie `<span>` jak w mockupie - mockup jest specyfikacją
 * WYGLĄDU, a wygląd zostaje ten sam. Filtr, którego nie da się kliknąć z klawiatury,
 * psułby ten sam scenariusz, dla którego panel istnieje: przygotowanie linku do
 * konkretnego wycinka skrzynki.
 *
 * `count` przychodzi Z SERWERA albo nie ma go wcale. Chip nie liczy nic sam -
 * plakietka „Otwarte · 7" wyliczona z wierszy na ekranie kłamałaby przy każdym
 * innym filtrze i przy każdym obcięciu listy.
 */

export type ChipTone = 'amber';

interface FilterChipProps {
  label: string;
  count?: number;
  active: boolean;
  /** Ton stanu WŁĄCZONEGO; bez niego chip aktywny jest zielony jak w szablonie. */
  tone?: ChipTone;
  title?: string;
  onClick: () => void;
}

export function FilterChip({ label, count, active, tone, title, onClick }: FilterChipProps) {
  const classes = ['chip', active ? 'on' : null, active && tone != null ? tone : null]
    .filter((c) => c != null)
    .join(' ');

  return (
    <button type="button" className={classes} title={title} aria-pressed={active} onClick={onClick}>
      {count == null ? label : `${label} · ${count}`}
    </button>
  );
}
