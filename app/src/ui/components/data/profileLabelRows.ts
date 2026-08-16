/**
 * UZ Aero — ROZSUWANIE PODPISÓW pod osią czasu profilu (issue #47 pkt 2).
 *
 * Profil dostał podpisy przy każdym starcie i lądowaniu, a te potrafią wypaść blisko
 * siebie: dzień skokowy to lądowanie i kolejny start w odstępie kilkunastu minut, czyli
 * kilkunastu pikseli. Dwie godziny wypisane jedna na drugiej są nie do odczytania
 * i wyglądają jak usterka rysowania.
 *
 * Reguła jest najprostsza z możliwych: podpis, który nie mieści się obok poprzedniego
 * w tym samym rzędzie, schodzi rząd niżej — i dopiero gdy tam też nie ma miejsca,
 * jeszcze niżej. Nie skracamy godzin i nie chowamy podpisów: pilot ma przeczytać
 * WSZYSTKIE, a nie zgadywać, który znacznik zniknął.
 *
 * Ta sama pułapka wyszła najpierw w mockupie (`design/14-slad.html`), gdzie pełne
 * podpisy „T/O 1 · 08:20" zachodziły na siebie po trzech znacznikach — stąd godziny
 * bez nazw i stąd ten plik.
 */

/**
 * @param centers pozycje X środków podpisów, w kolejności czasu.
 * @param widths szerokości podpisów (px) — tej samej długości co `centers`.
 * @param gapPx minimalny prześwit między sąsiadami w jednym rzędzie.
 * @returns numer rzędu dla każdego podpisu (0 = przy osi).
 */
export function assignLabelRows(
  centers: readonly number[],
  widths: readonly number[],
  gapPx = 4,
): number[] {
  const rows: number[] = [];
  /** Prawa krawędź ostatniego podpisu w każdym rzędzie. */
  const occupiedUntil: number[] = [];

  for (let i = 0; i < centers.length; i++) {
    const half = (widths[i] ?? 0) / 2;
    const left = centers[i]! - half;
    const right = centers[i]! + half;

    let row = 0;
    while (occupiedUntil[row] != null && left < occupiedUntil[row]! + gapPx) row += 1;

    occupiedUntil[row] = right;
    rows.push(row);
  }

  return rows;
}
