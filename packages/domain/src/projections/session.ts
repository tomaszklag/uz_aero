/**
 * UZ Aero — projekcje sesji (docs/_main.md.txt §5.2, §3.7).
 *
 * „Stan bieżącej sesji i statystyki dnia to PROJEKCJE liczone w pamięci ze strumienia
 * zdarzeń — przy kilkuset zdarzeniach dziennie tabele agregujące są zbędne" (§5.2).
 *
 * Ten moduł to CZYSTE, DETERMINISTYCZNE funkcje: `projectSession(events) → SessionState`.
 * Bez DB, bez Zustand, bez zegara systemowego — dzięki temu jest rdzeniem testów.
 *
 * Zasady liczenia:
 *  - czas zdarzenia = `gpsTime ?? deviceTime` — preferujemy GPS (niezależny od zegara
 *    telefonu, §4.1 pkt 6, mitygacja CLOCK_DRIFT), z fallbackiem na zegar urządzenia,
 *  - kolejność = kolejność w tablicy (repo zwraca kolejność wstawienia = chronologię),
 *  - block time i MH liczymy z ODCZYTÓW/zdarzeń; wartości „na żywo" (bieżący, jeszcze
 *    otwarty cykl / lot) NIE wchodzą do sum — do tego są selektory `live*` z `now`.
 */

import type { EpochMillis } from '../time';
import type {
  DetectionMethod,
  Event,
  EventType,
  FuelMhReading,
  JumperCounts,
  MhFormat,
  OperationType,
  SessionClaimPayload,
} from '../events';
import { applyCorrections, buildEventIndex, type IndexedEvent } from './corrections';

/**
 * WZLOT — cykl pracy silnika (engine_start → engine_stop) wraz z jego potwierdzeniem.
 * `stoppedAt: null` = silnik wciąż pracuje.
 *
 * Nazwa zmieniona z `EngineRun` w etapie B2: od 2026-08-06 to nie jest już tylko
 * „silnik chodził", tylko **jednostka potwierdzania danych** (§3.6). Nie dokładamy
 * osobnej tablicy `Leg[]` obok `engineRuns` — wzlot i cykl silnika to w tym modelu
 * ten sam byt, a dwie tablice opisujące jedną rzecz rozjechałyby się przy pierwszej
 * korekcie.
 *
 * `Leg` (cykl silnika) ≠ `Flight` (takeoff → landing). Bieg może nie mieć lotu
 * (kołowanie techniczne, próba silnika) albo mieć ich wiele (seria skokowa z gorącym
 * załadunkiem, touch and go).
 *
 * Od 2026-08-10 sesja ma NAJWYŻEJ JEDEN bieg (`SESSION_ALREADY_RAN`), więc lista
 * `legs` to w praktyce zero albo jeden element. Zostaje listą, bo reducer musi
 * przeżyć także strumień ZŁAMANY (np. duplikat z dwóch telefonów przed syncem) —
 * projekcja opisuje to, co się wydarzyło, reguły mówią, co było wolno.
 * Pola potwierdzenia (`confirmed`/`confirmedAt`/`reading`/`notes`) znikły razem
 * z `leg_close`: sesję zatwierdza `day_close.finalReading`.
 */
export interface Leg {
  /** Numer biegu w sesji (1-based) — historycznie; po 2026-08-10 zawsze 1. */
  index: number;
  startedAt: EpochMillis;
  stoppedAt: EpochMillis | null;
  /** Czas blokowy biegu (ms); 0 dopóki cykl otwarty. */
  durationMs: number;
}

/** Lot (takeoff → landing). `landingAt: null` = w powietrzu. */
export interface Flight {
  /** Numer lotu w dniu (1-based) — separator „Lot N" w logu. */
  index: number;
  method: DetectionMethod;
  takeoffAt: EpochMillis;
  landingAt: EpochMillis | null;
  /** Czas lotu (ms); 0 dopóki w powietrzu. */
  durationMs: number;
  /**
   * Uuid zdarzeń źródłowych — adres celu dla korekty (04c). Tabela lotów na ekranie
   * statystyk otwiera nimi arkusz korekty; bez nich wiersz wiedziałby „kiedy", ale
   * nie „które zdarzenie poprawić".
   */
  takeoffUuid: string;
  landingUuid: string | null;
}

/** Bilans paliwa dnia (§3.7): start + dolane − zużyte. */
export interface FuelState {
  /** Odczyt startowy z preflightu (L). */
  startL: number | null;
  /** Suma dolanego paliwa (L). */
  addedL: number;
  /** Odczyt końcowy z day_close (L). */
  endL: number | null;
  /** Zużyte = (start + dolane) − koniec; null dopóki brak odczytu końcowego. */
  consumedL: number | null;
  /** Ostatni bezpośredni odczyt paliwomierza (start / po tankowaniu / koniec). */
  lastReadingL: number | null;
}

/** Motogodziny (§3.7): początek/koniec/delta z odczytów fizycznego licznika. */
export interface MhState {
  start: number | null;
  end: number | null;
  /** Delta = koniec − start (godziny); null dopóki brak odczytu końcowego. */
  deltaH: number | null;
}

/**
 * Olej silnikowy (issue #60) — pomiar żyje WYŁĄCZNIE przy przejęciu, bo bagnet mówi
 * prawdę tylko na zimnym silniku; zdanie samolotu oleju nie mierzy. Sesja nie ma więc
 * własnego bilansu zużycia (interwał biegnie pomiar→pomiar przez wiele sesji, kotwicą
 * jest MH) — stan niesie sam fakt: co zmierzono i co dolano.
 */
export interface OilState {
  /** Pomiar z bagnetu przy przejęciu (L); `null` = pomiaru nie było. */
  levelL: number | null;
  /** Dolane przy przejęciu (L); 0 = nie dolewano. */
  addedL: number;
  /** Stan po dolewce = pomiar + dolane; `null` bez pomiaru (dolewka w ciemno go nie zna). */
  afterL: number | null;
}

/** Rozliczenie zrzutów (§3.7 — strona przychodowa dnia). */
export interface DropSummary {
  /** Liczba wyniesień (zdarzeń drop). */
  count: number;
  /** Suma skoczków wg typów. */
  jumpers: JumperCounts;
  totalJumpers: number;
  /**
   * Suma wysokości zrzutów, które MIAŁY wysokość (ft), i liczba tych zrzutów.
   *
   * Para istnieje obok `avgAltitudeFt`, bo średnich nie da się składać: statystyki
   * zakresu (panel `A10`) sumują gotowe wyniki wielu sesji, a średnia policzona ze
   * średnich per sesja ważyłaby każdą sesję tak samo, niezależnie od liczby zrzutów.
   * Zrzut bez fixa GPS nie wchodzi ani do sumy, ani do licznika — brak wysokości to
   * niewiedza, nie zero.
   */
  altitudeSumFt: number;
  altitudeFixCount: number;
  /** Średnia wysokość zrzutu (ft) — null, gdy żaden drop nie miał wysokości. */
  avgAltitudeFt: number | null;
}

/**
 * Ostatni załadunek CZEKAJĄCY na zrzut (issue #21 pkt 5+7).
 *
 * Prefill arkusza zrzutu 05e: pilot deklaruje skład na ziemi, w locie tylko potwierdza.
 * Zrzut konsumuje stan (projekcja czyści go na `drop`) — ci skoczkowie już wyszli,
 * więc drugi zrzut w tym samym locie zaczyna od pustych liczników. Kolejny załadunek
 * nadpisuje poprzedni: liczy się skład faktycznie siedzący na pokładzie.
 */
export interface BoardingState {
  /** Zadeklarowany skład; `null` = załadunek odnotowany bez liczb. */
  jumpers: JumperCounts | null;
  /** Czas załadunku — arkusz zrzutu podpisuje nim prefill („skład z załadunku 09:12"). */
  at: EpochMillis;
}

/** Pełny stan/statystyki sesji wyliczone ze strumienia zdarzeń. */
export interface SessionState {
  sessionUuid: string | null;
  aircraftId: string | null;
  picId: string | null;
  dualId: string | null;
  /**
   * PIC ustalony przy otwarciu sesji (nagłówek pierwszego zdarzenia = `session_claim`).
   * To jest **jedyny uprawniony piszący** tej sesji (single-writer, §4.1 pkt 3) — reguła
   * `WRITER_MISMATCH` porównuje z tą wartością, nie z `picId` (który jest „bieżący").
   */
  sessionPicId: string | null;

  /**
   * Sesja wpisana ręcznie po fakcie (`session_claim.manualEntry`, ekran 15) —
   * zasila plakietkę „RĘCZNIE" na kafelku (01/12) i w nagłówku rozliczenia (10).
   */
  manualEntry: boolean;

  operation: OperationType | null;
  departureIcao: string | null;
  arrivalIcao: string | null;
  client: string | null;
  /** Notatka pilota do dnia (issue #14) — wolny tekst z preflightu. */
  notes: string | null;
  mhFormat: MhFormat | null;
  /**
   * Domyślny skład skoczków sesji (`preflight_confirm.jumperDefaults`, 2026-08-17) —
   * wartość startowa KAŻDEGO załadunku bez własnej deklaracji, także po tym, jak `drop`
   * skonsumował poprzedni skład. `null` = nie ustawiono, liczniki wracają do zera.
   */
  jumperDefaults: JumperCounts | null;

  /**
   * Chwila przejęcia samolotu (`session_claim`) — początek sesji tej maszyny.
   *
   * To jest OŚ SAMOLOTU, nie oś służby: mówi, od kiedy maszyna jest zajęta, i tym samym
   * jak długo stała zablokowana, gdy pilot nigdzie nie poleciał (09C). Sesja bez claimu
   * nie istnieje (§4.4), więc `null` znaczy „strumienia jeszcze nie wczytano".
   */
  claimedAt: EpochMillis | null;
  /**
   * Chwila potwierdzenia preflightu — JEDYNY uprawniony znacznik „preflight był".
   *
   * Do 2026-08-07 tę rolę pełnił `dutyStart` (godzina meldunku) i było to poprawne
   * tylko dopóty, dopóki była obowiązkowa. Potem stała się opcjonalna, a 2026-08-11
   * klamra służby znikła z modelu W CAŁOŚCI (issue #23) — razem z polami
   * `dutyStart`/`dutyEnd`, które tu stały.
   */
  preflightAt: EpochMillis | null;

  engineRunning: boolean;
  inFlight: boolean;
  /**
   * Czy trwa kołowanie: `taxi` bez późniejszego startu/wyłączenia silnika.
   * Gwardia `ALREADY_TAXIING` blokuje tym stanem drugie `taxi` z rzędu — po kołowaniu
   * legalny jest wyłącznie `takeoff` albo `engine_stop` (decyzja 2026-08-04).
   */
  taxiing: boolean;
  /** Start otwartego cyklu silnika (do liczenia block time „na żywo"). */
  openEngineStartAt: EpochMillis | null;
  /** Start otwartego lotu (do liczenia flight time „na żywo"). */
  openTakeoffAt: EpochMillis | null;

  /** Wzloty sesji w kolejności chronologicznej (cykle silnika + ich potwierdzenia). */
  legs: Leg[];
  /** Suma zamkniętych wzlotów + ręcznych off/on-block (ms). */
  blockTimeMs: number;

  flights: Flight[];
  /** Suma zamkniętych lotów (ms). */
  flightTimeMs: number;
  takeoffCount: number;
  landingCount: number;

  fuel: FuelState;
  mh: MhState;
  oil: OilState;
  drops: DropSummary;
  /** Załadunek czekający na zrzut; `null` = brak (nikt nie siedzi / już wynieśli). */
  boarding: BoardingState | null;

  /** Czy padł `day_close` (zdanie samolotu). */
  closed: boolean;
  /**
   * Czas zdarzenia `day_close` (null dopóki dzień otwarty). Od niego liczy się
   * 24-godzinne okno korekty (decyzja 2026-07-23) — patrz `domain/rules`.
   */
  closedAt: EpochMillis | null;
  eventCount: number;
  /**
   * Indeks zdarzeń korygowalnych (uuid → typ) — z SUROWEGO strumienia, sprzed nałożenia
   * korekt. Reguły walidują nim cel `event_correction`; obejmuje też zdarzenia już
   * unieważnione, bo ponowna korekta unieważnionego jest legalna („ostatnia wygrywa").
   */
  eventIndex: Record<string, IndexedEvent>;
  lastEventAt: EpochMillis | null;
}

/** Czas zdarzenia użyty w arytmetyce: preferuj GPS, fallback na zegar telefonu. */
export function eventTime(event: Event): EpochMillis {
  return event.gpsTime ?? event.deviceTime;
}

/** Świeży, pusty stan sesji — początek redukcji i stan startowy store'u. */
export function emptySessionState(): SessionState {
  return {
    sessionUuid: null,
    aircraftId: null,
    picId: null,
    dualId: null,
    sessionPicId: null,
    manualEntry: false,
    operation: null,
    departureIcao: null,
    arrivalIcao: null,
    client: null,
    notes: null,
    mhFormat: null,
    jumperDefaults: null,
    claimedAt: null,
    preflightAt: null,
    engineRunning: false,
    inFlight: false,
    taxiing: false,
    openEngineStartAt: null,
    openTakeoffAt: null,
    legs: [],
    blockTimeMs: 0,
    flights: [],
    flightTimeMs: 0,
    takeoffCount: 0,
    landingCount: 0,
    fuel: { startL: null, addedL: 0, endL: null, consumedL: null, lastReadingL: null },
    mh: { start: null, end: null, deltaH: null },
    oil: { levelL: null, addedL: 0, afterL: null },
    drops: {
      count: 0,
      jumpers: { tandem: 0, aff: 0, solo: 0 },
      totalJumpers: 0,
      altitudeSumFt: 0,
      altitudeFixCount: 0,
      avgAltitudeFt: null,
    },
    boarding: null,
    closed: false,
    closedAt: null,
    eventCount: 0,
    eventIndex: {},
    lastEventAt: null,
  };
}

/**
 * Redukuje strumień zdarzeń do stanu/statystyk sesji.
 * @param events zdarzenia w kolejności chronologicznej (jak zwraca `EventsRepo`).
 */
export function projectSession(events: Event[]): SessionState {
  const state = emptySessionState();

  // Indeks celów korekty budujemy z SUROWEGO strumienia — reguły muszą widzieć także
  // zdarzenia unieważnione (ponowna korekta unieważnionego jest legalna).
  state.eventIndex = buildEventIndex(events);

  // Korekty (04c) nakładamy PRZED liczeniem: dalej płynie strumień efektywny — czasy
  // po poprawce, bez zdarzeń unieważnionych i bez samych `event_correction`.
  const effective = applyCorrections(events);

  // Suma i licznik wysokości akumulują się wprost w stanie (`drops.altitudeSumFt` /
  // `drops.altitudeFixCount`) — średnią liczymy z nich na końcu. Osobny bufor lokalny
  // byłby drugą kopią tych samych liczb.

  // Kolejność WSTAWIENIA ≠ kolejność ZDARZEŃ. Wpis ręczny (05f) niesie czas cofnięty
  // („4 min temu"), a korekta (04c) zmienia czas istniejącego zdarzenia — oba trafiają
  // do rejestru po zdarzeniach późniejszych. Arytmetyka cykli i lotów wymaga porządku
  // chronologicznego, więc sortujemy po czasie zdarzenia (GPS → fallback zegar telefonu).
  // Sort jest stabilny (ES2019+), więc zdarzenia równoczesne zachowują kolejność zapisu.
  const ordered = [...effective].sort((a, b) => eventTime(a) - eventTime(b));

  /**
   * Dual ZADEKLAROWANY w preflightcie (`preflight_confirm.dualId`, issue #43).
   *
   * Opakowany w obiekt, bo `null` jest tu WARTOŚCIĄ („sesja jednoosobowa"), a nie
   * brakiem deklaracji — te dwa stany znaczą co innego i muszą dać się odróżnić.
   * `undefined` (brak obiektu) = nikt nie deklarował, więc obowiązuje nagłówek.
   */
  let declaredDual: { value: string | null } | undefined;

  for (const event of ordered) {
    const t = eventTime(event);
    state.eventCount += 1;
    state.lastEventAt = t;

    // Tożsamość sesji ustalamy z pierwszego zdarzenia; bieżącą załogę bierzemy
    // z nagłówka ostatniego zdarzenia (single-writer: PIC stały, Dual może się zmienić).
    if (state.sessionUuid == null) {
      state.sessionUuid = event.sessionUuid;
      state.aircraftId = event.aircraftId;
      state.sessionPicId = event.picId;
    }
    state.picId = event.picId;
    state.dualId = event.dualId;

    switch (event.type) {
      case 'preflight_confirm': {
        const p = event.payload;
        state.operation = p.operation;
        state.departureIcao = p.departureIcao ?? null;
        state.arrivalIcao = p.arrivalIcao ?? null;
        state.client = p.client ?? null;
        state.notes = p.notes ?? null;
        state.mhFormat = p.mhFormat ?? null;
        state.jumperDefaults = p.jumperDefaults ?? null;
        state.preflightAt = t;
        state.fuel.startL = p.reading.fuelL;
        state.fuel.lastReadingL = p.reading.fuelL;
        state.mh.start = p.reading.mh;
        // Olej (issue #60): pomiar żyje wyłącznie tutaj; stan po dolewce jest rachunkiem.
        state.oil.levelL = p.oilL ?? null;
        state.oil.addedL = p.oilAddedL ?? 0;
        state.oil.afterL = p.oilL != null ? p.oilL + (p.oilAddedL ?? 0) : null;
        // Dual ZADEKLAROWANY dla całej sesji (issue #43) — patrz `declaredDualId` niżej.
        if ('dualId' in p) declaredDual = { value: p.dualId ?? null };
        break;
      }

      case 'engine_start': {
        state.legs.push({
          index: state.legs.length + 1,
          startedAt: t,
          stoppedAt: null,
          durationMs: 0,
        });
        state.engineRunning = true;
        state.openEngineStartAt = t;
        break;
      }

      case 'engine_stop': {
        const run = lastOpen(state.legs, (r) => r.stoppedAt == null);
        if (run) {
          run.stoppedAt = t;
          run.durationMs = Math.max(0, t - run.startedAt);
          state.blockTimeMs += run.durationMs;
        }
        state.engineRunning = false;
        state.taxiing = false;
        state.openEngineStartAt = null;
        break;
      }

      case 'takeoff': {
        state.takeoffCount += 1;
        if (!state.inFlight) {
          state.flights.push({
            index: state.flights.length + 1,
            method: event.payload.method,
            takeoffAt: t,
            landingAt: null,
            durationMs: 0,
            takeoffUuid: event.uuid,
            landingUuid: null,
          });
          state.inFlight = true;
          state.openTakeoffAt = t;
        }
        state.taxiing = false;
        break;
      }

      case 'landing': {
        state.landingCount += 1;
        const flight = lastOpen(state.flights, (f) => f.landingAt == null);
        if (flight) {
          flight.landingAt = t;
          flight.durationMs = Math.max(0, t - flight.takeoffAt);
          flight.landingUuid = event.uuid;
          state.flightTimeMs += flight.durationMs;
        }
        state.inFlight = false;
        // Kołowanie jest już zamknięte startem; zerujemy też tu, żeby korekta
        // unieważniająca takeoff nie zakleszczyła stanu „wiecznego kołowania".
        state.taxiing = false;
        state.openTakeoffAt = null;
        break;
      }

      case 'oil_add': {
        // Dolewka z kokpitu (issue #60) — SKŁADNIK stanu oleju, nie granica rachunku:
        // dokłada się do sumy dolanego obok pary z przejęcia, a stan po dolewce
        // przelicza się, o ile w ogóle był pomiar (dolewka poziomu nie zna).
        state.oil.addedL += event.payload.addedL;
        state.oil.afterL =
          state.oil.levelL != null ? state.oil.levelL + state.oil.addedL : null;
        break;
      }

      case 'refuel': {
        const p = event.payload;
        state.fuel.addedL += p.addedL;
        state.fuel.lastReadingL = p.afterL;
        break;
      }

      case 'drop': {
        const p = event.payload;
        state.drops.count += 1;
        // Skład jest opcjonalny (issue #21 pkt 5): zrzut bez liczb liczy się do
        // `count`, ale nie dokłada zer do sum — brak deklaracji to niewiedza, nie zero
        // (ta sama zasada, co przy wysokości niżej).
        if (p.jumpers != null) {
          state.drops.jumpers.tandem += p.jumpers.tandem;
          state.drops.jumpers.aff += p.jumpers.aff;
          state.drops.jumpers.solo += p.jumpers.solo;
        }
        if (p.altitudeFt != null) {
          state.drops.altitudeSumFt += p.altitudeFt;
          state.drops.altitudeFixCount += 1;
        }
        if (state.client == null && p.client != null) state.client = p.client;
        // Zrzut konsumuje załadunek — ci skoczkowie już wyszli; kolejny arkusz 05e
        // zaczyna od pustych liczników, dopóki nie będzie nowego załadunku.
        state.boarding = null;
        break;
      }

      case 'boarding': {
        state.boarding = { jumpers: event.payload.jumpers ?? null, at: t };
        break;
      }

      case 'manual_log_entry': {
        // Fallback GPS (§3.8): ręczny wzlot wnosi własny block i lot (metoda manual).
        const p = event.payload;
        if (p.takeoff != null) state.takeoffCount += 1;
        if (p.landing != null) state.landingCount += 1;
        if (p.takeoff != null && p.landing != null) {
          const durationMs = Math.max(0, p.landing - p.takeoff);
          state.flights.push({
            index: state.flights.length + 1,
            method: 'manual',
            takeoffAt: p.takeoff,
            landingAt: p.landing,
            durationMs,
            // Cały lot pochodzi z JEDNEGO wpisu ręcznego — korekta celuje w niego,
            // niezależnie od tego, czy pilot poprawia start, czy lądowanie.
            takeoffUuid: event.uuid,
            landingUuid: event.uuid,
          });
          state.flightTimeMs += durationMs;
        }
        if (p.offBlock != null && p.onBlock != null) {
          state.blockTimeMs += Math.max(0, p.onBlock - p.offBlock);
        }
        break;
      }

      case 'day_close': {
        const p = event.payload;
        state.fuel.endL = p.finalReading.fuelL;
        state.fuel.lastReadingL = p.finalReading.fuelL;
        state.mh.end = p.finalReading.mh;
        state.closed = true;
        state.closedAt = t;
        break;
      }

      // `leg_close` obsługiwane tu między 2026-08-06 a 2026-08-10 — usunięte razem
      // z pojęciem wzlotu: sesję zatwierdza `day_close.finalReading`.

      case 'session_claim':
        // Tożsamość aktualizowana z nagłówka (wyżej), payload w większości
        // informacyjny. Zostaje czas (od kiedy samolot zajęty — 09C, `claim_time`
        // panelu) i znacznik wpisu ręcznego (plakietka „RĘCZNIE", 2026-08-16).
        state.claimedAt = t;
        if ((event.payload as SessionClaimPayload).manualEntry === true) {
          state.manualEntry = true;
        }
        break;

      case 'crew_change':
        // Tożsamość/załoga aktualizowana z nagłówka (wyżej). Payload informacyjny.
        break;

      case 'taxi':
        // Kołowanie nie wpływa na ŻADEN bilans: czas blokowy wyznaczają `engine_start`
        // i `engine_stop`, czas lotu — `takeoff` i `landing`. Jedyne, co niesie, to
        // stan „kołowanie trwa" dla gwardii ALREADY_TAXIING — zamyka go dopiero start
        // albo wyłączenie silnika. Sam wpis jest opisowy, odczytywany wprost ze
        // strumienia przy budowaniu logu cyklu (mockup 05).
        state.taxiing = true;
        break;

      case 'event_correction':
        // Strumień efektywny nie zawiera korekt (nałożone w `applyCorrections` wyżej) —
        // ten przypadek istnieje dla wyczerpującego pokrycia unii przez kompilator.
        break;

      default:
        // Wyczerpujące pokrycie unii — kompilator pilnuje kompletności `switch`.
        assertNever(event);
    }
  }

  // Pochodne bilanse.
  if (state.fuel.endL != null && state.fuel.startL != null) {
    state.fuel.consumedL = state.fuel.startL + state.fuel.addedL - state.fuel.endL;
  }
  if (state.mh.start != null && state.mh.end != null) {
    state.mh.deltaH = state.mh.end - state.mh.start;
  }
  state.drops.totalJumpers =
    state.drops.jumpers.tandem + state.drops.jumpers.aff + state.drops.jumpers.solo;
  state.drops.avgAltitudeFt =
    state.drops.altitudeFixCount > 0
      ? state.drops.altitudeSumFt / state.drops.altitudeFixCount
      : null;

  /**
   * DEKLARACJA ZAŁOGI WYGRYWA Z NAGŁÓWKIEM (issue #43).
   *
   * W pętli `state.dualId` bierze się z nagłówka OSTATNIEGO zdarzenia — i tak zostaje
   * dla każdej sesji, w której nikt załogi nie poprawiał. Gdy jednak preflight niesie
   * `dualId`, to on opisuje CAŁĄ sesję: nagłówki zdarzeń zapisanych przed korektą nadal
   * noszą starą osobę i nigdy nie przestaną (rejestr jest append-only), więc bez tego
   * pierwszeństwa poprawka nie miałaby jak zadziałać wstecz.
   *
   * Zmiany załogi W TRAKCIE to osobna sprawa (`crew_change`) i jej to nie dotyczy:
   * tamta rozgrywa się w nagłówkach kolejnych zdarzeń, a deklaracji nikt wtedy nie
   * zapisuje.
   */
  if (declaredDual !== undefined) state.dualId = declaredDual.value;

  return state;
}

/**
 * Block time „na żywo": suma zamkniętych cykli + trwający cykl liczony do `now`.
 * Do timera w kokpicie (UI podaje `now`, np. z tykającego zegara). `now` musi być
 * w tej samej domenie co czasy zdarzeń (UTC epoch ms).
 */
export function liveBlockTimeMs(state: SessionState, now: EpochMillis): number {
  if (state.engineRunning && state.openEngineStartAt != null) {
    return state.blockTimeMs + Math.max(0, now - state.openEngineStartAt);
  }
  return state.blockTimeMs;
}

/** Flight time „na żywo": suma zamkniętych lotów + trwający lot liczony do `now`. */
export function liveFlightTimeMs(state: SessionState, now: EpochMillis): number {
  if (state.inFlight && state.openTakeoffAt != null) {
    return state.flightTimeMs + Math.max(0, now - state.openTakeoffAt);
  }
  return state.flightTimeMs;
}

/** Ostatni element spełniający predykat (od końca) — bez mutacji tablicy. */
function lastOpen<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i]!)) return items[i];
  }
  return undefined;
}

/** Strażnik wyczerpania unii — nieosiągalny w runtime dla poprawnych danych. */
function assertNever(value: never): never {
  throw new Error(`Nieobsłużony typ zdarzenia: ${JSON.stringify(value)}`);
}
