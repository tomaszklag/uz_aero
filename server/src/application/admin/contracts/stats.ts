/**
 * UZ Aero (serwer) — KONTRAKT statystyk floty i pilotów (`A10`).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować `@uzaero/domain`
 * oraz siebie nawzajem (pilnuje `test/architecture.test.ts`).
 *
 * ══ KONSTYTUCJA EKRANU (zdanie z góry mockupu) ══
 * „Każda liczba to złożenie projekcji `projectSession` z pojedynczych sesji — panel
 * sumuje gotowe wyniki, nie liczy własnych metryk." Konsekwencje w tym kontrakcie:
 *
 *  1. **Wszystkie liczby — także ILORAZY — liczy serwer.** Średnie L/h, udział w nalocie,
 *     wykorzystanie floty i skoczkowie na godzinę lotu jadą tu jako pola, bo panel nie
 *     ma prawa dzielić dwóch sum po swojemu (`docs/architektura-panelu-frontend.md` §2.2).
 *     Iloraz to funkcja sum z kolumn projekcji, nie ponowne odtwarzanie projekcji.
 *  2. **Tylko dni ZAMKNIĘTE wchodzą do sum**, a zakres liczy się PO DNIU ZAMKNIĘCIA
 *     (`sessions.close_time`): dzień otwarty zmieniłby sumy po zamknięciu, więc jest
 *     poza zakresem — `totals.openSessionsInRange` mówi, ile takich dni pominięto.
 *  3. **`null` znaczy „nie wiemy", nigdy zero.** Dwa różne powody niewiedzy są tu
 *     rozdzielone: `staleRows` to wiersze projekcji sprzed migracji 18 (kolumn statystyk
 *     jeszcze nie przeliczono — naprawia przebudowa na `A11`), a `fuelUnknownSessions`/
 *     `mhUnknownSessions` to dni zamknięte, których bilansu NIE DA SIĘ policzyć (brak
 *     odczytu początkowego). Przy `staleRows > 0` agregaty kolumn migracji 18 jadą jako
 *     `null` — suma po części wierszy podana jako całość byłaby kłamstwem.
 */

import type { MhFormat, OperationType } from '@uzaero/domain';

/** Zakres raportu — obustronnie domknięty, po DNIU ZAMKNIĘCIA sesji. */
export interface AdminStatsRange {
  /** Dni UTC `YYYY-MM-DD`, włącznie. */
  fromDay: string;
  toDay: string;
  /** Granice w epoch ms UTC (od północy `fromDay` do końca doby `toDay`). */
  fromMs: number;
  toMs: number;
  /** Liczba dni kalendarzowych zakresu — mianownik wykorzystania floty. */
  calendarDays: number;
  /** `true` = zakres DOMYŚLNY (ostatnie 30 dni od dziś), nie podany w zapytaniu. */
  defaulted: boolean;
}

/** Sumy całego zakresu — kafle nagłówkowe `A10`. */
export interface AdminStatsTotals {
  /** Dni lotne = sesje ZAMKNIĘTE w zakresie. */
  sessions: number;
  /** Ile RÓŻNYCH jednostek latało. */
  aircraft: number;
  /**
   * Ilu RÓŻNYCH pilotów brało udział: PIC ∪ OSTATNI dual każdego dnia (`dual_id`
   * niesie tylko jego) — dual zastąpiony w środku dnia może nie być policzony.
   */
  pilots: number;
  blockMs: number;
  flightMs: number;
  /** Czas lotu jako % nalotu blokowego; `null` przy zerowym bloku. */
  flightVsBlockPct: number | null;
  /** `null` = w zakresie są wiersze sprzed migracji 18 (`staleRows` mówi ile). */
  takeoffs: number | null;
  landings: number | null;
  /** `null` = `staleRows > 0` albo żaden dzień zakresu nie ma bilansu paliwa. */
  fuelConsumedL: number | null;
  /** Dni zamknięte BEZ bilansu paliwa (świeże wiersze) — nie wchodzą do sumy. */
  fuelUnknownSessions: number;
  mhDeltaH: number | null;
  mhUnknownSessions: number;
  /**
   * Blok dni ZE ZNANYM Δ MH, w godzinach dziesiętnych — mianownik rozjazdu.
   * TEN SAM zbiór dni co licznik: pełny blok przy częściowej sumie Δ robiłby
   * z brakujących odczytów „rozjazd 20 h".
   */
  mhBlockHours: number;
  /** Rozjazd `Δ MH − blok dni ze znanym Δ` (h); `null`, gdy `mhDeltaH` jest `null`. */
  mhVsBlockH: number | null;
  /** Wiersze projekcji sprzed migracji 18 — do przebudowy na `A11`. */
  staleRows: number;
  /** Dni OTWARTE z duty startem w zakresie — celowo poza sumami. */
  openSessionsInRange: number;
  /**
   * Dni OTWARTE BEZ `session_claim` — czyli rejestr niekompletny: nie mają daty, więc
   * nie należą do żadnego zakresu i są liczone ZAWSZE. Osobno od `openSessionsInRange`,
   * bo podtytuł ekranu musi umieć je odróżnić.
   *
   * Do migracji 21 licznik obejmował sesje z SAMYM claimem (kolumna niosła wtedy
   * opcjonalny meldunek). Dziś taka sesja MA datę i jest zwykłym dniem w toku, więc ten
   * licznik zszedł do roli, którą powinien był mieć od początku: sygnału o połamanym
   * strumieniu. W zdrowym klubie stoi na zerze — i to jest właściwe zachowanie.
   */
  openSessionsUndated: number;
}

/** Punkt szeregu „nalot dzień po dniu". Dzień bez sesji to PRAWDZIWE zero. */
export interface AdminStatsDailyPoint {
  /** Dzień UTC `YYYY-MM-DD` (dzień ZAMKNIĘCIA sesji). */
  day: string;
  blockMs: number;
}

/** Wiersz ujęcia „per samolot". */
export interface AdminStatsAircraftItem {
  aircraftId: string;
  /** `null` = jednostki nie ma już w rejestrze floty; wiersz zostaje widoczny. */
  reg: string | null;
  aircraftType: string | null;
  capacityL: number | null;
  mhFormat: MhFormat | null;
  sessions: number;
  blockMs: number;
  flightMs: number;
  takeoffs: number | null;
  landings: number | null;
  fuelConsumedL: number | null;
  fuelUnknownSessions: number;
  /**
   * Średnie zużycie na godzinę BLOKOWĄ (L/h); `null` bez paliwa albo bez bloku.
   * Mianownik to blok WYŁĄCZNIE dni z bilansem paliwa — ten sam zbiór co licznik,
   * inaczej dni bez bilansu systematycznie ZANIŻAŁYBY zużycie.
   */
  avgLitresPerBlockHour: number | null;
  /** Odczyt licznika z PIERWSZEJ / OSTATNIEJ zamkniętej sesji zakresu (po dniu zamknięcia). */
  mhFirstStart: number | null;
  mhLastEnd: number | null;
  /** Suma delt per sesja — NIE `koniec − początek` (dziury między dniami nie są nalotem). */
  mhDeltaH: number | null;
  mhUnknownSessions: number;
  /** Dni kalendarzowe z co najmniej jedną zamkniętą sesją. */
  activeDays: number;
  /** `activeDays / calendarDays` w %; wykorzystanie floty z mockupu. */
  utilizationPct: number | null;
  staleRows: number;
}

/** Wiersz ujęcia „per pilot" — atrybucja po PIC-u (starty/lądowania też). */
export interface AdminStatsPilotItem {
  pilotId: string;
  /** `null` = konta nie ma już w `pilots`; wiersz zostaje z identyfikatorem. */
  code: string | null;
  name: string | null;
  sessions: number;
  /** Blok sesji, w których pilot był PIC-em — sumuje się do nalotu floty. */
  blockMs: number;
  flightMs: number;
  takeoffs: number | null;
  landings: number | null;
  /** Rejestracje jednostek, na których latał (jako PIC), alfabetycznie. */
  regs: string[];
  staleRows: number;
}

/** Wiersz ujęcia „per operacja". `operation: null` = dni bez `preflight_confirm`. */
export interface AdminStatsOperationItem {
  operation: OperationType | null;
  sessions: number;
  blockMs: number;
  flightMs: number;
  takeoffs: number | null;
  landings: number | null;
  fuelConsumedL: number | null;
  fuelUnknownSessions: number;
  avgLitresPerBlockHour: number | null;
  /** Udział bloku operacji w nalocie zakresu (%); `null` przy zerowym nalocie. */
  blockSharePct: number | null;
  /** Rejestracje jednostek w tej operacji, alfabetycznie. */
  regs: string[];
  /** Ilu RÓŻNYCH klientów (kolumna `client`, bez `null`). */
  clients: number;
  staleRows: number;
}

/** Wiersz tabeli klientów strony przychodowej. `client: null` = bez wskazania. */
export interface AdminStatsClientItem {
  client: string | null;
  lifts: number;
  jumpers: number;
  tandem: number;
  aff: number;
  solo: number;
  /** Z sum `drop_alt_sum_ft / drop_alt_count`; `null` = żaden zrzut bez wysokości. */
  avgAltitudeFt: number | null;
  jumpersPerLift: number | null;
}

/**
 * Strona przychodowa · zrzuty — zakres zawężony do operacji `skoki` (tak podpisuje
 * ją mockup: „operacja SKOKI"). Dni skokowe bez fixa wysokości nie wchodzą do
 * średniej — stąd para suma+licznik w projekcji, a nie średnia per sesja.
 */
export interface AdminStatsDrops {
  sessions: number;
  flightMs: number;
  /** `null` = `staleRows > 0` — agregatów zrzutów nie ma z czego uczciwie zsumować. */
  lifts: number | null;
  jumpers: number | null;
  tandem: number | null;
  aff: number | null;
  solo: number | null;
  liftsPerSession: number | null;
  jumpersPerLift: number | null;
  avgAltitudeFt: number | null;
  /** Zrzuty Z fixem wysokości (weszły do średniej); `null` razem z `lifts`. */
  dropsWithAltitude: number | null;
  /** Zrzuty BEZ wysokości (nie weszły do średniej); `null` razem z `lifts`. */
  dropsWithoutAltitude: number | null;
  jumpersPerFlightHour: number | null;
  /**
   * Wiersze, przez które sekcja mówi „nie wiem": dni skokowe sprzed migracji 18
   * ORAZ dni z `operation IS NULL` w zakresie — rodzaju operacji nie znamy, więc
   * każdy z nich MÓGŁ być dniem skokowym.
   */
  staleRows: number;
  /** Pusta lista przy `staleRows > 0` — częściowa tabela wyglądałaby na kompletną. */
  clients: AdminStatsClientItem[];
}

/** Odpowiedź `GET /admin/api/stats` — trzy ujęcia jednego zbioru dni naraz. */
export interface AdminStatsReport {
  /** Zegar serwera (ISO 8601 UTC) — presety dat panelu liczą „dziś" od niego. */
  at: string;
  range: AdminStatsRange;
  totals: AdminStatsTotals;
  /** Pełny kalendarz zakresu — dzień bez sesji jedzie z zerem, nie znika. */
  daily: AdminStatsDailyPoint[];
  /** Malejąco po bloku — porządek tabel mockupu. */
  aircraft: AdminStatsAircraftItem[];
  pilots: AdminStatsPilotItem[];
  operations: AdminStatsOperationItem[];
  drops: AdminStatsDrops;
}
