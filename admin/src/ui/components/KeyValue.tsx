/**
 * UZ Aero — panel: wiersz klucz–wartość (`.kv` z `SZABLON.html`).
 *
 * Wartość zawsze mono — obowiązuje ta sama reguła, co w tabelach: liczby czyta się
 * kolumną, a proporcjonalna czcionka przesuwa cyfry względem siebie. `unit`
 * renderuje się jako `<small>`, żeby jednostka nie konkurowała z wartością.
 *
 * Wiersze są rodzeństwem wewnątrz karty (bez własnego kontenera), bo tak robi to
 * mockup — ostatni wiersz gubi kreskę dzięki `.kv:last-child`, a dodatkowy `<div>`
 * ten selektor by zepsuł.
 */

import type { ReactNode } from 'react';

export type KeyValueTone = 'green' | 'amber' | 'red';

interface KeyValueProps {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  tone?: KeyValueTone;
}

export function KeyValue({ label, value, unit, tone }: KeyValueProps) {
  return (
    <div className="kv">
      <span className="kv-k">{label}</span>
      <span className={tone == null ? 'kv-v' : `kv-v ${tone}`}>
        {value}
        {unit == null ? null : <small> {unit}</small>}
      </span>
    </div>
  );
}
