/**
 * UZ Aero (serwer) - KONTRAKT rejestru zdarzeń panelu (`A04`).
 *
 * Wszystkie inne ekrany panelu pokazują PROJEKCJE. Ten jeden pokazuje SUROWY FAKT,
 * z którego projekcje powstały - i z tego wynika reguła nadrzędna całego kontraktu:
 * **wiersz jedzie do panelu tak, jak leży w tabeli, bez interpretacji.**
 *
 * ══ CO Z TEGO WYNIKA W TYPACH (i dlaczego nie jest to niechlujstwo) ══
 *
 *  1. **`type` jest napisem, nie unią `EventType`.** Kolumna `events.type` celowo nie
 *     ma `CHECK`-a, a walidacja katalogu zachodzi na WEJŚCIU, w `POST
 *     /events`. Zwężenie przy odczycie kazałoby narzędziu śledczemu albo rzucić na
 *     wierszu spoza katalogu (rejestr przestaje się otwierać przez własną historię),
 *     albo taki wiersz pominąć (rejestr zaczyna ukrywać zdarzenia). Ta sama decyzja,
 *     co przy `AdminAuditEntry.action`.
 *  2. **`payload` jest `unknown`, nie `Record<string, unknown>`.** `JSONB` przyjmuje
 *     też tablicę, liczbę i `null`, a wiersz wpisany ręcznie w psql albo pochodzący
 *     ze starszej wersji telefonu może mieć dowolny kształt. Obietnica „to zawsze
 *     obiekt" jest tu obietnicą, której baza nie składa - a rejestr, który wywraca się
 *     na kształcie payloadu, nie odpowiada na pytanie „co dokładnie przyszło z telefonu".
 *
 * ══ DWA ZEGARY SĄ SEDNEM TEGO EKRANU, NIE KOLUMNĄ OBOK ══
 * `deviceTime` i `gpsTime` niosą tę samą chwilę widzianą przez dwa różne przyrządy,
 * a flaga `CLOCK_DRIFT` bierze się dokładnie z ich różnicy. Dlatego kontrakt niesie
 * `driftMs` policzone przez SERWER (panel nie liczy - `docs/architektura-panelu-frontend.md`
 * §5.3) i rozróżnia `null` („nie ma czego porównać, bo nie było fixa") od zera
 * („zegary się zgadzały"). Sklejenie tych dwóch stanów byłoby wpisaniem telefonowi
 * dokładności, której nie miał.
 */

/** Który zegar dał czas efektywny - ten, którym liczy `projectSession`. */
export type EventClock = 'gps' | 'device';

/** Jedno zdarzenie w rejestrze - wiersz tabeli `A04`. */
export interface AdminEventEntry {
  uuid: string;
  sessionUuid: string;

  aircraftId: string;
  /** Rejestracja z `aircraft`; `null` = jednostki nie ma już w rejestrze floty. */
  reg: string | null;

  picId: string;
  picCode: string | null;
  picName: string | null;
  /** `null` = zdarzenie zapisane jednoosobowo (bez Duala). */
  dualId: string | null;
  dualCode: string | null;
  dualName: string | null;

  /** Surowy kod typu - także spoza katalogu (patrz nagłówek pliku). */
  type: string;

  /** Zegar telefonu (epoch ms UTC) - zawsze obecny. */
  deviceTime: number;
  /** Czas z fixa GPS (epoch ms UTC); `null` = brak fixa w chwili zapisu. */
  gpsTime: number | null;
  /**
   * `|deviceTime − gpsTime|` w ms. **`null` = różnicy NIE MA**, bo jednego z zegarów
   * zabrakło - a nie „zero". Zero jest twierdzeniem, że zegary się zgadzały.
   */
  driftMs: number | null;
  /**
   * Czas, którym liczy projekcja - **PO nałożeniu korekt**, nie z kolumn surowych.
   *
   * Nazwa jest tu obietnicą, którą trzeba dotrzymać: ekran wypisuje przy tej wartości
   * „tym liczy projekcja", a rejestr istnieje po to, żeby wyjaśnić, skąd wzięła się
   * liczba. Liczony z surowego `gpsTime ?? deviceTime` kłamał zaraz po korekcie
   * `retime` z `A02b` - czyli po operacji, do której ten sam ekran odsyła
   * administratora. Surowe `gpsTime` i `deviceTime` stoją w swoich polach obok,
   * więc nic nie ginie.
   *
   * Dla wiersza unieważnionego i dla samej korekty opisuje zapis surowy: projekcja
   * pierwszego nie liczy wcale, a drugi nie jest jej wejściem.
   */
  effectiveTime: number;
  /** Który z dwóch zegarów dał `effectiveTime` - w TYM SAMYM stanie (po korektach). */
  effectiveClock: EventClock;

  /** Treść zdarzenia DOSŁOWNIE z `JSONB`, dowolnego kształtu (patrz nagłówek). */
  payload: unknown;
  schemaVersion: number;

  /** ISO 8601 UTC - kiedy SERWER przyjął zdarzenie. Po tym idzie porządek listy. */
  receivedAt: string;
  /** `null` = wiersz sprzed wprowadzenia kolumny; napis = czym przyszło (także panel). */
  sourceDevice: string | null;
  /**
   * **TEN WIERSZ** zapisał panel administracyjny (`source_device` = `admin:<pilotId>`),
   * a nie telefon. To jest fakt o POCHODZENIU zapisu i nie ma nic wspólnego z tym, kto
   * zapisał korektę tego zdarzenia (`adminCorrected` niżej) - mylenie tych dwóch rzeczy
   * dawało w kolumnie `source_device` podpis „korekta z panelu" pod nazwą telefonu,
   * a sam wiersz korekty zapisany przez panel takiego podpisu nie dostawał.
   */
  writtenByPanel: boolean;

  /**
   * Korekta UNIEWAŻNIŁA to zdarzenie. Wiersz **zostaje w rejestrze** i ma zostać
   * widoczny - przekreślony, nie usunięty: to właśnie te wiersze tłumaczą, dlaczego
   * liczby dnia różnią się od tego, co zapisał telefon.
   */
  voided: boolean;
  /**
   * Zdarzenie RUSZAŁA korekta - z ISTNIENIA zapisu `event_correction`, nie z tego, czy
   * jakaś liczba się zmieniła. Para `void` → `retime` na czas pierwotny nie zmienia ani
   * jednej wartości, a mimo to zdarzenie ma za sobą dwie decyzje i nie jest tym samym,
   * co zdarzenie nietknięte. Wiersz `event_correction` ma tu `false`: poprawia się fakt,
   * nie poprawkę.
   */
  corrected: boolean;
  /**
   * Czas NADANY korektą `retime` (epoch ms UTC). `null` = czasu nie nadano - bo korekt
   * nie było, bo zdarzenie jest unieważnione, albo bo korekta przywróciła czas pierwotny.
   * Odpowiedzią na pytanie „czy ktoś to zdarzenie ruszał" jest `corrected`, nie to pole.
   */
  correctedTime: number | null;
  /**
   * Korektę tego zdarzenia zapisał PANEL, a nie pilot w oknie 24 h. Z samego strumienia
   * tych dwóch przypadków rozróżnić się nie da (payload jest identyczny) - różni je
   * `events.source_device` (`application/admin/sourceDevice.ts`).
   */
  adminCorrected: boolean;
}

/**
 * Liczniki kafli `A04`. Opisują **CAŁY zakres zapytania**, nie widoczne okno: `limit`
 * obcina stronę, a nie pytanie. Licznik policzony po obcięciu odpowiadałby na pytanie
 * „ile widzę", podczas gdy kafel pyta „ile jest" - i przy A05 był to realny błąd
 * (chip „Bez karty" pokazywał zero, bo obcięcie zabierało wiersze przed filtrem).
 */
export interface AdminEventCounts {
  total: number;
  /** `gps_time IS NULL` - czas wzięty z zegara telefonu, bez potwierdzenia z GPS. */
  withoutGpsFix: number;
  /** `|device − gps| > driftThresholdMs`; wiersze bez fixa NIE wchodzą (nie ma czego porównać). */
  clockDrift: number;
  /**
   * Próg, którym policzono `clockDrift` (ms). Jedzie w odpowiedzi, bo panel ma go
   * WYPISAĆ („próg CLOCK_DRIFT: 120 s"), a nie znać: druga kopia progu w panelu
   * rozjechałaby się z regułą przy pierwszym strojeniu tolerancji.
   */
  driftThresholdMs: number;
}

/**
 * Strona rejestru. Kursor KEYSET po `(received_at, uuid)`, nigdy `OFFSET`: `events`
 * jest najszybciej rosnącą tabelą w systemie i rośnie W TRAKCIE przeglądania, bo
 * telefony dosyłają outboxy. Offset gubiłby wiersze między stronami - a administrator
 * szukający konkretnego zdarzenia mógłby nie zobaczyć akurat tego, którego szuka.
 *
 * `nextCursor === null` znaczy „to był koniec", a nie „spróbuj jeszcze raz".
 */
export interface AdminEventsPage {
  items: AdminEventEntry[];
  nextCursor: string | null;
  /**
   * **`null` = „nie liczyliśmy", a nie „zero".** Liczniki są własnością ZAPYTANIA,
   * nie strony: nie zmieniają się przy przewijaniu, więc serwer płaci za nie raz, przy
   * pierwszej stronie (bez kursora), a strony kursorowe oddają `null`. Klient niesie
   * wartości z pierwszej strony. Sklejenie `null` z zerem kazałoby ekranowi twierdzić,
   * że w całym rejestrze nie ma ani jednego zdarzenia - dokładnie wtedy, gdy nic o tym
   * nie wie. Uzasadnienie kosztu: `infrastructure/pg/admin/eventsReadRepo.ts`.
   */
  counts: AdminEventCounts | null;
}
