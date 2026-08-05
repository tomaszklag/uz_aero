/**
 * UZ Aero — panel: PASEK UDZIAŁU w komórce tabeli (`.share` z `SZABLON.html`).
 *
 * Kolumna „Udział w nalocie" z mockupu `A10` — cieńszy niż `.meter`, bo mieszka
 * w wierszu tabeli. Procent liczy SERWER; tu jest wyłącznie geometria i etykieta.
 */

interface ShareBarProps {
  width: string;
  /** Niebieskie wypełnienie wyróżnia stronę przychodową (SKOKI); reszta przygaszona. */
  blue: boolean;
  label: string;
}

export function ShareBar({ width, blue, label }: ShareBarProps) {
  return (
    <span className="share">
      <span className="share-track">
        <span className={blue ? 'share-fill blue' : 'share-fill'} style={{ width }} />
      </span>
      <span className="share-val">{label}</span>
    </span>
  );
}
