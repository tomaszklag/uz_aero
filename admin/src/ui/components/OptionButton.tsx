/**
 * Ninerdeck - panel: pozycja listy kart jako WYBÓR (`.opt` jako `<button>`).
 *
 * Trzeci wariant tej samej karty: `OptionLink` prowadzi w głąb, a ten zaznacza opcję.
 * Mockup używa tu `<label class="opt">` z `onclick` - w panelu jest to `<button>`,
 * bo etykieta bez powiązanego `<input>` nie jest osiągalna z klawiatury ani ogłaszana
 * przez czytnik ekranu, a wybór akcji korekty (`retime` vs `void`) to decyzja, która
 * zmienia liczby w rejestrze klubu.
 *
 * `role="radio"` z `aria-checked`, bo to jest wybór JEDNEJ opcji z zamkniętego zbioru -
 * `aria-pressed` opisywałby przełącznik, czyli coś, co da się mieć włączone naraz.
 *
 * Klasy zostają dokładnie te z `SZABLON.html` (`.opt`, `.opt-body`, `.opt-name`,
 * `.opt-desc`, `.opt-check`): grep po `opt-name` ma dalej znajdować jednocześnie mockup
 * i komponent.
 */

import { CheckIcon } from './icons';

interface OptionButtonProps {
  name: string;
  /** Druga linia: mono, drobna - payload i skutek, nie zdania. */
  desc: string;
  selected: boolean;
  disabled?: boolean;
  /**
   * Wybór WIELU pozycji naraz (`role="checkbox"`) - obsada kroku ścieżki akceptacji
   * (makieta `kalendarz-sciezka` K4a): kilka osób w kroku to pula, nie jedna z listy.
   * Wygląd ten sam, inna semantyka dla czytnika ekranu.
   */
  multiple?: boolean;
  /**
   * Nazwa o stopień słabsza (`.opt.dim`) - członek WYŁĄCZONY na liście grupy (4.0.0,
   * makieta `piloci-grupy`): zostaje zaznaczony, bo konfiguracji klubu nie czyścimy po
   * cichu, ale administrator ma widzieć, że na tę osobę nie liczy. Karta zostaje
   * klikalna - zdjęcie takiej osoby jest zwykłą poprawką.
   */
  dim?: boolean;
  onSelect: () => void;
}

export function OptionButton({
  name,
  desc,
  selected,
  disabled = false,
  multiple = false,
  dim = false,
  onSelect,
}: OptionButtonProps) {
  return (
    <button
      type="button"
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={selected}
      disabled={disabled}
      className={['opt', selected ? 'selected' : null, dim ? 'dim' : null].filter((c) => c != null).join(' ')}
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
