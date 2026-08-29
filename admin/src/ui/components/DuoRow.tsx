/**
 * UZ Aero - panel: PARA PASKÓW jednej pozycji (`.duo` z `SZABLON.html`).
 *
 * „Blok vs czas lotu" z mockupu `A10`: zielony pasek bloku i niebieski lotu na TEJ
 * SAMEJ skali - różnica długości to czas z pracującym silnikiem poza lotem.
 * Szerokości przychodzą policzone z `screens/stats/statsCompare.ts`.
 */

interface DuoRowProps {
  name: string;
  blockWidth: string;
  blockLabel: string;
  flightWidth: string;
  flightLabel: string;
}

export function DuoRow({ name, blockWidth, blockLabel, flightWidth, flightLabel }: DuoRowProps) {
  return (
    <div className="duo">
      <span className="duo-name">{name}</span>
      <span className="duo-bars">
        <span className="duo-line">
          <span className="duo-bar green" style={{ width: blockWidth }} />
          <span className="duo-val green">{blockLabel}</span>
        </span>
        <span className="duo-line">
          <span className="duo-bar blue" style={{ width: flightWidth }} />
          <span className="duo-val blue">{flightLabel}</span>
        </span>
      </span>
    </div>
  );
}
