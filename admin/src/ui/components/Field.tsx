/**
 * UZ Aero - panel: pole formularza (`.field` + `.label` + `.hint` z `SZABLON.html`).
 *
 * Etykieta jest `<label>` z `htmlFor`, a nie `<span>` jak w mockupie: mockup jest
 * specyfikacją WYGLĄDU, a wygląd jest tu identyczny (`.label` nie zmienia stylu wraz
 * ze znacznikiem). Klikalna etykieta i powiązanie z polem to dostępność, której
 * statyczny plik HTML nie musiał mieć, a formularz - musi.
 */

import type { ReactNode } from 'react';

interface FieldProps {
  /** `id` pola, do którego etykieta należy - bez niego etykieta nic nie robi. */
  htmlFor: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}

export function Field({ htmlFor, label, hint, children }: FieldProps) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint == null ? null : <span className="hint">{hint}</span>}
    </div>
  );
}
