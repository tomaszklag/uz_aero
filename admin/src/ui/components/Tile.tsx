/**
 * UZ Aero — panel: kafel podsumowania (`.tile` z `SZABLON.html`).
 *
 * Trzy warstwy z mockupu: klucz (mono, wersaliki), wartość (mono, 28 px) i przypis.
 * `unit` renderuje się jako `<small>` wewnątrz wartości — „3 dni 3 h" ma być jedną
 * liczbą z jednostką, a nie dwiema liczbami obok siebie.
 *
 * `note` jest wymagane: kafel bez przypisu podaje liczbę bez odpowiedzi na pytanie
 * „z czego", a to jest dokładnie ten rodzaj wskaźnika, któremu nikt nie ufa.
 */

import type { ReactNode } from 'react';

export type TileTone = 'green' | 'amber' | 'red' | 'blue';

interface TileProps {
  label: string;
  value: ReactNode;
  /** Jednostka albo dopisek przy wartości — mniejszy, w kolorze drugorzędnym. */
  unit?: string;
  tone?: TileTone;
  note: ReactNode;
}

export function Tile({ label, value, unit, tone, note }: TileProps) {
  return (
    <div className="tile">
      <span className="tile-key">{label}</span>
      <span className={tone == null ? 'tile-val' : `tile-val ${tone}`}>
        {value}
        {unit == null ? null : <small> {unit}</small>}
      </span>
      <span className="tile-note">{note}</span>
    </div>
  );
}
