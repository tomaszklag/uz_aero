/**
 * UZ Aero - panel: PODGLĄD KARTY, `string[][]` → wiersze tabeli (moduł CZYSTY, Node).
 *
 * ══ KARTA NIE JEST PROJEKCJĄ ══
 * `exported_sheets.rows` to DOSŁOWNE komórki dokumentu - karta jest arkuszem w kształcie
 * Excela, a nie danymi do dalszego liczenia. Panel jej więc nie interpretuje: nie szuka
 * nagłówków, nie parsuje liczb, nie sprawdza, czy „Block time" jest tam, gdzie powinien.
 * Wyświetla to, co poszło do klubu, znak w znak - bo pytanie tego podglądu brzmi
 * „co dokładnie zobaczył skarbnik", a nie „czy dzień się zgadza".
 *
 * Jedyna decyzja, jaką ten moduł podejmuje, dotyczy WIERSZY PUSTYCH. `buildDaySheet`
 * wstawia je jako separatory sekcji (`[]`) i trzeba je zachować, bo bez nich karta
 * zlewa się w jeden blok - ale pusty `<tr>` bez komórek jest w HTML-u niepoprawny
 * i znika. Stąd jawny typ wiersza zamiast surowej tablicy.
 */

export interface SheetLine {
  key: string;
  /** `true` = separator sekcji z karty (`[]`), renderowany jako odstęp, nie jako tekst. */
  spacer: boolean;
  /**
   * Komórki wiersza. Pierwsza bywa etykietą („Samolot"), reszta wartościami - ale to
   * jest OBSERWACJA o dzisiejszym kształcie karty, nie kontrakt. Panel renderuje po
   * kolei i nie zakłada, ile kolumn ma który wiersz.
   */
  cells: string[];
}

/**
 * Ile komórek ma najszerszy wiersz - tyle kolumn musi mieć tabela, żeby żadna wartość
 * nie wypadła poza kadr. Liczone z karty, nie przybite na sztywno: sekcja „Zrzuty"
 * pojawia się wyłącznie dla operacji Skoki, więc szerokość zależy od dnia.
 */
export function sheetWidth(rows: readonly string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 1);
}

/**
 * `string[][]` → wiersze do wyrenderowania.
 *
 * Klucz zawiera INDEKS, a nie treść: karta ma powtarzające się komórki („Start"
 * w paliwie i „Start" w motogodzinach), więc klucz z treści sklejałby dwa różne
 * wiersze w jeden.
 */
export function sheetLines(rows: readonly string[][]): SheetLine[] {
  return rows.map((cells, index) => ({
    key: `w${index}`,
    spacer: cells.length === 0,
    cells: [...cells],
  }));
}
