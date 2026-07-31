/**
 * UZ Aero (serwer) — składanie `WHERE` z filtrów OPCJONALNYCH.
 *
 * Ten plik (razem z `keyset.ts`) jest tym, co wchodzi ZAMIAST query buildera — decyzja
 * „bez ORM-a i bez query buildera" (`docs/architektura-panelu-serwer.md` §2.4) zostawia
 * dokładnie jedną realną dziurę: listy panelu mają sześć–osiem filtrów, z których każdy
 * bywa nieustawiony.
 *
 * **Dlaczego to musi być moduł, a nie pętla w adapterze.** Ręczne sklejanie fragmentów
 * z licznikiem `$n` jest najbardziej podatnym na pomyłkę kodem w całym panelu:
 * przesunięcie numeracji o jeden NIE JEST błędem typów ani składni — jest cichym
 * porównaniem złej kolumny ze złą wartością, które przechodzi testy „czy zwraca
 * wiersze". Tu numeracja powstaje w jednym miejscu i ma testy.
 *
 * **Wartości ZAWSZE jadą parametrem** — klasa nie ma metody wklejającej wartość do
 * tekstu SQL-a i nie wolno jej dodać. To jedyna gwarancja, że filtr z panelu nie
 * stanie się powierzchnią wstrzyknięcia.
 */

export class SqlFilter {
  private readonly fragments: string[] = [];
  private readonly values: unknown[] = [];

  /**
   * Dopisuje warunek. `?` w `fragment` to miejsce na wartość — numer `$n` nadaje
   * klasa, w kolejności wywołań.
   *
   * Niezgodność liczby `?` z liczbą wartości RZUCA. To jest pomyłka programisty
   * (literówka w SQL-u), a nie stan świata: cicha akceptacja dałaby zapytanie
   * z parametrem, którego nikt nie czyta, albo z `$n` bez wartości.
   */
  add(fragment: string, ...values: unknown[]): this {
    const holes = (fragment.match(/\?/g) ?? []).length;
    if (holes !== values.length) {
      throw new Error(
        `SqlFilter: fragment „${fragment}" ma ${holes} miejsc na wartości, podano ${values.length}`,
      );
    }

    let i = 0;
    this.fragments.push(fragment.replace(/\?/g, () => `$${this.values.length + ++i}`));
    this.values.push(...values);
    return this;
  }

  /**
   * Filtr OPCJONALNY: pomijany, gdy wartość jest NIEUSTAWIONA (`undefined`).
   *
   * `null` jest wartością, nie brakiem — `addOptional('dual_id = ?', null)` zbuduje
   * poprawny (choć nigdy nieprawdziwy) warunek, bo `= NULL` to w SQL-u co innego niż
   * `IS NULL`. Rozróżnienie „nie ustawiono" od „ustawiono na nic" jest tu jedynym
   * powodem, dla którego ta metoda istnieje osobno od `add`.
   */
  addOptional(fragment: string, value: unknown): this {
    return value === undefined ? this : this.add(fragment, value);
  }

  /**
   * Rejestruje wartość POZA warunkiem (`LIMIT`, `OFFSET` w miejscach, gdzie nadal
   * jest sensowny) i zwraca jej `$n` do wklejenia w tekst zapytania.
   *
   * Kolejność wywołań `add`/`bind` nie musi odpowiadać kolejności w tekście SQL-a:
   * numer jest zapisany w zwróconym napisie, a tablica parametrów jest indeksowana
   * pozycyjnie — to jest właśnie ta księgowość, której nie chcemy prowadzić ręcznie.
   */
  bind(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  /** `''` przy zerze warunków (nie `WHERE TRUE` — pusty napis wkleja się wszędzie). */
  where(): string {
    return this.fragments.length === 0 ? '' : `WHERE ${this.fragments.join(' AND ')}`;
  }

  /** Parametry w kolejności numerów `$n`. Kopia — wołający nie ma czego popsuć. */
  params(): unknown[] {
    return [...this.values];
  }

  /** Numer, który dostanie NASTĘPNA wartość. Do asercji w testach i diagnostyki. */
  next(): number {
    return this.values.length + 1;
  }
}
