/**
 * UZ Aero — panel: lista pól `details` (`.det` z `SZABLON.html`).
 *
 * ══ POKAZUJE WSZYSTKO, CO DOSTAŁA ══
 * Komponent nie filtruje wierszy i nie ma jak tego zrobić — dostaje gotową listę
 * z modułu czystego (`screens/audit/auditDetails.ts`). Pole, którego panel nie umie
 * nazwać, przychodzi tu z `known: false` i renderuje się WYGASZONE, ale renderuje się:
 * dziennik audytu, który ukrywa pole, bo go nie zna, przestaje być narzędziem nadzoru.
 *
 * Wartości idą jako DZIECI REACTA, nigdy przez `dangerouslySetInnerHTML`. `details`
 * niesie treść wpisaną przez człowieka (komentarz do flagi, powód korekty) i pola
 * pochodzące pośrednio z payloadów telefonu — to jest ta granica, na której panel
 * renderujący rejestr przestaje być podatny na wstrzyknięcie.
 */

export interface DetailItem {
  key: string;
  label: string;
  value: string;
  /** `false` = klucz spoza słownika panelu; wiersz jest wygaszony, nie ukryty. */
  known: boolean;
}

interface DetailListProps {
  items: readonly DetailItem[];
  /** Napis dla pustego worka — ekran wie, co znaczy brak szczegółów przy tej akcji. */
  empty: string;
}

export function DetailList({ items, empty }: DetailListProps) {
  if (items.length === 0) return <span className="det-empty">{empty}</span>;

  return (
    <span className="det">
      {items.map((item) => (
        <span className="det-row" key={item.key}>
          <span className="det-k">{item.label}</span>
          <span className={item.known ? 'det-v' : 'det-v raw'}>{item.value}</span>
        </span>
      ))}
    </span>
  );
}
