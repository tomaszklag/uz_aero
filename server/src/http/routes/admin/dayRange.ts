/**
 * UZ Aero (serwer) — zakres DAT w query stringu tras panelu.
 *
 * Panel filtruje po DNIACH, nie po stemplach, bo tak wygląda kalendarz na `A02`
 * i pasek zakresu na `A09`. Parser stoi w osobnym pliku, bo używają go co najmniej
 * dwie trasy (dni lotne, dziennik audytu), a druga kopia tej samej reguły to
 * najkrótsza droga do listy, która gubi ostatni dzień tylko na jednym ekranie.
 */

import { z } from 'zod';

/**
 * Dzień jako `YYYY-MM-DD` w UTC → północ tego dnia (epoch ms).
 *
 * ══ SAM REGEX NIE WYSTARCZA — I TO NIE JEST DROBIAZG ══
 * `Date.UTC` NIE waliduje, tylko PRZEWIJA: `Date.UTC(2026, 12, 45)` nie jest błędem,
 * tylko 14 lutego 2027. Kształt `YYYY-MM-DD` przepuszczał więc `2026-13-45`, a trasa
 * odpowiadała 200 na zakres cofnięty o ponad pół roku względem tego, o co pytano.
 *
 * W narzędziu NADZORU to najgorszy możliwy tryb awarii: nie ma komunikatu, nie ma
 * pustej listy, jest wiarygodnie wyglądająca odpowiedź o innym okresie. Administrator
 * sprawdzający „czy w lipcu czegoś nie przegapiliśmy" dostawał luty i nie miał jak
 * tego zauważyć.
 *
 * Stąd round-trip: składamy datę z powrotem na napis i wymagamy, żeby zgadzała się
 * z wejściem. To jedyny sposób, który odsiewa PRZEWINIĘTE daty (`2026-02-30`,
 * `2026-00-10`, `2026-12-32`) bez przepisywania kalendarza gregoriańskiego.
 *
 * ══ PARSUJEMY NAPIS ISO, A NIE `Date.UTC(y, m, d)` — I TO NIE JEST KOSMETYKA ══
 * `Date.UTC` ma drugą, osobną własność przewijania: **lata 0–99 mapuje na 1900 + rok**.
 * `Date.UTC(99, 0, 1)` to 1 stycznia 1999, więc round-trip odrzucał `0099-01-01` jako
 * datę nieistniejącą — mimo że jest to poprawna data ISO. Panel takiego zakresu NIE
 * odrzucał (waliduje `new Date('0099-01-01T00:00:00.000Z')`, czyli parsowanie ISO, które
 * roku nie przewija), więc filtr z adresu przechodził walidację ekranu i dostawał 400 od
 * serwera. Skutek widoczny dla człowieka: baner **„Panel działa wyłącznie online"**, czyli
 * komunikat o SIECI przy błędzie walidacji zakresu dat.
 *
 * Obie strony liczą teraz tak samo, tym samym mechanizmem: parsowanie ISO 8601 UTC
 * i porównanie wyniku z wejściem.
 *
 * Znalezione przy `A04` (2026-08-01), rozjazd `Date.UTC` ↔ `Date.parse` domknięty
 * 2026-08-02.
 */
export const dayParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'oczekiwano daty YYYY-MM-DD (UTC)')
  .transform((value, ctx) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    const ms = parsed.getTime();

    // `Number.isNaN` PRZED `toISOString`, bo na dacie nieprawidłowej ta metoda RZUCA
    // (`RangeError`) — a wartość z query stringa nie ma prawa dać 500.
    if (Number.isNaN(ms) || !parsed.toISOString().startsWith(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `data nie istnieje: ${value}` });
      return z.NEVER;
    }
    return ms;
  });

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Górna granica zakresu jako KONIEC doby, nie jej początek.
 *
 * Zakres jest obustronnie DOMKNIĘTY: `do=2026-07-31` obejmuje cały 31 lipca do
 * 23:59:59.999 UTC. Inaczej „od 25 do 31" gubiłoby ostatni dzień — najbardziej
 * nieoczywisty możliwy sposób na zgubienie danych w narzędziu nadzoru.
 */
export function endOfDay(dayStartMs: number | undefined): number | undefined {
  return dayStartMs === undefined ? undefined : dayStartMs + DAY_MS - 1;
}
