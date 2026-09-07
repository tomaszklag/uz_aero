/**
 * UZ Aero (serwer) - KONTRAKT listy i karty dnia panelu (`A02`, `A02a`).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` (pilnuje `test/architecture.test.ts`). To jest powierzchnia, którą
 * kiedyś zobaczy klient panelu - a granica działa tylko dlatego, że wskazuje na
 * katalog, do którego nie da się wciągnąć `pg`.
 *
 * **Reguła granicy typów** (`docs/architektura-panelu-serwer.md` §1.2): byt domenowy
 * jedzie jako typ z domeny i NIE dostaje DTO (`SessionState`, `Event`, `FlagType`);
 * złączenie, agregat albo wygoda panelu dostaje własny, jawny DTO.
 *
 * Dlatego `AdminSessionListItem` jest PŁASKI, a nie `SessionRow & {…}`: wiersz listy
 * nie jest bytem domenowym, tylko złączeniem trzech tabel z polami wyliczonymi.
 * Wystawienie kształtu projekcji przywiązałoby panel do niej - a projekcja rośnie
 * (`operation` i `client` doszły przy liście dni, potem liczby statystyk),
 * więc każda taka zmiana stawałaby się zmianą łamiącą panel.
 */

import type { Event, FlagType, MhFormat, OperationType, SessionState } from '@uzaero/domain';

import type { AdminFlagListItem } from './flags.ts';

/** Jeden dzień lotny na liście `A02`. Czasy zdarzeń w epoch ms UTC, stemple w ISO. */
export interface AdminSessionListItem {
  sessionUuid: string;
  /**
   * SYGNATURA OPERACJI - „SP-AXA/2026-09-01/AKO/1" (issue #68).
   *
   * Nazwa, którą operacja ma dla ludzi: uuid adresuje, sygnatura identyfikuje. Panel
   * NIE SKLEJA jej u siebie - druga konwencja nazw znaczyłaby, że administrator
   * i pilot mówią o jednym locie dwoma napisami (ta sama reguła, przez którą nazwę
   * karty arkusza liczy wyłącznie serwer).
   *
   * `null` = nie ma jej z czego złożyć: samolot spoza rejestru, konto pilota usunięte
   * albo operacja bez ani jednego uruchomienia silnika (zdanie bez lotu, 09C).
   */
  signature: string | null;

  aircraftId: string;
  /** Rejestracja z `aircraft`; `null` = samolot spoza rejestru (dane sprzed wpisu). */
  reg: string | null;
  aircraftType: string | null;
  /** Format licznika samolotu - panel formatuje MH, nie zgaduje (`1284.6` vs `645:06`). */
  mhFormat: MhFormat | null;

  picId: string;
  picCode: string | null;
  picName: string | null;
  dualId: string | null;
  dualCode: string | null;
  dualName: string | null;

  status: 'active' | 'closed' | 'voided';
  operation: OperationType | null;
  client: string | null;

  /**
   * Chwila PRZEJĘCIA samolotu (`session_claim`) - kolumna „Dzień · UTC" listy.
   * Każda sesja ją ma (§4.4), więc od 2026-08-07 żaden dzień nie wypada już z filtra
   * zakresu z powodu braku daty. `null` znaczy rejestr niekompletny, nie „bez preflightu".
   */
  claimedAt: number | null;
  closeTime: number | null;

  blockMs: number;
  flightMs: number;
  flightsCount: number;
  mhStart: number | null;
  mhEnd: number | null;
  fuelStartL: number | null;
  fuelEndL: number | null;

  /**
   * ══ LOG DNIA (panel 2.0, 2026-08-30) ══
   * Pola, których grid modułu nie ma skąd wziąć inaczej. Wszystkie są PRZEPISANIEM
   * kolumn projekcji - panel nie liczy z nich niczego poza tym, co widzi.
   */

  /**
   * Bieg silnika. To NIE JEST `claimedAt`/`closeTime`: przejęcie i zdanie samolotu
   * bywają odległe od pracy śmigła o godziny, a log dnia pyta o LOT.
   */
  engineStartAt: number | null;
  engineStopAt: number | null;
  /** Koperta lotów w biegu. `null` = sesja bez lotu (próba silnika, pogoda, usterka). */
  firstTakeoffAt: number | null;
  lastLandingAt: number | null;
  /**
   * Lotniska. `arrivalIcao: null` bywa NORMĄ, nie brakiem - przy operacji na jednym
   * placu (skoki) drugiego lotniska nie ma z definicji, więc czytelnik potrzebuje
   * OBU pól razem z `operation`, żeby wiedzieć, którą pustkę widzi.
   */
  departureIcao: string | null;
  arrivalIcao: string | null;
  /** Suma dolewek paliwa w sesji (litry). Trzecia liczba bilansu: przed → dolano → po. */
  fuelAddedL: number | null;
  /** Pomiar oleju z PRZEJĘCIA; po locie olej się nie mierzy (issue #60). */
  oilLevelL: number | null;
  /** Suma dolewek oleju: para z preflightu + zdarzenia `oil_add`. */
  oilAddedL: number | null;
  /**
   * Liczniki ZDARZEŃ - inne niż `flightsCount`, bo uwzględniają kręgi: lot z czterema
   * `touch and go` to JEDEN lot, ale pięć startów i pięć lądowań (issue #62).
   * `null` = wiersz sprzed kolumn statystyk, do przebudowy projekcji.
   */
  takeoffCount: number | null;
  landingCount: number | null;
  /** Sesja wpisana ręcznie po fakcie - plakietka przy dacie, nie przy wartościach. */
  manualEntry: boolean | null;
  /** Stan oleju, z którym silnik ruszył (pomiar + dolewka) - liczy domena. */
  oilAfterL: number | null;

  /** Typy OTWARTYCH flag dotyczących tej sesji - plakietka „2 flagi" w kolumnie „Stan". */
  openFlags: FlagType[];
  /** Ostatnia rewizja karty arkusza; `null` = nigdy nie eksportowano. */
  exportRevision: number | null;
  /** Kiedy projekcja była ostatnio odświeżana = ostatnia przyjęta paczka tej sesji. */
  updatedAt: string;
}

/**
 * Strona listy. `nextCursor === null` znaczy „to był koniec", a nie „spróbuj jeszcze raz".
 * `total` liczymy dokładnie tym samym filtrem (`COUNT(*)`) - przy skali klubu to tanie,
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
 * Oś pokazuje strumień SUROWY - rejestr jest append-only i widać w nim wszystko,
 * łącznie ze zdarzeniami unieważnionymi. Adnotacje wyliczamy PORÓWNANIEM z wynikiem
 * `applyCorrections`, a nie własnym rozstrzyganiem „która korekta wygrywa": ta reguła
 * ma jedną implementację, w domenie (`application/admin/eventTimeline.ts`).
 */
export interface AdminTimelineEntry {
  /** Byt domenowy - jedzie bez DTO (reguła granicy typów). */
  event: Event;
  /** `true` = unieważnione korektą; panel przekreśla wiersz. */
  voided: boolean;
  /** Czas po korekcie (`retime`); `null` = czas zdarzenia jest oryginalny. */
  correctedTime: number | null;
  /**
   * `true` = to zdarzenie poprawił ADMINISTRATOR z panelu, a nie pilot w oknie 24 h.
   *
   * To jest fakt o rejestrze, nie podpowiedź dla interfejsu, i bez serwera nie da się
   * go ustalić: `event_correction` wygląda identycznie niezależnie od tego, kto ją
   * dopisał - różni je wyłącznie `events.source_device` (kolumna serwera, spoza
   * `Event`). Konsekwencja jest jednak dla panelu decydująca: korekta pilota idzie
   * przez `POST /events`, czyli Z POMINIĘCIEM `AuditedWrite`, więc wiersza
   * w `admin_audit` po niej NIE MA. Przejście „ślad w audycie" ma sens dokładnie
   * wtedy, gdy to pole jest `true`.
   */
  adminCorrected: boolean;
}

/**
 * Karta jednego dnia (`A02a`). JEDYNE miejsce panelu, w którym serwer liczy
 * `projectSession` na żądanie - listy czytają wyłącznie kolumny projekcji.
 */
export interface AdminSessionDetail {
  session: AdminSessionListItem;
  /**
   * Stan dnia policzony `projectSession` z pełnego strumienia. Panel FORMATUJE te
   * liczby i nic nie liczy - to ta sama gwarancja, co `test/contract.test.ts`:
   * karta dnia w panelu i ekran 10 telefonu nie mogą się różnić.
   */
  state: SessionState;
  timeline: AdminTimelineEntry[];
  /** Flagi sesji RAZEM z rozwiązanymi - inaczej historia decyzji znikałaby z karty. */
  flags: AdminFlagListItem[];
}
