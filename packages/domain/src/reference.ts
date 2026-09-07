/**
 * UZ Aero - dane referencyjne (docs/_main.md.txt §5.2, §5.4, §4.8).
 *
 * Dane „wolnozmienne" z serwera: lista samolotów z konfiguracją i lista pilotów.
 * Każdy rekord niesie `fetchedAt` - UI dokleja adnotację wieku („· z cache · sync
 * 21 JUN 17:30", §4.8, §6).
 *
 * DLACZEGO W DOMENIE, a nie w warstwie danych: konfiguracja samolotu (`capacityL`,
 * `mhFormat`, `dualRequired`) jest wejściem REGUŁ domenowych - bez pojemności zbiorników
 * nie da się sprawdzić inwariantu „paliwo po tankowaniu ≤ pojemność" (§3.4). To czyste
 * typy danych, zero zależności od magazynu.
 *
 * To NIE jest źródło prawdy sesji (tym jest strumień zdarzeń) - to podpowiedzi
 * (§4.1 pkt 5: liczniki fizyczne > dane z serwera).
 * Sekrety (JWT, PIN) mieszkają w expo-secure-store, nie tutaj (§5.2).
 */

import type { EpochMillis } from './time';
import type { FuelMhReading, MhFormat } from './events';
import type { CounterKind } from './consumption/mhModel';

// Format licznika MH należy do konfiguracji samolotu (§5.4), więc re-eksportujemy go
// przez powierzchnię `reference` - konsumenci cache'u nie muszą sięgać do `events`.
export type { MhFormat };

/** Dostępność samolotu na liście wyboru (§5.4). */
export type ServiceStatus = 'active' | 'disabled';

/**
 * Pojedyncze ogniwo historii, która doprowadziła do przekazanych wartości.
 *
 * Mockup 02a pokazuje ją jako oś czasu („Tankowanie · +45 L · w zbiorniku 185 L",
 * „J. Kowalski latał 1h 30min"). Sens jest praktyczny: pilot patrzy na paliwomierz
 * i widzi mniej, niż mówi przekazanie - historia odpowiada, czy to błąd odczytu,
 * czy po prostu ktoś jeszcze poleciał.
 *
 * Trzymamy **dane, nie zdania** - formatowanie („śr. 23 L/h") należy do UI.
 * Wypełnia to serwer przy `GET /reference` (§4.6); offline pole zwyczajnie jest puste.
 */
export interface HandoverTrailEntry {
  /** `claim` = przejęcie samolotu przez poprzednika (do 2026-08-11: `duty_start`). */
  kind: 'refuel' | 'flight' | 'claim';
  at: EpochMillis;
  /** Kto - dla `refuel` bywa `null` (tankowanie techniczne). */
  pilotId: string | null;
  /** Zmiana paliwa: dodatnia przy tankowaniu, `null` gdy nieznana. */
  fuelDeltaL: number | null;
  /** Stan paliwa PO zdarzeniu (L). */
  fuelAfterL: number | null;
  /** Stan licznika motogodzin PO zdarzeniu (godziny dziesiętne). */
  mhAfter: number | null;
  /** Czas trwania lotu (ms) - dla `flight`. */
  durationMs: number | null;
}

/**
 * Ostatni znany POMIAR OLEJU samolotu (issue #60) - materiał podpowiedzi na kroku
 * liczników. Interwał olejowy biegnie pomiar→pomiar przez wiele sesji (zdanie samolotu
 * oleju nie mierzy - bagnet tuż po locie kłamie), więc przekazanie potrafi nieść pomiar
 * sprzed dowolnie wielu przejęć: kotwicą rachunku oczekiwania jest MH przy pomiarze,
 * a dolewki zapisane PO nim wchodzą do rachunku sumą.
 */
export interface OilHandover {
  /** Pomiar z bagnetu (L). */
  levelL: number;
  /** Odczyt MH przy tym pomiarze - kotwica rachunku; `null` gdy nieznany. */
  atMh: number | null;
  /** Kiedy zmierzono (UTC). */
  at: EpochMillis;
  byPilotId: string | null;
  /** Suma dolewek zapisanych po pomiarze (kolejne przejęcia bez pomiaru). */
  addedSinceL: number;
}

/** Przekazanie od poprzednika (JSON w kolumnie `handover`, §5.2). */
export interface Handover {
  reading: FuelMhReading;
  /**
   * Kto przekazał (pilot id).
   *
   * `null` = **NIKT** - to jest STAN POCZĄTKOWY jednostki wpisany w panelu (issue #66),
   * czyli zerowe ogniwo łańcucha, od którego zaczyna się pierwszy lot maszyny w UZ Aero.
   * Ekran musi to rozróżnić: „przekazał J. Kowalski" przy liczbie, której nie przekazał
   * żaden pilot, jest zdaniem nieprawdziwym w miejscu, gdzie zaufanie do liczb jest całą
   * treścią. Nullowalność ma tu ten sam sens, co w `HandoverTrailEntry.pilotId`
   * (tankowanie techniczne) i w `OilHandover.byPilotId`.
   */
  byPilotId: string | null;
  /** Kiedy powstało przekazanie (UTC). */
  at: EpochMillis;
  /**
   * SKĄD wzięło się przekazanie, gdy nie przekazał go żaden pilot (`byPilotId: null`):
   *  • `initial` - stan początkowy jednostki wpisany w panelu (issue #66);
   *  • `admin`   - odczyt wpisany ręką administratora w karcie samolotu (issue #81):
   *    nadrzędny stan licznika, paliwa i oleju z komentarzem, który wyprzedził ostatnie
   *    zdanie w łańcuchu MH. Ekran 02A mówi wtedy „odczyty wpisał administrator",
   *    a nie „to pierwszy lot tej maszyny".
   * Brak pola przy `byPilotId: null` = serwer sprzed issue #81, czyli stan początkowy.
   */
  origin?: 'initial' | 'admin';
  /** Historia prowadząca do tych wartości, od najstarszej. Puste = serwer jej nie podał. */
  trail?: HandoverTrailEntry[];
  /**
   * Ostatni pomiar oleju (issue #60); brak pola = serwer sprzed modułu oleju,
   * `null` = serwer nie zna żadnego pomiaru. Wypełnia Etap D.
   */
  oil?: OilHandover | null;
}

/**
 * Norma zużycia policzona z historii tego samolotu (ekran `A10a` po stronie panelu).
 *
 * ══ CZYM TO NIE JEST ══
 * Nie jest KONFIGURACJĄ: nikt tego nie wpisuje i nie da się tego edytować. Wartości
 * uczą się z odczytów paliwomierza i czasów z rejestru, więc zmieniają się razem
 * z danymi. Nie jest też dokumentacją samolotu - to estymata statystyczna, która ma
 * powiedzieć „czy dzisiejsze 16 L/h to normalne dla tej maszyny", a nie zastąpić
 * instrukcję użytkowania.
 *
 * `null` na całym polu (`ReferenceAircraft.consumption`) znaczy „model poniżej progu
 * publikacji" - ekran NIE POKAZUJE wtedy wiersza porównania. Zero udające normę byłoby
 * gorsze od jego braku (§6: nigdy cicha kreska tam, gdzie pilot mógłby podejrzewać błąd).
 *
 * ══ DLACZEGO PASMO, A NIE PRZEDZIAŁ UFNOŚCI ══
 * Panel pyta „jak dokładnie znamy stawkę" - na to odpowiada przedział z modelu.
 * Ekran tankowania pyta „czy dzisiejszy wynik mieści się w tym, co ta maszyna zwykle
 * pokazuje" - a na to odpowiada ROZRZUT zaobserwowanych interwałów. Przy stu równaniach
 * przedział ufności jest wąski i werdykt „poza normą" zapalałby się na zupełnie
 * normalnej zmienności między lotami. To są dwie różne liczby i nie należy ich
 * ujednolicać.
 */
export interface ConsumptionNorm {
  /** Szerokość okna, z którego policzono normę (dni). */
  windowDays: number;
  /** Dolna i górna granica pasma typowego zużycia na godzinę pracy silnika (10. i 90. centyl). */
  blockLPerHLow: number;
  blockLPerHHigh: number;
  /** Środek pasma - iloraz sum (Σ litrów / Σ godzin silnika), nigdy średnia ilorazów. */
  blockLPerH: number;
  /** Stawka W LOCIE z modelu fazowego (L/h); `null`, gdy model nie rozdzielił faz. */
  airLPerH: number | null;
  /**
   * Stawka NA ZIEMI (L/h) - silnik pracuje, samolot nie leci; `null` razem z `airLPerH`.
   *
   * Bez niej normy nie da się odnieść do KONKRETNEJ sesji, a tylko do średniej mieszanki
   * faz z okna - i dokładnie na to skarżył się issue #38 pkt 6. Para (ziemia, powietrze)
   * jest minimalnym zestawem, który telefon policzy zawsze: czas lotu i czas blokowy zna
   * z własnej projekcji, bez śladu GPS i bez sieci.
   */
  groundLPerH: number | null;
  /** Paliwo na jeden wzlot (L); `null`, gdy w oknie nie było startów. */
  litersPerFlight: number | null;
  /**
   * Rozrzut sesji wokół przewidywania z pary stawek: 10. i 90. centyl ilorazu fakt/model.
   * `null`, gdy stawek nie ma albo nie było z czego liczyć ilorazów.
   */
  fuelRatioLow: number | null;
  fuelRatioHigh: number | null;
  /** Przeliczniki motogodzin; `null` = model MH poniżej progu publikacji. */
  mh: MhNorm | null;
  /** Ile interwałów i ile godzin silnika stoi za tymi liczbami - podstawa zaufania. */
  intervals: number;
  engineMs: number;
  /** Kiedy model policzono - NIE to samo, co `fetchedAt` rekordu. */
  computedAt: EpochMillis;
}

/**
 * Przeliczniki motogodzin dla APLIKACJI PILOTA (issue #38 pkt 4).
 *
 * ══ PO CO TO JEST ══
 * Przyrost licznika NIE równa się czasowi blokowemu i nie ma prawa się równać
 * (`consumption/mhModel.ts`): obrotomierz na ziemi przyrasta wolniej niż zegar. Do
 * issue #38 ekran 10 twierdził coś przeciwnego - pisał „Δ sesji (= czas blokowy)" -
 * więc pilot, którego licznik zachował się poprawnie, widział rozjazd bez wyjaśnienia.
 * Mając te dwie liczby, ekran umie powiedzieć, ILE licznik POWINIEN był pokazać.
 *
 * Panel dostaje cały model (`MhModel`: przedziały, reszty, wiersze per sesja); telefon
 * dostaje tyle, ile trzeba do jednego zdania - ta sama zasada, co przy `ConsumptionNorm`.
 */
export interface MhNorm {
  /** Charakter licznika odczytany z danych - `unknown`, gdy dane nie rozstrzygają. */
  kind: CounterKind;
  /** Motogodziny na godzinę zegara W LOCIE. */
  perFlightHour: number;
  /** Motogodziny na godzinę zegara NA ZIEMI (silnik pracuje, samolot nie leci). */
  perGroundHour: number;
  /** Rozrzut sesji wokół przewidywania (10. i 90. centyl ilorazu fakt/model). */
  ratioLow: number | null;
  ratioHigh: number | null;
  /** Ile zdanych sesji stoi za przelicznikami. */
  sessions: number;
}

/**
 * Samolot + konfiguracja + najświeższy znany stan (§5.2 `reference_aircraft`).
 * `claim*` i `handover` bywają nieświeże - traktujemy je przez pryzmat `fetchedAt`.
 */
export interface ReferenceAircraft {
  id: string;
  reg: string;
  type: string;
  year: number | null;
  /** Pojemność zbiorników (L) - skala wskaźników paliwa i walidacje (§5.4). */
  capacityL: number;
  /** Format odczytu MH (§5.4). */
  mhFormat: MhFormat;
  /** Czy wymagany drugi pilot (np. An-2) - blokuje preflight bez Duala (§5.4). */
  dualRequired: boolean;
  serviceStatus: ServiceStatus;
  /**
   * Średnie spalanie NA GODZINĘ PRACY SILNIKA z instrukcji użytkowania (L/h, issue #66).
   *
   * Siostra `oilNormLPerH` i ta sama rola: norma NOMINALNA, wpisana przez administratora,
   * obowiązująca DOPÓKI analityka nie policzy własnej z lotów tej maszyny
   * (`consumption`). Wyliczona wygrywa z wpisaną - podmiana zachodzi w jednym miejscu,
   * w `consumption/expectation.ts`.
   *
   * Ten sam mianownik, co `ConsumptionNorm.blockLPerH` (godzina pracy silnika, nie
   * godzina lotu) - dzięki temu wchodzi dokładnie w miejsce stawki blokowej i nie
   * wymaga zgadywania podziału na fazy. Z tego samego powodu NIE zasila szacunku
   * wystarczalności paliwa (`fuelNorm.ts`): tam potrzebna jest stawka W LOCIE,
   * a zaniżona rezerwa jest błędem w stronę niedopuszczalną.
   *
   * `?` i `null` znaczą to samo, co przy polach oleju: brak klucza = rekord sprzed
   * issue #66, `null` = administrator nie wpisał (ekran wtedy milczy o normie).
   */
  fuelNormLPerH?: number | null;
  /*
   * Konfiguracja OLEJU (issue #60) - trzy liczby z dokumentacji jednostki, wszystkie
   * OPCJONALNE na dwóch poziomach naraz:
   *  - `?` (brak klucza) = rekord sprzed modułu oleju - starszy serwer / stary wiersz
   *    cache'u; Etap D zaczyna wysyłać pola zawsze, ale odczyt musi przeżyć oba światy,
   *  - `null` = administrator nie skonfigurował - moduł dla tej jednostki milczy
   *    (pomiar dalej można zapisać; reguły i podpowiedzi śpią).
   */
  /** Minimalny poziom oleju przed lotem (L); poniżej → ostrzeżenie „dolej co najmniej…". */
  oilMinL?: number | null;
  /** Pojemność zbiornika oleju (L) - twardy sufit pomiaru i dolewki, jak `capacityL` dla tankowania. */
  oilCapacityL?: number | null;
  /**
   * Nominalna norma zużycia oleju - L NA GODZINĘ PRACY SILNIKA, ten sam mianownik,
   * co `fuelNormLPerH` (uwagi do issue #66: „zużycie oleju mierzy się na godzinę
   * pracy, tak jak paliwo - nie na motogodzinę"). Z dokumentacji silnika albo
   * z doświadczenia klubu. Zasila sugestię oczekiwanego poziomu, DOPÓKI analityka nie
   * policzy własnej stawki z pomiarów (faza 2) - wyliczona wygrywa z wpisaną.
   *
   * Miarą godzin pracy MIĘDZY pomiarami jest w rachunku przyrost licznika (ΔMH,
   * `oilPreflight.expectation()`), bo to jedyny zegar maszyny, który telefon zna
   * offline przez cudze operacje. Licznik Hobbsa mierzy godziny pracy 1:1;
   * obrotomierzowy przyrasta na ziemi wolniej i wtedy ΔMH jest przybliżeniem -
   * dokładniejszy przelicznik przyjdzie z modelem MH analityki (faza 2).
   */
  oilNormLPerH?: number | null;
  /** Aktywny claim: kto (pilot id) - null gdy wolny. */
  claimPicId: string | null;
  /** Od kiedy trwa aktywny claim (UTC) - null gdy wolny. */
  claimSince: EpochMillis | null;
  /** Ostatnie znane przekazanie FOB/MH - null gdy brak. */
  handover: Handover | null;
  /**
   * Norma zużycia z analityki; `null` = model poniżej progu publikacji albo serwer
   * jeszcze go nie policzył. Dana z serwera, więc obowiązują trzy stany świeżości (§4.8).
   */
  consumption: ConsumptionNorm | null;
  /** Kiedy rekord pobrano z serwera (UTC) - steruje adnotacją wieku w UI (§4.8). */
  fetchedAt: EpochMillis;
}

/** Pilot (§5.2 `reference_pilots`) - do wyboru Duala i etykiet w logu. */
export interface ReferencePilot {
  id: string;
  /** Kod pilota (np. „KRZ") - monospacing w UI. */
  code: string;
  name: string;
  active: boolean;
  fetchedAt: EpochMillis;
}
