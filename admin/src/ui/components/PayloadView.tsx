/**
 * UZ Aero — panel: wypis surowego JSON-a (`.payload` z `SZABLON.html`).
 *
 * Komponent NICZEGO nie interpretuje i nie ma jak tego zrobić: dostaje gotowe linie
 * z modułu czystego (`screens/events/eventPayload.ts`), łącznie z wcięciem, tonem
 * i przecinkiem. Tutaj zostaje wyłącznie układ — bo „która wartość jest niebieska"
 * jest decyzją o treści, a te w panelu mieszkają w `.ts` z testem.
 *
 * ══ TO JEST KOMPONENT O PODWYŻSZONYM RYZYKU I DLATEGO MA WŁASNY TEST ══
 * Wypisuje treść przysłaną przez TELEFON — dowolne napisy w polach `notes`, `client`,
 * nazwy kluczy spoza katalogu. Wartości idą więc jako DZIECI REACTA, nigdy przez
 * `dangerouslySetInnerHTML`: to jest ta granica, na której panel renderujący rejestr
 * przestaje być podatny na wstrzyknięcie (`ANALIZA` §6 ryzyko 11).
 */

export interface PayloadViewLine {
  id: string;
  /** Gotowe wcięcie w spacjach — komponent go nie liczy. */
  indent: string;
  /** Klucz w cudzysłowach; `null` = element tablicy albo korzeń. */
  key: string | null;
  value: string;
  /** Nazwa klasy modyfikatora tonu; `null` = wartość neutralna albo nawias. */
  tone: 'green' | 'blue' | 'red' | null;
  comma: boolean;
}

interface PayloadViewProps {
  lines: readonly PayloadViewLine[];
  /** Podpis nad wypisem — mówi, CZYM jest to, na co człowiek patrzy. */
  note: string;
}

export function PayloadView({ lines, note }: PayloadViewProps) {
  return (
    <>
      <span className="label">{note}</span>
      <pre className="payload">
        {lines.map((line) => (
          <span className="payload-line" key={line.id}>
            {line.indent}
            {line.key == null ? null : (
              <>
                <b className="payload-key">{line.key}</b>
                {': '}
              </>
            )}
            <span className={line.tone == null ? 'payload-val' : `payload-val ${line.tone}`}>
              {line.value}
            </span>
            {line.comma ? ',' : ''}
          </span>
        ))}
      </pre>
    </>
  );
}
