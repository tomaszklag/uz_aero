/**
 * Ninerdeck - LICZBY ZLECEŃ z `GET /orders/summary` (4.0.0, epik Z-C #247; makiety 20F, 30).
 *
 * Jedna odpowiedź serwera zasila trzy miejsca, więc i jeden moduł: kartę „Zlecenia" na
 * Pulpicie, liczby przy segmentach listy i wybór połowy, na której lista się otwiera.
 *
 * ══ ZERO NIE DOSTAJE ZDANIA (reguła SyncChipa, issue #12) ══
 * Karta na Pulpicie istnieje WYŁĄCZNIE z treścią, a liczba przy segmencie stoi wyłącznie
 * przy tym NIEWŁĄCZONYM i wyłącznie dodatnia - przy włączonym powtarzałaby listę pod
 * spodem. Błękit niesie to, co pyta CIEBIE („czeka na Twoją odpowiedź"); „szuka
 * załogi" jest stanem cudzej decyzji i stoi w tonie neutralnym.
 *
 * ══ TELEFON ZDOLNOŚCI NIE ZNA ══
 * Drugi segment i „NOWE ZLECENIE" rozstrzygają bity z serwera (`canCreate`, `canManage`,
 * §9). Samo prowadzenie cudzych zleceń nie daje prawa wysyłania nowych.
 */

import { plural } from '@ninerdeck/format';

import type { RemoteOrderBox, RemoteOrderSummary } from '../../../application';

export interface OrdersCardRow {
  count: number;
  text: string;
  tone: 'blue' | 'neutral';
}

/** Karta „Zlecenia" na Pulpicie (20F); `null` = karty nie ma (zero albo brak sieci). */
export function ordersCardRows(summary: RemoteOrderSummary | null): OrdersCardRow[] | null {
  if (summary == null) return null;
  const rows: OrdersCardRow[] = [];
  if (summary.awaitingAnswer > 0) {
    const n = summary.awaitingAnswer;
    rows.push({ count: n, text: `${plural(n, 'czeka', 'czekają', 'czeka')} na Twoją odpowiedź`, tone: 'blue' });
  }
  if (summary.seekingCrew > 0) {
    const n = summary.seekingCrew;
    rows.push({ count: n, text: `z prowadzonych ${plural(n, 'szuka', 'szukają', 'szuka')} załogi`, tone: 'neutral' });
  }
  return rows.length === 0 ? null : rows;
}

/**
 * Połowa, na której lista się otwiera (pkt 36): „Do mnie", gdy coś tam czeka na Twoją
 * odpowiedź; inaczej „Zlecone" - o ile ta osoba je widzi. Koordynator, do którego nic
 * nie przyszło, nie ma zaczynać każdej wizyty od pustej połowy (30A).
 */
export function defaultBox(summary: RemoteOrderSummary | null): RemoteOrderBox {
  if (summary == null || summary.awaitingAnswer > 0) return 'inbox';
  return summary.canCreate || summary.canManage ? 'managed' : 'inbox';
}

export interface SegmentsVm {
  /** Segment istnieje wyłącznie z drugą połową - jedna połowa przełącznika nie jest przełącznikiem. */
  shown: boolean;
  /** Liczba przy „Do mnie"; `null` = nie stoi (połowa włączona albo zero). */
  inboxCount: number | null;
  /** Liczba przy „Zlecone"; ton neutralny. */
  managedCount: number | null;
  /** „NOWE ZLECENIE" - wyłącznie w „Zlecone" i wyłącznie z prawem zlecania. */
  newOrder: boolean;
}

export function segmentsVm(summary: RemoteOrderSummary | null, box: RemoteOrderBox): SegmentsVm {
  const shown = summary != null && (summary.canCreate || summary.canManage);
  const positive = (n: number | undefined): number | null => (n != null && n > 0 ? n : null);
  return {
    shown,
    inboxCount: shown && box !== 'inbox' ? positive(summary?.awaitingAnswer) : null,
    managedCount: shown && box !== 'managed' ? positive(summary?.seekingCrew) : null,
    newOrder: summary?.canCreate === true && box === 'managed',
  };
}
