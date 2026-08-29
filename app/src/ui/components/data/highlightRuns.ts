/**
 * UZ Aero - FRAGMENT TRASY W OKNIE CZASU (issue #47, podświetlenie zamiast przeskoku).
 *
 * Profil przybliżony do wycinka czasu mówi mapie, KTÓRY to wycinek; mapa przygasza całą
 * trasę i rozjaśnia tę część. Ta funkcja odpowiada na jedyne pytanie, jakie przy tym
 * powstaje: które wierzchołki linii do niej należą.
 *
 * ══ DLACZEGO JEDEN ZAKRES, A NIE LISTA ══
 * Pierwsza wersja zbierała TABLICĘ przebiegów, bo „przecież nad polem samolot jest kilka
 * razy". Test pokazał, że to nieporozumienie: linia jest uporządkowana czasem, a okno
 * jest przedziałem czasu, więc pasujące wierzchołki zawsze leżą OBOK SIEBIE. Kilka
 * przelotów nad tym samym placem to jeden ciągły kawałek linii, który po prostu zawija
 * się w pętle - i tak też się podświetla. Lista byłaby konstrukcją na wypadek sytuacji,
 * która nie ma jak zajść.
 *
 * Zakres dostaje po JEDNYM wierzchołku zapasu z obu stron. Bez tego podświetlenie
 * urywałoby się piksel przed granicą okna i nie stykało z resztą linii.
 */

/** Zakres indeksów linii, oba końce włącznie; `null` = w oknie nie ma nic. */
export type HighlightRange = [start: number, end: number];

export function highlightRange(
  times: readonly number[],
  window: { from: number; to: number },
): HighlightRange | null {
  let first: number | null = null;
  let last: number | null = null;

  for (let i = 0; i < times.length; i++) {
    if (times[i]! < window.from || times[i]! > window.to) continue;
    if (first == null) first = i;
    last = i;
  }

  if (first == null || last == null) return null;

  const start = Math.max(0, first - 1);
  const end = Math.min(times.length - 1, last + 1);

  // Jeden wierzchołek to nie odcinek - nie ma czego rysować.
  return end > start ? [start, end] : null;
}
