/**
 * UZ Aero (serwer) — KONTRAKT listy i karty dnia panelu (`A02`, `A02a`).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` (pilnuje `test/architecture.test.ts`). To jest powierzchnia, którą
 * kiedyś zobaczy klient panelu — a granica działa tylko dlatego, że wskazuje na
 * katalog, do którego nie da się wciągnąć `pg`.
 *
 * **Reguła granicy typów** (`docs/architektura-panelu-serwer.md` §1.2): byt domenowy
 * jedzie jako typ z domeny i NIE dostaje DTO (`SessionState`, `Event`, `FlagType`);
 * złączenie, agregat albo wygoda panelu dostaje własny, jawny DTO.
 *
 * Dlatego `AdminSessionListItem` jest PŁASKI, a nie `SessionRow & {…}`: wiersz listy
 * nie jest bytem domenowym, tylko złączeniem trzech tabel z polami wyliczonymi.
 * Wystawienie kształtu projekcji przywiązałoby panel do niej — a projekcja rośnie
 * (migracja 11 dołożyła `operation` i `client`, kolejne dołożą liczby statystyk),
 * więc każda taka zmiana stawałaby się zmianą łamiącą panel.
 */

import type { Event, FlagType, MhFormat, OperationType, SessionState } from '@uzaero/domain';

import type { AdminFlagListItem } from './flags.ts';

/** Jeden dzień lotny na liście `A02`. Czasy zdarzeń w epoch ms UTC, stemple w ISO. */
export interface AdminSessionListItem {
  sessionUuid: string;

  aircraftId: string;
  /** Rejestracja z `aircraft`; `null` = samolot spoza rejestru (dane sprzed wpisu). */
  reg: string | null;
  aircraftType: string | null;
  /** Format licznika samolotu — panel formatuje MH, nie zgaduje (`1284.6` vs `645:06`). */
  mhFormat: MhFormat | null;

  picId: string;
  picCode: string | null;
  picName: string | null;
  dualId: string | null;
  dualCode: string | null;
  dualName: string | null;

  status: 'active' | 'closed';
  operation: OperationType | null;
  client: string | null;

  /**
   * Początek służby (meldunek z `preflight_confirm`) — kolumna „Dzień · UTC" listy.
   * `null` = sesja bez preflightu; taki dzień NIE MA daty i wypada z filtra zakresu.
   * Nazwa pola idzie za zawartością, a nie za nazwą kolumny (`sessions.claim_time`,
   * uzasadnienie w `application/sessionRow.ts`).
   */
  dutyStart: number | null;
  closeTime: number | null;

  blockMs: number;
  flightMs: number;
  flightsCount: number;
  mhStart: number | null;
  mhEnd: number | null;
  fuelStartL: number | null;
  fuelEndL: number | null;

  /** Typy OTWARTYCH flag dotyczących tej sesji — plakietka „2 flagi" w kolumnie „Stan". */
  openFlags: FlagType[];
  /** Ostatnia rewizja karty arkusza; `null` = nigdy nie eksportowano. */
  exportRevision: number | null;
  /** Kiedy projekcja była ostatnio odświeżana = ostatnia przyjęta paczka tej sesji. */
  updatedAt: string;
}

/**
 * Strona listy. `nextCursor === null` znaczy „to był koniec", a nie „spróbuj jeszcze raz".
 * `total` liczymy dokładnie tym samym filtrem (`COUNT(*)`) — przy skali klubu to tanie,
 * a szacowanie z `pg_class.reltuples` byłoby optymalizacją problemu, którego nie ma.
 */
export interface AdminSessionPage {
  items: AdminSessionListItem[];
  nextCursor: string | null;
  total: number;
}

/**
 * Pozycja osi zdarzeń na karcie dnia (`A02a`).
 *
 * Oś pokazuje strumień SUROWY — rejestr jest append-only i widać w nim wszystko,
 * łącznie ze zdarzeniami unieważnionymi. Adnotacje wyliczamy PORÓWNANIEM z wynikiem
 * `applyCorrections`, a nie własnym rozstrzyganiem „która korekta wygrywa": ta reguła
 * ma jedną implementację, w domenie (`application/admin/eventTimeline.ts`).
 */
export interface AdminTimelineEntry {
  /** Byt domenowy — jedzie bez DTO (reguła granicy typów). */
  event: Event;
  /** `true` = unieważnione korektą; panel przekreśla wiersz. */
  voided: boolean;
  /** Czas po korekcie (`retime`); `null` = czas zdarzenia jest oryginalny. */
  correctedTime: number | null;
}

/**
 * Karta jednego dnia (`A02a`). JEDYNE miejsce panelu, w którym serwer liczy
 * `projectSession` na żądanie — listy czytają wyłącznie kolumny projekcji.
 */
export interface AdminSessionDetail {
  session: AdminSessionListItem;
  /**
   * Stan dnia policzony `projectSession` z pełnego strumienia. Panel FORMATUJE te
   * liczby i nic nie liczy — to ta sama gwarancja, co `test/contract.test.ts`:
   * karta dnia w panelu i ekran 10 telefonu nie mogą się różnić.
   */
  state: SessionState;
  timeline: AdminTimelineEntry[];
  /** Flagi sesji RAZEM z rozwiązanymi — inaczej historia decyzji znikałaby z karty. */
  flags: AdminFlagListItem[];
}
