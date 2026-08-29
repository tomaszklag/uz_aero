/**
 * UZ Aero - panel: plakietka licznika przy pozycji nawigacji (moduł CZYSTY).
 *
 * Sidebar widać na każdym ekranie, więc plakietka „7" przy „Flagach" jest jedynym
 * miejscem, w którym administrator dowiaduje się o zaległej sprawie, nie będąc na
 * jej ekranie. Ma z tego wynikać jedno: **zero jest neutralne, nie zielone i nie
 * alarmujące.**
 *
 * Amber przy zerze przyzwyczajałby do ignorowania koloru; zieleń robiłaby z braku
 * spraw osiągnięcie, choć znaczy tylko tyle, że dziś nic nie doszło. Tak rysuje to
 * mockup: `A03` ma `nav-count amber` z siódemką, `A03b` - goły `nav-count` z zerem.
 */

/** Kształt przyjmowany przez `NavItem` (`.nav-count` + opcjonalny modyfikator tonu). */
export interface NavCount {
  value: number;
  tone?: 'amber' | 'red';
}

/**
 * Liczba otwartych spraw → plakietka. `undefined` (licznik jeszcze nie przyszedł
 * albo żądanie odbiło) daje BRAK plakietki, a nie zero: „0 otwartych flag" jest
 * konkretną wiadomością i nie wolno jej wypisać, zanim serwer ją potwierdzi.
 */
export function openFlagsCount(total: number | undefined): NavCount | undefined {
  if (total == null) return undefined;
  return total > 0 ? { value: total, tone: 'amber' } : { value: 0 };
}
