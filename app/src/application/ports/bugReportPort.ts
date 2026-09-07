/**
 * UZ Aero - PORT ZGŁOSZEŃ BŁĘDÓW (issue #87, kanał zwrotny na czas testów z pilotami).
 *
 * Przycisk w prawym górnym rogu każdego ekranu i każdego arkusza zapisuje zgłoszenie
 * LOKALNIE, a wysyła je pętla okazji. To nie jest ozdoba: pilot zauważa błąd tam, gdzie
 * pracuje - czyli często bez zasięgu - a formularz, który wymaga sieci, w teren nie
 * pojedzie (§4.1: „brak sieci NIGDY nie blokuje pracy pilota"). Zgłoszenie zapisane
 * w hangarze bez zasięgu ma dojechać samo, gdy telefon wróci do świata.
 *
 * ══ TO NIE JEST ZDARZENIE REJESTRU ══
 * Ta sama granica, co przy śladzie GPS (`tracePort.ts`): rejestr opisuje LOT, jest
 * wieczny i wchodzi do projekcji, sum i karty arkusza. Zgłoszenie opisuje APLIKACJĘ,
 * ma własną wysyłkę (`sentAt`) i jest materiałem roboczym jednej fazy projektu. Wpuszczone
 * do `events` byłoby ciałem obcym, które każda reguła musiałaby jawnie pomijać.
 *
 * ══ KSIĘGOWOŚĆ JAK W OUTBOKSIE ══
 * `sentAt IS NULL` wyznacza kolejkę, potwierdzone wiersze kasuje `purgeSentBugReports`
 * (serwer ma odtąd jedyną kopię - ta sama decyzja, co przy nagraniu śladu, issue #47).
 * Osobny krok po oznaczeniu, a nie kasowanie w jego miejsce: przerwanie procesu między
 * jednym a drugim zostawia wiersze OZNACZONE, które sprzątnie najbliższy przebieg.
 */

import type { EpochMillis } from '../../domain';

/**
 * Jak bardzo to przeszkadza W PRACY - nie jak trudne jest do naprawienia. `null`
 * (pilot nie wybrał) jest normalnym stanem: waga jest w formularzu opcjonalna, bo
 * zgłoszenie ma kosztować jedno zdanie, a nie decyzję.
 */
export type BugSeverity = 'blocking' | 'annoying' | 'minor';

export interface NewBugReport {
  /** Nadany NA TELEFONIE - klucz idempotencji wysyłki, jak `uuid` zdarzenia. */
  uuid: string;
  /** Zegar telefonu w chwili tapnięcia „WYŚLIJ" - kiedy pilot to widział. */
  createdAt: EpochMillis;
  severity: BugSeverity | null;
  description: string;
  /** Czytelna etykieta miejsca („KOKPIT (04/05) · arkusz TANKOWANIE"). */
  screen: string;
  appVersion: string | null;
  /** Operacja, przy której powstało zgłoszenie; `null` poza kokpitem i logiem. */
  sessionUuid: string | null;
  /**
   * KOMPLET kontekstu okna. Nieprzezroczysty dla magazynu i dla serwera - buduje go
   * `ui/components/bug/bugContext.ts`, a jego kształt zmienia się razem z tym, co
   * warto wiedzieć o zgłoszeniu (issue #87: „im więcej informacji tym lepiej").
   */
  context: Record<string, unknown>;
}

export interface BugReport extends NewBugReport {
  /** `null` = w kolejce. Księgowość TELEFONU, nie treść zgłoszenia. */
  sentAt: EpochMillis | null;
}

export interface BugReportPort {
  appendBugReport(report: NewBugReport): Promise<void>;
  /** Kolejka: zgłoszenia bez potwierdzenia, w kolejności zapisu. */
  getPendingBugReports(limit: number): Promise<BugReport[]>;
  markBugReportsSent(uuids: string[], sentAt: EpochMillis): Promise<void>;
  /** Kasuje POTWIERDZONE - od tej chwili jedyną kopią jest serwer. */
  purgeSentBugReports(): Promise<number>;
  /** Ile czeka w kolejce - liczba pokazywana pilotowi po zapisaniu zgłoszenia. */
  pendingBugReportCount(): Promise<number>;
}
