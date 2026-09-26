/**
 * Ninerdeck (serwer) - KONTRAKT skrzynki flag (`A03`).
 *
 * Wyłącznie typy; jedyny dozwolony import to `@ninerdeck/domain` (patrz `sessions.ts`).
 */

import type { FlagStatus, FlagType, MhFormat } from '@ninerdeck/domain';

/**
 * OTWARTA flaga przy wierszu operacji (3.2.0, P-D): identyfikator prowadzi do sprawy,
 * `details` daje podpis z liczbami („przekazano 92 L"). Bez notatki i statusu - wiersz
 * listy pyta wyłącznie „co tu wisi", resztę mówi skrzynka.
 */
export interface AdminOpenFlag {
  id: number;
  type: FlagType;
  details: Record<string, unknown>;
}

/**
 * Operacja objęta flagą, w kształcie, którym skrzynka ją NAZYWA (3.2.0, P-D). Do 3.2.0
 * flaga niosła same uuid-y, a ekran skrzynki nie miał komu ich pokazać: uuid adresuje,
 * sygnatura identyfikuje (issue #68). Nazwisko i chwile są tu po to, żeby wiersz
 * powiedział „B. Nowak trzyma maszynę od 08:15, M. Zięba przejęła ją 15:40" bez drugiego
 * żądania na każdą sprawę. `tab` = karta doby tej operacji - nakładka mówi, KTÓRĄ kartę
 * trzyma poza arkuszem.
 */
export interface AdminFlagSession {
  sessionUuid: string;
  signature: string | null;
  aircraftId: string;
  reg: string | null;
  picId: string;
  picCode: string | null;
  picName: string | null;
  status: 'active' | 'closed' | 'voided';
  claimedAt: number | null;
  closeTime: number | null;
  tab: string | null;
}

/** Jedna sprawa w skrzynce. Rozbieżność (`details`) niesie adapter - kształt zależy od typu. */
export interface AdminFlagListItem {
  id: number;
  type: FlagType;
  status: FlagStatus;

  aircraftId: string;
  reg: string | null;
  aircraftType: string | null;
  /** Format licznika maszyny - podpis „zdanie 1238:52" formatuje panel, nie zgaduje. */
  mhFormat: MhFormat | null;

  /** Sesje objęte flagą; nakładka dotyczy dwóch, reszta zwykle jednej lub dwóch ogniw. */
  sessionUuids: string[];
  /**
   * Te same operacje NAZWANE (sygnatura, pilot, chwile, karta) - w kolejności
   * `sessionUuids`. Operacja, której projekcja nie zna, po prostu tu nie stoi; panel
   * wraca wtedy do uuid-a, zamiast dostawać wiersz z pustkami.
   */
  sessions: AdminFlagSession[];
  /** Wartości rozbieżności policzone przy ingescie (`domain/mhChain.ts`, `clockDrift.ts`). */
  details: Record<string, unknown>;

  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;

  /**
   * Czy ta flaga TRZYMA kartę dnia poza arkuszem - kolumna „Skutek" i pierwszy klucz
   * sortowania skrzynki.
   *
   * Wartość jest wyliczona, a nie zapisana, i wynika WPROST z bramki eksportera
   * (`application/export/dayExporter.ts`: otwarta `aircraft_overlap` przerywa eksport).
   * Trzymanie jej w kolumnie znaczyłoby, że zmiana bramki wymaga migracji danych,
   * a rozjazd „panel mówi blokuje, eksporter przepuszcza" byłby niewidoczny.
   */
  blocksExport: boolean;
}

/**
 * Skrzynka. Bez kursora, w przeciwieństwie do listy dni - i to jest decyzja, nie
 * przeoczenie: porządek skrzynki (`blokujące eksport → najstarsze`) ma trzy składowe,
 * a kursor keyset opisuje parę. Skrzynka jest zbiorem SPRAW DO ZAMKNIĘCIA, więc jej
 * naturalny rozmiar to kilkanaście pozycji; twardy limit i dokładny `total` mówią
 * prawdę o tym, ile jeszcze zostało. Kursor dokładamy, gdy (i jeśli) skrzynka zacznie
 * być przeglądana stronami - wtedy razem z trzyskładnikowym kluczem.
 */
export interface AdminFlagPage {
  items: AdminFlagListItem[];
  /** Liczba flag spełniających filtr - także wtedy, gdy limit obciął listę. */
  total: number;
}
