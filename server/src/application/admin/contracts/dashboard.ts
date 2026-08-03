/**
 * UZ Aero (serwer) — KONTRAKT pulpitu (`A01`, `A01a`).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować `@uzaero/domain`
 * oraz siebie nawzajem (pilnuje `test/architecture.test.ts`).
 *
 * ══ PULPIT AGREGUJE, NIE LICZY DRUGI RAZ ══
 * Ten kontrakt jest w większości ZŁOŻONY z kontraktów innych ekranów i to jest jego
 * najważniejsza własność. „Flaga otwarta" znaczy na pulpicie dokładnie to samo, co
 * w skrzynce `A03`, bo jest tym samym `AdminFlagListItem` z tego samego zapytania;
 * stan karty dnia to `AdminExportCounts` z monitora `A05`; wiersz floty to
 * `AdminAircraftListItem` z `A07`. Gdyby pulpit miał własne definicje, pierwszy rozjazd
 * („pulpit mówi 7 flag, skrzynka pokazuje 6") podważyłby OBA ekrany naraz — a pulpit
 * jest jedynym ekranem panelu z gwarantowaną publicznością, więc to on nadaje ton
 * zaufaniu do reszty.
 *
 * ══ CZEGO W TYM KONTRAKCIE ŚWIADOMIE NIE MA ══
 *  1. **Zrzutów i skoczków w „Dziś w liczbach"** (mockup: „6 · 41"). `DropSummary` jest
 *     w `SessionState`, ale NIE w projekcji `sessions` — nie ma takich kolumn. Podanie
 *     tej liczby wymagałoby albo migracji projekcji (zmiana ścieżki ingestu telefonu),
 *     albo `projectSession` na każdej dzisiejszej sesji, czyli drugiego powodu czytania
 *     strumieni na pulpicie. Panel pokazuje „—" i mówi dlaczego.
 *  2. **Paliwa dolanego w podsumowaniu dnia** (mockup A01a: „214 L"). Ta sama przyczyna:
 *     `sessions` ma `fuel_start_l`/`fuel_end_l`/`fuel_last_l`, a `addedL` jest sumą
 *     zdarzeń `refuel` liczoną przez projekcję w pamięci.
 *  3. **Werdyktu „cisza spodziewana / podejrzana"** (A01a). Serwer podaje FAKTY, z których
 *     werdykt wynika (wiek ostatniego zdarzenia, otwarte claimy, dni bez `day_close`,
 *     stan kart); samo zdanie składa panel w module czystym z testem. Powód: werdykt
 *     jest wyłącznie kolorem banera — nie wystawia flagi, nie zmienia żadnej liczby
 *     i nie ma prawa różnić się między klientami, bo jest jeden.
 */

import type { EventType } from '@uzaero/domain';

import type { AdminExportCounts, AdminExportListItem } from './exports.ts';
import type { AdminFlagListItem } from './flags.ts';
import type { AdminAircraftListItem } from './fleet.ts';
import type { AdminSessionListItem } from './sessions.ts';

/**
 * Stan SILNIKA jednostki z otwartą sesją — policzony `projectSession` na strumieniu
 * TEJ sesji.
 *
 * ══ DLACZEGO TU ROBIMY TO, CZEGO `A02` I `A07` ODMÓWIŁY ══
 * Lista dni i lista floty pomijały plakietkę „W locie", bo projekcja `sessions` nie
 * niesie stanu silnika, a wczytanie strumienia dla każdego wiersza NIEOGRANICZONEJ
 * listy to N pełnych strumieni na stronę. Pulpit jest innym pytaniem: pokazuje flotę
 * klubu, czyli kilka jednostek, i czyta strumień WYŁĄCZNIE tych, które mają otwartą
 * sesję. Strumień jednej sesji to jeden dzień pracy (dziesiątki zdarzeń), więc koszt
 * jest ograniczony liczbą samolotów w ruchu, a nie długością historii.
 *
 * Konsekwencja jest twarda i celowa: `engine == null` znaczy „ta jednostka nie ma
 * otwartej sesji", NIGDY „nie wiemy, czy silnik pracuje". Stanu „nie wiemy" na tym polu
 * po prostu nie ma — jest za to wiek ostatniego syncu (`AdminAircraftListItem.lastEventAt`),
 * który mówi, ile ta wiedza jest warta.
 */
export interface AdminEngineState {
  /** Sesja, z której policzono stan — wiersz pulpitu prowadzi wprost na jej kartę. */
  sessionUuid: string;
  /** `engine_start` bez `engine_stop` — silnik pracuje. */
  engineRunning: boolean;
  /** Między `takeoff` a `landing` — samolot jest w powietrzu. */
  inFlight: boolean;
  /** Numer bieżącego (albo ostatniego) lotu dnia — podpis „lot 4". */
  flightsCount: number;
  /** Czas OTWARTEGO startu (epoch ms UTC); `null` = nie ma lotu w toku. */
  openTakeoffAt: number | null;
  /**
   * Koniec ostatniego ZAMKNIĘTEGO cyklu silnika (epoch ms UTC) — podpis „silnik OFF
   * 14:04". `null` = silnik nigdy nie był zatrzymany w tej sesji (albo wciąż pracuje).
   */
  engineStoppedAt: number | null;
  /** Czas ostatniego zdarzenia W STRUMIENIU (GPS przed zegarem telefonu). */
  lastEventAt: number | null;
  /** Meldunek z `preflight_confirm` (epoch ms UTC); `null` = sesja bez preflightu. */
  dutyStart: number | null;
  /** Lotnisko odlotu z preflightu — podpis wiersza floty („EPMO"). */
  departureIcao: string | null;
  /** Drugi pilot dnia; `null` = lot pojedynczy. Nazwisko `null` = konta już nie ma. */
  dualId: string | null;
  dualName: string | null;
  /**
   * Ile zdarzeń tej sesji jest w rejestrze. `0` przy otwartym claimie to stan
   * PODEJRZANY — ktoś zajął samolot i od tego czasu nie dotarło nic (warunek „cisza
   * podejrzana" z `A01a`). Panel nie ma jak tego policzyć inaczej.
   */
  eventCount: number;
}

/** Jednostka floty na pulpicie: wiersz `A07` plus stan silnika, gdy dzień trwa. */
export interface AdminDashboardAircraft {
  /** Ten sam wiersz, co na ekranie floty — konfiguracja, claim, ostatnie odczyty. */
  aircraft: AdminAircraftListItem;
  /** `null` = jednostka nie ma otwartej sesji (wolna albo poza służbą). */
  engine: AdminEngineState | null;
}

/**
 * Liczniki kafli. Każdy pochodzi z tego samego zapytania, co ekran docelowy — kafel
 * jest skrótem do listy, więc jego liczba musi być obietnicą „tyle wierszy tam
 * zobaczysz".
 */
export interface AdminDashboardCounts {
  /** Cała flota w rejestrze (kafel „Samoloty w ruchu" pokazuje `claimed / total`). */
  aircraftTotal: number;
  aircraftActive: number;
  /** Jednostki z OTWARTĄ sesją — ta sama liczba, co chip „Z claimem" na `A07`. */
  aircraftClaimed: number;
  /** Dni bez `day_close` — to samo, co `#/dni?stan=open`. */
  openDays: number;
  /** Sprawy o statusie `open` — to samo, co domyślna skrzynka `#/flagi`. */
  openFlags: number;
  /** Stany kart dziennych — kontrakt monitora `A05`, bez zawężenia po stanie. */
  exports: AdminExportCounts;
}

/**
 * Kolejka „Wymaga uwagi" jako TRZY ŹRÓDŁA, nie jedna spłaszczona lista.
 *
 * Spłaszczenie wymagałoby czwartej definicji „sprawy" — czyli dokładnie tego, przed
 * czym broni nagłówek tego pliku. Trzy listy to trzy istniejące kontrakty w stanie
 * nietkniętym; złożenie ich w jeden porządek (najstarsze na górze, blokujące arkusz
 * przodem) jest decyzją O TREŚCI EKRANU i mieszka w module czystym panelu z testem.
 *
 * Wszystkie trzy są PRZYCIĘTE limitem — pulpit pokazuje kilka najpilniejszych spraw,
 * a pełne listy są pod kaflami. Ile ich jest naprawdę, mówi `counts`.
 */
export interface AdminDashboardAttention {
  /** Otwarte flagi w porządku skrzynki `A03`: blokujące eksport → najstarsze. */
  flags: AdminFlagListItem[];
  /**
   * Dni zamknięte i eksportowalne, których karta NIE POWSTAŁA (`state: 'missing'`).
   * Jedyna droga do tego stanu to awaria eksportu — nieudany zapis nie zostawia
   * wiersza w żadnej tabeli, więc ten jest jedynym miejscem, w którym go widać.
   */
  failedExports: AdminExportListItem[];
  /**
   * Dni bez `day_close` starsze niż `correctionWindowMs`, od najstarszego.
   *
   * Próg nie jest wybrany „na oko": to ta sama doba, po której pilot traci prawo
   * samodzielnej korekty zamkniętego dnia. Dzień otwarty od dwóch godzin to normalna
   * praca, dzień otwarty od wczoraj to zadanie dla administratora.
   */
  staleOpenDays: AdminSessionListItem[];
}

/**
 * Histogram „Napływ zdarzeń" — liczony po `events.received_at`, czyli po ZEGARZE
 * SERWERA.
 *
 * To jest jedyna oś, na której ten wykres ma sens. Czas zdarzenia (`device_time`)
 * odpowiada na pytanie „kiedy to się stało", a wykres pyta „kiedy się o tym
 * dowiedzieliśmy" — pusty słupek znaczy „nic nie przyszło", nigdy „nikt nie latał".
 * Paczka z zaległego outboxu ląduje więc w słupku GODZINY PRZYJĘCIA i tak ma być:
 * mockup opisuje dokładnie ten przypadek („SP-KLM leciał poza zasięgiem i dosłał
 * paczkę o 10:14").
 */
export interface AdminDashboardInflow {
  /** Początek pierwszego wiadra (epoch ms UTC) — dolny brzeg okna, domknięty. */
  fromMs: number;
  /** Koniec ostatniego wiadra (epoch ms UTC) — górny brzeg okna, OTWARTY. */
  toMs: number;
  bucketMs: number;
  /** Liczba zdarzeń przyjętych w każdym wiadrze, od najstarszego. Zawsze pełna tablica. */
  buckets: number[];
}

/**
 * Jedno zdarzenie w karcie „Ostatnio przyjęte".
 *
 * Bez `payload` i to jest decyzja, nie oszczędność. Mockup pisze w tym miejscu rzeczy
 * typu „22 → 48 L (dolano 26 L)", czyli treść, którą panel składa z payloadu na OSI
 * KARTY DNIA (`dzienTimeline.ts`). Powtórzenie tego tutaj oznaczałoby drugi mapper
 * payloadów — a pulpit odpowiada na pytanie „czy coś do nas dociera", nie „co dokładnie
 * przyszło". Od szczegółu jest przejście w głąb.
 */
export interface AdminRecentEvent {
  uuid: string;
  sessionUuid: string;
  aircraftId: string;
  /** `null` = samolotu nie ma w rejestrze floty; zdarzenie zostaje widoczne. */
  reg: string | null;
  type: EventType;
  /** Czas ZDARZENIA (GPS przed zegarem telefonu), epoch ms UTC. */
  eventTime: number;
  /** Kiedy SERWER je przyjął (ISO 8601 UTC) — oś porządku tej listy. */
  receivedAt: string;
  picId: string;
  picCode: string | null;
  picName: string | null;
}

/**
 * Sumy JEDNEGO dnia UTC — „Dziś w liczbach" (`A01`) i „Ostatni dzień lotny" (`A01a`).
 *
 * Liczone z kolumn projekcji `sessions`, nigdy ze strumieni: to jest agregat listy dni,
 * więc obowiązuje go ta sama reguła, co `A02` („listy nie wołają `projectSession`").
 */
export interface AdminDayTotals {
  /** Dzień UTC `YYYY-MM-DD`. */
  day: string;
  /** Granice doby UTC (epoch ms), obustronnie domknięte — wprost do filtra `#/dni`. */
  fromMs: number;
  toMs: number;
  /** Dni lotne z duty startem w tej dobie. */
  sessions: number;
  /** Ile RÓŻNYCH jednostek latało. */
  aircraft: number;
  flights: number;
  blockMs: number;
  /**
   * Zdarzenia PRZYJĘTE w tej dobie (`received_at`) — nie „zdarzenia z tego dnia".
   * Rozróżnienie jest tu istotne: paczka z 30 lipca przyjęta 31 lipca liczy się do
   * 31 lipca, tak samo jak na wykresie napływu.
   */
  eventsAccepted: number;
}

/**
 * Pulpit w jednej odpowiedzi.
 *
 * Jedna trasa, a nie sześć, i to wynika z `docs/architektura-panelu-frontend.md` §4.3:
 * `['dashboard']` unieważnia KAŻDA mutacja panelu. Sześć kluczy do unieważnienia po
 * każdym zapisie zamieniłoby regułę „liczniki nie kłamią po akcji" w listę, o której
 * ktoś kiedyś zapomni.
 */
export interface AdminDashboard {
  /** Chwila zbudowania odpowiedzi wg zegara SERWERA (ISO 8601 UTC). */
  at: string;
  /**
   * Długość okna samodzielnej korekty pilota (ms) — z `@uzaero/domain`.
   *
   * Jedzie z serwera, bo panelowi wolno importować z domeny wyłącznie typy, a ta
   * liczba rozstrzyga treść dwóch rzeczy naraz: progu „dzień otwarty za długo"
   * i zdania w kolejce uwagi. Wpisana w panelu byłaby drugą kopią reguły.
   */
  correctionWindowMs: number;
  counts: AdminDashboardCounts;
  /** Cała flota, w porządku listy `A07` (wyłączone na końcu, dalej po rejestracji). */
  fleet: AdminDashboardAircraft[];
  attention: AdminDashboardAttention;
  inflow: AdminDashboardInflow;
  /** Ostatnio przyjęte zdarzenia, od najnowszego. Pusta lista = pusty rejestr. */
  recent: AdminRecentEvent[];
  today: AdminDayTotals;
  /**
   * Doba UTC OSTATNIEGO dnia lotnego — `null`, gdy w projekcji nie ma ani jednej sesji.
   *
   * Bywa równa `today` (ktoś latał dziś) i to nie jest usterka: pulpit w wariancie
   * z ruchem pokazuje „Dziś w liczbach", a w ciszy — ten sam kształt danych pod
   * pytaniem „czym skończył się ostatni strumień".
   */
  lastFlyingDay: AdminDayTotals | null;
}
