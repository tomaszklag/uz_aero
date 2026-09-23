/**
 * Ninerdeck - panel: lista rozwijana (`select.input` z `SZABLON.html`).
 *
 * ══ DLACZEGO `select`, SKORO REGUŁĄ JEST LISTA KART ══
 * Reguła „zawsze lista kart, nigdy natywny `select`" powstała DLA TELEFONU: kciuk
 * w rękawicy, słońce, wybór spośród kilku maszyn. W panelu obowiązuje wyjątek
 * (decyzja właściciela 2026-09-20) i ma dziś dwa zastosowania - listę rosnącą z klubem
 * (maszyna, pilot w kalendarzu) oraz ZESTAW UPRAWNIEŃ, gdzie zawartość wyboru stoi
 * ROZPISANA POD NIM: widoczność wszystkich opcji naraz - cały argument tamtej reguły -
 * niczego tam nie dokłada, a dwie listy kart jedna nad drugą zlałyby się w jedną.
 *
 * Zbiór ZAMKNIĘTY i krótki, którego zawartości nie widać (powód wyłączenia z użytku,
 * rodzaj operacji), zostaje listą kart `OptionButton` także w panelu.
 */

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  id: string;
  value: string;
  options: readonly SelectOption[];
  disabled?: boolean;
  /** Etykieta dla czytnika ekranu, gdy pole nie ma widocznej etykiety obok. */
  ariaLabel?: string;
  onChange: (value: string) => void;
}

export function Select({ id, value, options, disabled, ariaLabel, onChange }: SelectProps) {
  return (
    <select
      id={id}
      className="input"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
