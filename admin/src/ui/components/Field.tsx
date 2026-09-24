/**
 * Ninerdeck - panel: pole formularza (`.field` + `.label` + `.hint` z `SZABLON.html`).
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
  /**
   * Drobna akcja dotycząca TEGO pola, w wierszu etykiety po prawej - „Nie pamiętam
   * hasła" przy polu hasła (wzorzec GitHub / Stripe / Linear; issue #180, przegląd
   * właściciela 2026-09-24). Etykieta zostaje `<label>`, akcja jest jej RODZEŃSTWEM
   * w `.label-row`, nie dzieckiem: link w środku `<label>` kliknięty odsyłałby fokus
   * do pola zamiast otworzyć drogę, o którą ktoś poprosił.
   */
  action?: ReactNode;
  children: ReactNode;
}

export function Field({ htmlFor, label, hint, action, children }: FieldProps) {
  const caption = (
    <label className="label" htmlFor={htmlFor}>
      {label}
    </label>
  );
  return (
    <div className="field">
      {action == null ? (
        caption
      ) : (
        <div className="label-row">
          {caption}
          {action}
        </div>
      )}
      {children}
      {hint == null ? null : <span className="hint">{hint}</span>}
    </div>
  );
}
