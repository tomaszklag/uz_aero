/**
 * UZ Aero (serwer) — KONTRAKT skrzynki flag (`A03`).
 *
 * Wyłącznie typy; jedyny dozwolony import to `@uzaero/domain` (patrz `sessions.ts`).
 */

import type { FlagStatus, FlagType } from '@uzaero/domain';

/** Jedna sprawa w skrzynce. Rozbieżność (`details`) niesie adapter — kształt zależy od typu. */
export interface AdminFlagListItem {
  id: number;
  type: FlagType;
  status: FlagStatus;

  aircraftId: string;
  reg: string | null;
  aircraftType: string | null;

  /** Sesje objęte flagą; nakładka dotyczy dwóch, reszta zwykle jednej lub dwóch ogniw. */
  sessionUuids: string[];
  /** Wartości rozbieżności policzone przy ingescie (`domain/mhChain.ts`, `clockDrift.ts`). */
  details: Record<string, unknown>;

  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;

  /**
   * Czy ta flaga TRZYMA kartę dnia poza arkuszem — kolumna „Skutek" i pierwszy klucz
   * sortowania skrzynki.
   *
   * Wartość jest wyliczona, a nie zapisana, i wynika WPROST z bramki eksportera
   * (`application/export/dayExporter.ts`: otwarta `session_overlap` przerywa eksport).
   * Trzymanie jej w kolumnie znaczyłoby, że zmiana bramki wymaga migracji danych,
   * a rozjazd „panel mówi blokuje, eksporter przepuszcza" byłby niewidoczny.
   */
  blocksExport: boolean;
}

/**
 * Skrzynka. Bez kursora, w przeciwieństwie do listy dni — i to jest decyzja, nie
 * przeoczenie: porządek skrzynki (`blokujące eksport → najstarsze`) ma trzy składowe,
 * a kursor keyset opisuje parę. Skrzynka jest zbiorem SPRAW DO ZAMKNIĘCIA, więc jej
 * naturalny rozmiar to kilkanaście pozycji; twardy limit i dokładny `total` mówią
 * prawdę o tym, ile jeszcze zostało. Kursor dokładamy, gdy (i jeśli) skrzynka zacznie
 * być przeglądana stronami — wtedy razem z trzyskładnikowym kluczem.
 */
export interface AdminFlagPage {
  items: AdminFlagListItem[];
  /** Liczba flag spełniających filtr — także wtedy, gdy limit obciął listę. */
  total: number;
}
