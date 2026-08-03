/**
 * UZ Aero — panel: pozycja listy kart jako WYBÓR (`.opt` jako `<button>`).
 *
 * Trzeci wariant tej samej karty: `OptionLink` prowadzi w głąb, a ten zaznacza opcję.
 * Mockup używa tu `<label class="opt">` z `onclick` — w panelu jest to `<button>`,
 * bo etykieta bez powiązanego `<input>` nie jest osiągalna z klawiatury ani ogłaszana
 * przez czytnik ekranu, a wybór akcji korekty (`retime` vs `void`) to decyzja, która
 * zmienia liczby w rejestrze klubu.
 *
 * `role="radio"` z `aria-checked`, bo to jest wybór JEDNEJ opcji z zamkniętego zbioru —
 * `aria-pressed` opisywałby przełącznik, czyli coś, co da się mieć włączone naraz.
 *
 * Klasy zostają dokładnie te z `SZABLON.html` (`.opt`, `.opt-body`, `.opt-name`,
 * `.opt-desc`, `.opt-check`): grep po `opt-name` ma dalej znajdować jednocześnie mockup
 * i komponent.
 */

import { CheckIcon } from './icons';

interface OptionButtonProps {
  name: string;
  /** Druga linia: mono, drobna — payload i skutek, nie zdania. */
  desc: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function OptionButton({ name, desc, selected, disabled = false, onSelect }: OptionButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      className={selected ? 'opt selected' : 'opt'}
      onClick={onSelect}
    >
      <span className="opt-body">
        <span className="opt-name">{name}</span>
        <span className="opt-desc">{desc}</span>
      </span>
      <span className="opt-check">
        <CheckIcon size={16} />
      </span>
    </button>
  );
}
