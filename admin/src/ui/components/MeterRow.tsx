/**
 * UZ Aero — panel: MIERNIK UDZIAŁU (`.meter` z `SZABLON.html`).
 *
 * „Wykorzystanie floty" z mockupu `A10`: tor z wypełnieniem zakończonym twardą
 * krawędzią i wartością `21 · 70 %` po prawej. Bursztyn sygnalizuje jednostkę
 * stojącą częściej, niż lata — próg rozstrzyga moduł czysty, nie komponent.
 */

interface MeterRowProps {
  name: string;
  width: string;
  amber: boolean;
  label: string;
}

export function MeterRow({ name, width, amber, label }: MeterRowProps) {
  return (
    <div className="meter">
      <span className="duo-name">{name}</span>
      <span className="meter-track">
        <span className={amber ? 'meter-fill amber' : 'meter-fill'} style={{ width }} />
      </span>
      <span className="meter-val">{label}</span>
    </div>
  );
}
