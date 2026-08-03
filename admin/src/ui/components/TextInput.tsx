/**
 * UZ Aero — panel: pole tekstowe (`.input` z `SZABLON.html`).
 *
 * `mono` dla kodów, UUID-ów i wartości liczbowych — reguła tabel obowiązuje też
 * w formularzach. `invalid` dla pola odrzuconego przez serwer (A00a: hasło).
 */

import type { InputHTMLAttributes } from 'react';

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  mono?: boolean;
  invalid?: boolean;
}

export function TextInput({ mono = false, invalid = false, ...rest }: TextInputProps) {
  const classes = ['input', mono ? 'mono' : null, invalid ? 'invalid' : null]
    .filter((c) => c != null)
    .join(' ');

  return <input {...rest} className={classes} aria-invalid={invalid || undefined} />;
}
