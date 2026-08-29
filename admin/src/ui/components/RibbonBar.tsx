/**
 * UZ Aero - panel: WSTĘGA ROZKŁADU (`.ribbon` z `SZABLON.html`).
 *
 * „Rozbicie na typy skoków" z mockupu `A10`: segmenty sumujące się do całości,
 * każdy z etykietą i liczbą. Segment zerowy NIE jest renderowany - moduł czysty
 * go pomija, bo pasek o szerokości zero i tak nie uniósłby podpisu.
 */

interface RibbonBarProps {
  segments: { key: string; width: string; tone: 'blue' | 'green' | 'amber'; label: string }[];
  /** Opis dla czytnika ekranu - kolory segmentów nie niosą treści same z siebie. */
  label: string;
}

export function RibbonBar({ segments, label }: RibbonBarProps) {
  return (
    <span className="ribbon" role="img" aria-label={label}>
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={`ribbon-seg ${segment.tone}`}
          style={{ width: segment.width }}
        >
          {segment.label}
        </span>
      ))}
    </span>
  );
}
