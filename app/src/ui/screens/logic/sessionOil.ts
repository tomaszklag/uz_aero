/**
 * UZ Aero - karta OLEJU na ekranie operacji (issue #70, mockup `design/10-statystyki.html`).
 *
 * ══ DLACZEGO OSOBNA KARTA, A NIE TRZECI RACHUNEK Z WERDYKTEM ══
 * Paliwo i motogodziny mają odczyt z OBU stron biegu, więc ich karty liczą zużycie
 * i porównują je z normą. Olej ma tylko jedną stronę: pomiar żyje przy przejęciu,
 * a zdanie samolotu oleju NIE MIERZY (bagnet tuż po locie kłamie - issue #60).
 * Zużycia jednej operacji nie da się z tego policzyć - interwał biegnie
 * pomiar→pomiar przez wiele operacji - więc karta niesie SAME FAKTY: pomiar,
 * dolewki i stan po nich. Werdyktu nie ma i nie ma też zdania o jego braku:
 * `naNote` tłumaczy sytuacyjny brak porównania, a tu porównanie nie istnieje
 * jako pojęcie - stały przypis świeciłby przy każdej operacji (reguła SyncChipa).
 *
 * ══ SKĄD LICZBY ══
 * Pomiar, suma dolewek i stan po nich stoją w projekcji (`SessionState.oil`) -
 * policzone przez domenę z pary przejęcia i zdarzeń `oil_add`. Ten moduł dokłada
 * tylko LICZNIK dolewek do etykiety (wzorem „Dolane · 2 tankowania" przy paliwie)
 * i liczy go ze strumienia EFEKTYWNEGO: dolewka unieważniona korektą nie wchodzi
 * do sumy w projekcji, więc nie może też wchodzić do licznika obok niej.
 *
 * ══ KOREKTA NIE TU ══
 * Karta jest czystym odczytem w obu trybach ekranu - jak karty paliwa i motogodzin.
 * Pomiar i dolewkę przy przejęciu poprawia się na osi (wiersz „Przejęcie" → arkusz
 * 10F z polami oleju i powodem), dolewki z kokpitu przy ich własnych wierszach.
 */

import { applyCorrections } from '../../../domain';
import type { Event, EventOf, SessionState } from '../../../domain';
import type { Tone } from '../../components';
import { oilLitres, plural } from '../../format';
import type { BalanceRow } from './sessionBalance';

/** Treść karty „Olej" - wiersze rachunku i suma, bez werdyktu. */
export interface OilCardView {
  rows: BalanceRow[];
  totalLabel: string;
  totalValue: string;
  /** Bursztyn płynów przy liczbie; kreska bez tonu - to zwykły stan starych danych. */
  totalTone: Tone;
}

export function oilCard(projection: SessionState, events: Event[]): OilCardView {
  const { levelL, addedL, afterL } = projection.oil;
  const count = addCount(events);

  return {
    rows: [
      {
        id: 'level',
        op: '',
        label: 'Pomiar przy przejęciu',
        value: oilLitres(levelL),
      },
      {
        id: 'added',
        op: '+',
        label: count > 0 ? `Dolane · ${addLabel(count)}` : 'Dolane',
        // Zero pokazujemy TYLKO przy pomiarze: operacja z pomiarem mówi „nie dolewano",
        // a operacja bez śladu oleju (sprzed modułu, wpis ręczny bez sekcji) nie mówi
        // o dolewkach nic - „0,0 L" byłoby tam faktem wziętym znikąd.
        value: addedL > 0 || levelL != null ? oilLitres(addedL) : oilLitres(null),
      },
    ],
    // Suma pary wyżej. Przy dolewce bez pomiaru zostaje „-", bo dolewka poziomu
    // nie zna - ta sama reguła, którą projekcja trzyma w `oil.afterL`.
    totalLabel: 'Po dolewkach',
    totalValue: oilLitres(afterL),
    totalTone: afterL != null ? 'amber' : 'neutral',
  };
}

/**
 * Ile razy dolewano: para z przejęcia liczy się jako jedna dolewka (jedna czynność
 * przy bagnecie), każde `oil_add` z kokpitu jako kolejna. Strumień EFEKTYWNY,
 * nie surowy - patrz nagłówek modułu.
 */
function addCount(events: Event[]): number {
  let count = 0;
  for (const event of applyCorrections(events)) {
    if (event.type === 'oil_add') count += 1;
    if (event.type === 'preflight_confirm') {
      const p = (event as EventOf<'preflight_confirm'>).payload;
      if ((p.oilAddedL ?? 0) > 0) count += 1;
    }
  }
  return count;
}

/** „1 dolewka" / „2 dolewki" / „5 dolewek". */
function addLabel(count: number): string {
  return `${count} ${plural(count, 'dolewka', 'dolewki', 'dolewek')}`;
}
