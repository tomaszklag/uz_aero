/**
 * UZ Aero — panel: pole wieloliniowe (`.input` jako `<textarea>`).
 *
 * Ten sam wzorzec, co `TextInput` — `--surface-raised`, promień 12, fokus zielony —
 * bo mockup `A03a` używa dokładnie klasy `.input` na `<textarea>`. Różnica jest
 * jedna i mieszka w CSS: pionowa zmiana rozmiaru jest dozwolona, bo komentarz do
 * flagi bywa akapitem, a przycinanie go do czterech wierszy zniechęcałoby do pisania
 * tego, co za pół roku będzie jedynym śladem decyzji.
 */

import type { TextareaHTMLAttributes } from 'react';

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  invalid?: boolean;
}

export function TextArea({ invalid = false, rows = 4, ...rest }: TextAreaProps) {
  return (
    <textarea
      {...rest}
      rows={rows}
      className={invalid ? 'input area invalid' : 'input area'}
      aria-invalid={invalid || undefined}
    />
  );
}
