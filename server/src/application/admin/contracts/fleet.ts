/**
 * UZ Aero (serwer) - KONTRAKT floty (`A07`, `A07a`).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` (pilnuje `test/architecture.test.ts`). `MhFormat` i `ServiceStatus`
 * są tam - flota jest wejściem REGUŁ domenowych, więc jej słowniki mieszkają
 * w domenie, a nie w kopii jak przy rolach.
 *
 * ══ DLACZEGO SERWER PODAJE ROZWIĄZANĄ TOLERANCJĘ ══
 * `fuelToleranceL` nie jest stałą: to `max(10 L, 5% pojemności)`
 * (`packages/domain/src/rules/tolerances.ts`). Panel nie ma prawa jej policzyć - wolno
 * mu importować z domeny wyłącznie TYPY (`docs/architektura-panelu-frontend.md` §5.1),
 * a zakaz istnieje po to, żeby jedynym źródłem liczby była odpowiedź serwera. Przez
 * cztery przekroje kończyło się to pomijaniem kolumn i kafli („próg flagi" nie ma jak
 * powstać we froncie). Od tego kontraktu liczba jedzie z serwera przy KAŻDYM samolocie,
 * a `AircraftToleranceDto` odpowiada na to samo pytanie dla pojemności, która jeszcze
 * nie została zapisana - czyli dla wartości wpisywanej w formularzu `A07a`.
 *
 * ══ CZEGO W TYM KONTRAKCIE ŚWIADOMIE NIE MA ══
 *  1. **`disabledAt` i powodu wyłączenia** („od 19 JUN 2026 · remont" z mockupu A07).
 *     Tabela `aircraft` ma `service_status` i `updated_at`, i nic poza tym. `updated_at`
 *     odpowiada na pytanie „kiedy ruszono wiersz", a nie „od kiedy samolot stoi" -
 *     podanie go pod etykietą „od" byłoby inną wielkością pod tą samą nazwą. Kiedy
 *     i przez kogo wyłączono, wie dziennik audytu (`aircraft.disable`).
 *  2. **Godzin nalotu i statystyk samolotu.** To jest ekran KONFIGURACJI; nalot liczy
 *     `A10` z projekcji sesji i ma własną trasę.
 */

import type { MhFormat, ServiceStatus } from '@uzaero/domain';

/**
 * Kto trzyma samolot TERAZ - sesja bez `day_close`.
 *
 * Świadomie NIE nazywamy tego „w locie": projekcja `sessions` nie niesie stanu silnika
 * (ta sama granica, co na liście dni `A02`). Claim znaczy „ktoś zajął jednostkę na
 * dziś", a czy w tej chwili kołuje, czy stoi na płycie - tego serwer nie wie.
 */
export interface AdminAircraftClaim {
  sessionUuid: string;
  picId: string;
  /** `null` = konta nie ma już w `pilots`; claim zostaje widoczny z identyfikatorem. */
  picCode: string | null;
  picName: string | null;
  /** Chwila PRZEJĘCIA samolotu (`session_claim`, epoch ms UTC) - od kiedy maszyna zajęta. */
  since: number | null;
}

/**
 * Ostatni znany odczyt liczników - podpowiedź, nie prawda.
 *
 * Mockup A07 mówi to wprost: „Liczniki fizyczne wygrywają. Wartości z tej tabeli są
 * podpowiedzią dla pilota na preflight, nie prawdą". Dlatego `at` jedzie razem
 * z wartością: odczyt bez wieku jest twierdzeniem o teraźniejszości, którym nie jest.
 */
export interface AdminAircraftReading {
  /** Stan licznika motogodzin (godziny dziesiętne - panel formatuje wg `mhFormat`). */
  mh: number;
  fuelL: number;
  /**
   * Kiedy powstał ten odczyt (epoch ms UTC).
   *
   * Przy `source: 'initial'` to jest chwila ZAPISU W PANELU (`aircraft.updated_at`),
   * a nie chwila pomiaru - i tak też ma o niej mówić ekran (issue #66).
   */
  at: number;
  /** `null` przy `source: 'initial'` - stanu początkowego nie przekazał żaden pilot. */
  byPilotId: string | null;
  byPilotName: string | null;
  /**
   * Ostatni znany stan OLEJU (L): pomiar z bagnetu + dolewki zapisane po nim - liczy
   * SERWER z `Handover.oil` (ta sama zasada, co `oilAfterL` na liście operacji: panel
   * formatuje, nie liczy). Zużycia od pomiaru ta liczba NIE odejmuje, bo oleju po
   * locie się nie mierzy (issue #60) - dokładniejszej odpowiedzi rejestr nie ma.
   *
   * `null` = dziennik nie zna ani jednego pomiaru, a w panelu nie wpisano stanu
   * początkowego oleju. Karta samolotu pokazuje wtedy kreskę (uwagi do issue #66:
   * pola „Aktualny stan" przy edycji są do odczytu i wynikają z zapisów w dzienniku).
   */
  oilL: number | null;
  /**
   * Ile z `oilL` to dolewki zapisane PO pomiarze - dana do PODPISU pola („pomiar
   * + dolewki 2,0 L"), żeby suma nie udawała odczytu z bagnetu. `null` razem z `oilL`.
   */
  oilAddedSinceL: number | null;
  /**
   * Kiedy zmierzono olej (epoch ms UTC) - osobno od `at`, bo interwał olejowy biegnie
   * pomiar→pomiar przez wiele operacji i bywa dużo starszy niż odczyt paliwa/MH.
   * `null` razem z `oilL`.
   */
  oilAt: number | null;
  /**
   * Skąd wzięta. `handover` = z zamkniętego dnia (świadome przekazanie);
   * `open_session` = z dnia, który jeszcze trwa (np. po tankowaniu);
   * `initial` = stan początkowy wpisany w panelu, bo maszyna jeszcze nie latała
   * (issue #66). Rozróżnienie jest treścią podpisu w tabeli („przekazanie · 1 dzień"
   * vs „sesja otwarta" vs „stan początkowy"), a panel nie ma jak go odgadnąć - regułę
   * wyboru zna `application/common/aircraftStateView.ts`.
   */
  source: 'handover' | 'open_session' | 'initial';
}

/** Jedna jednostka na liście `A07`. */
export interface AdminAircraftListItem {
  id: string;
  /** Znaki na kadłubie - UNIKALNE w całym systemie. Etykieta, nie klucz zdarzeń. */
  reg: string;
  type: string;
  year: number | null;
  capacityL: number;
  /**
   * Efektywna tolerancja flagi `FUEL_MISMATCH` (L) dla TEJ pojemności - policzona
   * przez serwer funkcją domeny. Patrz nagłówek pliku.
   */
  fuelToleranceL: number;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: ServiceStatus;
  /** Konfiguracja oleju (issue #60); `null` = nieskonfigurowane - moduł milczy. */
  oilMinL: number | null;
  oilCapacityL: number | null;
  oilNormLPerH: number | null;
  /**
   * Średnie spalanie z instrukcji użytkowania (L na godzinę PRACY SILNIKA, issue #66);
   * `null` = nie wpisano.
   */
  fuelNormLPerH: number | null;
  /**
   * STAN POCZĄTKOWY jednostki (issue #66) - co pokazywały przyrządy, gdy maszyna
   * trafiła do UZ Aero. Zerowe ogniwo łańcucha: podpowiedź dla PIERWSZEGO pilota,
   * nieużywana od pierwszej zdanej sesji. Panel poznaje po `reading.source`, czy
   * jeszcze cokolwiek znaczy.
   */
  initialMh: number | null;
  initialFuelL: number | null;
  initialOilL: number | null;
  /** ISO 8601 UTC - ostatnia zmiana wiersza konfiguracji (nie: ostatni lot). */
  updatedAt: string;

  claim: AdminAircraftClaim | null;
  reading: AdminAircraftReading | null;
  /**
   * ISO 8601 UTC - kiedy serwer ostatnio przyjął ZDARZENIE tego samolotu.
   *
   * To jest „ostatni sync" z mockupu i jedyna uczciwa miara świeżości kolumn stanu:
   * odczyt sprzed doby przy syncu sprzed trzech minut znaczy co innego niż odczyt
   * sprzed doby przy telefonie, który milczy od wczoraj. `null` = ten samolot nie ma
   * ani jednego zdarzenia w rejestrze („brak danych", nie „zero").
   */
  lastEventAt: string | null;

  /** Ile sesji tego samolotu nie ma `day_close` - blokada wyłączenia ze służby. */
  openSessions: number;
  /**
   * Ile OTWARTYCH flag dotyczy tej jednostki.
   *
   * Karta „Skutki zmiany" (`A07a`) pokazuje tę liczbę z adnotacją „bez przeliczenia”:
   * flagi wystawione przed zmianą pojemności zachowują STARY próg, bo rejestr jest
   * append-only i panel go nie przepisuje. Liczba jest tu po to, żeby administrator
   * wiedział, ilu spraw ta zmiana NIE dotknie.
   */
  openFlags: number;
}

/** Liczniki kafli `A07` - po CAŁEJ flocie, nie po bieżącym zawężeniu listy. */
export interface AdminFleetCounts {
  total: number;
  active: number;
  disabled: number;
  /** Jednostki z otwartą sesją - „Z aktywnym claimem" w kaflu. */
  claimed: number;
}

/**
 * Lista floty. **Bez kursora i bez `limit`** - klub ma kilka jednostek, a lista
 * referencyjna, którą trzeba stronicować, nie nadaje się na słownik do filtra listy
 * dni (`A02`). To ta sama decyzja, co przy kontach pilotów.
 */
export interface AdminFleetPage {
  items: AdminAircraftListItem[];
  counts: AdminFleetCounts;
  /**
   * Liczniki CHIPÓW - te same cztery zawężenia, ale policzone w bieżącym WYSZUKIWANIU.
   *
   * Osobne od `counts`, bo odpowiadają na inne pytanie. Kafel mówi o FLOCIE („W służbie
   * 4 / 5") i ma się nie ruszać przy wpisywaniu w wyszukiwarkę; chip z liczbą jest
   * obietnicą „tyle wierszy zobaczysz po kliknięciu". Przy kontach pilotów sklejenie
   * tych dwóch liczb było realną usterką: chip „Nieaktywni" pokazywał 2 i po kliknięciu
   * dawał pustą tabelę. Bez wyszukiwania `scopes` zgadza się z `counts`.
   */
  scopes: AdminFleetCounts;
}

/**
 * Tolerancja rozwiązana dla pojemności, która NIE MUSI być zapisana w bazie.
 *
 * Obsługuje dwa pytania jedną odpowiedzią: „ile wyjdzie, jeśli wpiszę 1100" (formularz
 * `A07a`, karta „Skutki zmiany") oraz „jaki próg obowiązuje ten samolot" (`A02a`/`A02b`,
 * gdzie panel zna `aircraftId`, a nie pojemność). Dzięki temu żaden ekran nie musi
 * dokładać sobie arytmetyki, której panelowi zakazano.
 */
export interface AircraftToleranceDto {
  /**
   * Pojemność, DLA KTÓREJ policzono próg - czyli echo pytania, nie stan bazy.
   *
   * `null` znaczy dokładnie jedno: **zapytanie nie podało pojemności ani samolotu**,
   * więc odpowiedź opisuje „pojemność nieznaną" i próg spada do podłogi 10 L. NIE
   * znaczy „samolot bez skonfigurowanej pojemności": takiego wiersza nie ma, bo
   * `aircraft.capacity_l` jest `NOT NULL`, a zapis pojemności ≤ 0 kończy się odmową
   * `capacity_not_positive`. Sprostowane 2026-08-01 - to samo dotyczy trasy, która do
   * tej pory oddawała `0` dla pustego parametru `?capacityL=`; dziś odmawia tak samo
   * jak zapis.
   */
  capacityL: number | null;
  fuelToleranceL: number;
}

/** Odpowiedź zapisu konfiguracji - nowy stan wiersza listy. */
export interface AircraftChangeDto {
  aircraft: AdminAircraftListItem;
}
