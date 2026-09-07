/**
 * UZ Aero - panel: REGUŁA PUŁAPKI FOKUSU w szufladzie (moduł CZYSTY).
 *
 * ══ DLACZEGO SZUFLADA MUSI ŁAPAĆ FOKUS ══
 * `.drawer` jest warstwą modalną nad listą (`aria-modal="true"`), a lista pod spodem
 * zostaje w drzewie DOM - bo o to w szufladzie chodzi: kontekst listy ma nie zniknąć.
 * Skutek uboczny jest jednak taki, że `Tab` z ostatniego pola formularza schodzi
 * do TABELI POD SPODEM: użytkownik klawiatury wychodzi z okna, którego nie zamknął,
 * i wpisuje w wiersze, których nie widzi pod przesłoną. Deklaracja `aria-modal` mówi
 * wtedy nieprawdę.
 *
 * Sama REGUŁA jest czysta i mieszka tutaj (test w Node), a czytanie listy elementów
 * skupialnych i wołanie `focus()` zostaje w komponencie - to jedyna część, która
 * wymaga DOM-u. Ten sam podział, co przy każdej decyzji o treści w panelu.
 */

/**
 * Który element ma dostać fokus po naciśnięciu `Tab` wewnątrz pułapki.
 *
 * `null` = **nie ingerujemy** - przeglądarka przeniesie fokus sama i zrobi to lepiej
 * (zna kolejność `tabindex`, elementy ukryte, shadow DOM). Ingerujemy WYŁĄCZNIE na
 * krawędziach, bo tylko tam domyślne zachowanie wyprowadza poza warstwę modalną.
 *
 * @param count   ile elementów skupialnych jest w pułapce
 * @param current indeks elementu skupionego; `-1` = fokus na samym panelu (`tabIndex={-1}`,
 *                stan zaraz po otwarciu szuflady) albo poza pułapką
 * @param shift   czy trzymany jest `Shift` (ruch wstecz)
 */
export function trapTarget(count: number, current: number, shift: boolean): number | null {
  // Szuflada bez ani jednego elementu skupialnego nie istnieje (jest w niej przycisk
  // „Zamknij"), ale reguła nie ma prawa dzielić przez pustkę ani zwracać indeksu,
  // pod którym nic nie stoi.
  if (count <= 0) return null;

  // Fokus na panelu: `Tab` wchodzi w pierwszy element, `Shift+Tab` zawija na ostatni.
  // Bez tego `Shift+Tab` zaraz po otwarciu szuflady wychodzi na przesłonę i dalej
  // w stronę strony pod spodem.
  if (current < 0) return shift ? count - 1 : 0;

  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}
