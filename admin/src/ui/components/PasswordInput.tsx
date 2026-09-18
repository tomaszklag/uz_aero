/**
 * Ninerdeck - panel: pole hasła z przełącznikiem „pokaż" (`.input-pass` + `.eye-btn`
 * z `design/panel/00-logowanie` i `konto`; 2.1.0, `docs/logowanie-haslem.md` D4).
 *
 * Trzy rzeczy, które ten komponent gwarantuje na WSZYSTKICH ekranach naraz - i dlatego
 * jest jeden, a nie cztery kopie `<input type="password">` w czterech kartach:
 *  • **wklejanie jest dozwolone** (NIST SP 800-63B): pole nie blokuje `onPaste`, bo
 *    menedżer haseł jest sojusznikiem, a nie zagrożeniem. Blokada wklejania wymusza
 *    hasła krótkie i wpisywane z pamięci;
 *  • **„pokaż" pokazuje**, zamiast tłumaczyć - przełącznik zmienia `type` pola, a nie
 *    podsuwa podpowiedź. To jedyna obrona człowieka wpisującego długie hasło na
 *    tablecie w kabinie;
 *  • **`autocomplete` jest jawne i wymagane przez typ**: przeglądarka ma wiedzieć, czy
 *    to hasło DO WPISANIA (`current-password`), czy NOWE (`new-password`) - inaczej
 *    menedżer haseł podpowiada w formularzu zmiany hasło stare i zapisuje je z powrotem.
 *
 * Czego tu NIE MA: wskaźnika siły hasła i wymogów co do rodzaju znaków (D4 - długość
 * jest jedyną miarą). Powód odrzucenia mówi `Field.hint` przy polu, a liczy go JEDNA
 * implementacja polityki, wspólna z serwerem.
 */

import { useState, type InputHTMLAttributes } from 'react';

import { EyeIcon } from './icons';

interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type' | 'autoComplete'> {
  /**
   * `current-password` przy logowaniu i przy polu „obecne hasło", `new-password`
   * przy ustawianiu nowego. Bez wartości domyślnej celowo: milcząca domyślna byłaby
   * błędna w połowie miejsc, a tej pomyłki nie widać z ekranu.
   */
  autoComplete: 'current-password' | 'new-password';
  invalid?: boolean;
}

export function PasswordInput({ autoComplete, invalid = false, ...rest }: PasswordInputProps) {
  const [shown, setShown] = useState(false);

  return (
    <div className="input-pass">
      <input
        {...rest}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        className={invalid ? 'input invalid' : 'input'}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        className="eye-btn"
        aria-label={shown ? 'Ukryj hasło' : 'Pokaż hasło'}
        aria-pressed={shown}
        // `tabIndex={-1}`: klawiatura ma prowadzić z pola hasła wprost na „Zaloguj się".
        // Przełącznik jest pomocą dla palca, nie krokiem formularza.
        tabIndex={-1}
        onClick={() => setShown((value) => !value)}
      >
        <EyeIcon size={16} />
      </button>
    </div>
  );
}
