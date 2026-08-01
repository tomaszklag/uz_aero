/**
 * UZ Aero — panel: WYKRES NAPŁYWU (`.spark` z `SZABLON.html`).
 *
 * Dwanaście słupków i trzy podpisy osi — bez biblioteki wykresów i bez SVG, bo to nie
 * jest wykres do odczytywania wartości, tylko PULS: odpowiada na pytanie „czy napływ
 * się urwał", a dokładne liczby stoją w karcie obok.
 *
 * Wysokości i klasy przychodzą policzone z `screens/pulpit/pulpitSpark.ts` — komponent
 * nie liczy niczego (`admin/test/architecture.test.ts` zakazuje `Math.round` w `.tsx`).
 * Słupek pusty ma WŁASNĄ klasę (`.zero`) i widoczną wysokość, bo cisza w rejestrze musi
 * być widoczna, a nie niewidoczna.
 */

interface SparkBarView {
  key: string;
  height: string;
  className: string;
  count: number;
  fromMs: number;
}

interface SparklineProps {
  bars: SparkBarView[];
  axis: [string, string, string];
  /** Opis dla czytnika ekranu — słupki same z siebie nie niosą żadnej treści. */
  label: string;
}

export function Sparkline({ bars, axis, label }: SparklineProps) {
  return (
    <>
      <div className="spark" role="img" aria-label={label}>
        {bars.map((bar) => (
          <i key={bar.key} className={bar.className} style={{ height: bar.height }} />
        ))}
      </div>
      <div className="spark-axis">
        {/* Klucz z pozycji, nie z treści: dwa podpisy osi bywają identyczne (okno
            krótsze od minuty w testach, północ na obu brzegach), a `key` musi być
            unikalny nawet wtedy, gdy napis się powtarza. */}
        {axis.map((tick, index) => (
          <span key={`tick-${index}`}>{tick}</span>
        ))}
      </div>
    </>
  );
}
