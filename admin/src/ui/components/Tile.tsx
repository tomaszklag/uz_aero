/**
 * UZ Aero — panel: kafel podsumowania (`.tile` z `SZABLON.html`).
 *
 * Trzy warstwy z mockupu: klucz (mono, wersaliki), wartość (mono, 28 px) i przypis.
 * `unit` renderuje się jako `<small>` wewnątrz wartości — „3 dni 3 h" ma być jedną
 * liczbą z jednostką, a nie dwiema liczbami obok siebie.
 *
 * `note` jest wymagane: kafel bez przypisu podaje liczbę bez odpowiedzi na pytanie
 * „z czego", a to jest dokładnie ten rodzaj wskaźnika, któremu nikt nie ufa.
 *
 * ══ `to` — KAFEL BYWA PRZEJŚCIEM ══
 * Na pulpicie (`A01`) każdy kafel prowadzi do listy zawężonej dokładnie tak, jak
 * policzona jest jego liczba; na ekranach podsumowań (`A05`, `A06`, `A07`) jest zwykłym
 * pudełkiem. Szablon przewiduje oba przypadki JEDNĄ regułą i mówi to wprost w komentarzu
 * przy `.tile`: „`text-decoration`/`color` na nie-linku nic nie robi".
 *
 * Przejście jest `<Link>`, a nie `<div onClick>`: da się je otworzyć w nowej karcie
 * i skopiować, jest osiągalne z klawiatury i widać cel w pasku stanu przed kliknięciem.
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export type TileTone = 'green' | 'amber' | 'red' | 'blue';

interface TileProps {
  label: string;
  value: ReactNode;
  /** Jednostka albo dopisek przy wartości — mniejszy, w kolorze drugorzędnym. */
  unit?: string;
  tone?: TileTone;
  note: ReactNode;
  /** Cel przejścia; bez niego kafel zostaje zwykłym pudełkiem. */
  to?: string;
}

export function Tile({ label, value, unit, tone, note, to }: TileProps) {
  const body = (
    <>
      <span className="tile-key">{label}</span>
      <span className={tone == null ? 'tile-val' : `tile-val ${tone}`}>
        {value}
        {unit == null ? null : <small> {unit}</small>}
      </span>
      <span className="tile-note">{note}</span>
    </>
  );

  if (to == null) return <div className="tile">{body}</div>;
  return (
    <Link className="tile" to={to}>
      {body}
    </Link>
  );
}
