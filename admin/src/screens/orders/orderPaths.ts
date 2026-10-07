/**
 * Ninerdeck - panel: ADRESY modułu Zlecenia i wybór pierwszej połowy listy (4.0.0,
 * `docs/zlecenia.md` §15, pkt 36; epik Z-D #248).
 *
 * ══ POŁOWA LISTY STOI JAWNIE W ADRESIE ══
 * `?widok=do-mnie` / `?widok=zlecone` - wklejony adres znaczy to samo dla każdego.
 * Wejście z kolumny (`#/zlecenia` bez parametru) wybiera połowę tak jak telefon:
 * „Do mnie", gdy tam coś czeka na odpowiedź, a inaczej „Zlecone" - osobie, która tę
 * połowę widzi. Członek bez uprawnień segmentu nie ma i zostaje przy „Do mnie".
 *
 * Okres („Minione") też stoi w adresie, jak zakres dat w dzienniku: stan ekranu, który
 * nie trafia do adresu, ginie przy pierwszym wklejeniu linku w rozmowie.
 *
 * Moduł czysty - test obok.
 */

import type { OrderBox } from '../../api/orders';

/** Okres listy: termin jeszcze przed nami albo już za nami. */
export type OrderPeriod = 'upcoming' | 'past';

/** Połowa listy w adresie - po polsku, bo adres bywa wklejany w rozmowie. */
export type OrderView = 'do-mnie' | 'zlecone';

export const BOX_OF: Readonly<Record<OrderView, OrderBox>> = {
  'do-mnie': 'inbox',
  zlecone: 'managed',
};

/** Połowa z adresu; `null` = brak albo napis nieznany - wtedy wybiera `defaultView`. */
export function viewOf(param: string | null): OrderView | null {
  return param === 'do-mnie' || param === 'zlecone' ? param : null;
}

/** Okres z adresu - domyślnie nadchodzące. */
export function periodOf(param: string | null): OrderPeriod {
  return param === 'minione' ? 'past' : 'upcoming';
}

/**
 * Pierwsza połowa przy wejściu bez parametru (pkt 36): „Do mnie", gdy coś tam czeka na
 * odpowiedź albo gdy drugiej połowy dla tej osoby nie ma; inaczej „Zlecone".
 */
export function defaultView(input: { awaitingAnswer: number; seesManaged: boolean }): OrderView {
  return input.seesManaged && input.awaitingAnswer === 0 ? 'zlecone' : 'do-mnie';
}

/** Zapytanie adresu: połowa zawsze, okres tylko gdy nie jest domyślny. */
const query = (view: OrderView, period: OrderPeriod): string =>
  period === 'past' ? `?widok=${view}&okres=minione` : `?widok=${view}`;

/** Adres listy. */
export function ordersPath(view: OrderView, period: OrderPeriod = 'upcoming'): string {
  return `/zlecenia${query(view, period)}`;
}

/**
 * Adres szuflady zlecenia NAD listą - połowa i okres zostają, więc lista pod spodem się nie
 * zmienia, a zamknięcie szuflady wraca dokładnie tam, skąd przyszło.
 */
export function orderPath(id: string, view: OrderView, period: OrderPeriod = 'upcoming'): string {
  return `/zlecenia/${encodeURIComponent(id)}${query(view, period)}`;
}
