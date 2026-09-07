/**
 * UZ Aero - karta OLEJU na ekranie operacji (issue #70, mockup `design/10-statystyki.html`).
 *
 * ══ DLACZEGO OSOBNA KARTA, A NIE TRZECI RACHUNEK Z WERDYKTEM ══
 * Paliwo i motogodziny mają odczyt z OBU stron biegu, więc ich karty liczą zużycie
 * i porównują je z normą. Olej ma tylko jedną stronę: odczyt żyje przy przejęciu,
 * a zdanie samolotu oleju NIE MIERZY (bagnet tuż po locie kłamie - issue #60).
 * Zużycia jednej operacji nie da się z tego policzyć - interwał biegnie
 * pomiar→pomiar przez wiele operacji - więc karta niesie SAME FAKTY: odczyt,
 * dolane i stan po nich. Werdyktu nie ma i nie ma też zdania o jego braku:
 * `naNote` tłumaczy sytuacyjny brak porównania, a tu porównanie nie istnieje
 * jako pojęcie - stały przypis świeciłby przy każdej operacji (reguła SyncChipa).
 *
 * ══ SKĄD LICZBY ══
 * Odczyt, suma dolewek i stan po nich stoją w projekcji (`SessionState.oil`) -
 * policzone przez domenę z pary przejęcia i zdarzeń `oil_add`. Etykiety są spójne
 * z kartą paliwa („Odczyt przy przejęciu" - uwaga z przeglądu 2026-09-02: „pomiar"
 * obok „odczytu" był rozbieżnością słownika, nie rozróżnieniem). LICZNIKA dolewek
 * w etykiecie NIE MA (ta sama uwaga): wzór „Dolane · 2 tankowania" ma sens przy
 * paliwie, gdzie tankowań bywa kilka w operacji - olej dolewa się praktycznie raz,
 * więc liczba przy każdej operacji mówiła to samo i niczego nie odróżniała
 * (reguła SyncChipa z issue #12).
 *
 * ══ KOREKTA NIE TU ══
 * Karta jest czystym odczytem w obu trybach ekranu - jak karty paliwa i motogodzin.
 * Odczyt i dolewkę przy przejęciu poprawia się na osi (wiersz „Przejęcie" → arkusz
 * 10F z polami oleju i powodem), dolewki z kokpitu przy ich własnych wierszach.
 */

import type { SessionState } from '../../../domain';
import type { Tone } from '../../components';
import { oilLitres } from '../../format';
import type { BalanceRow } from './sessionBalance';

/** Treść karty „Olej" - wiersze rachunku i suma, bez werdyktu. */
export interface OilCardView {
  rows: BalanceRow[];
  totalLabel: string;
  totalValue: string;
  /** Bursztyn płynów przy liczbie; kreska bez tonu - to zwykły stan starych danych. */
  totalTone: Tone;
}

export function oilCard(projection: SessionState): OilCardView {
  const { levelL, addedL, afterL } = projection.oil;

  return {
    rows: [
      {
        id: 'level',
        op: '',
        label: 'Odczyt przy przejęciu',
        value: oilLitres(levelL),
      },
      {
        id: 'added',
        op: '+',
        label: 'Dolane',
        // Zero pokazujemy TYLKO przy odczycie: operacja z odczytem mówi „nie dolewano",
        // a operacja bez śladu oleju (sprzed modułu, wpis ręczny bez sekcji) nie mówi
        // o dolewkach nic - „0,0 L" byłoby tam faktem wziętym znikąd.
        value: addedL > 0 || levelL != null ? oilLitres(addedL) : oilLitres(null),
      },
    ],
    // Suma pary wyżej. Przy dolewce bez odczytu zostaje „-", bo dolewka poziomu
    // nie zna - ta sama reguła, którą projekcja trzyma w `oil.afterL`.
    totalLabel: 'Po dolewkach',
    totalValue: oilLitres(afterL),
    totalTone: afterL != null ? 'amber' : 'neutral',
  };
}
