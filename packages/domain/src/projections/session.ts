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
 * `Leg` (cykl silnika) ≠ `Flight` (takeoff → landing). Jeden wzlot może nie mieć lotu
 * (kołowanie techniczne) albo mieć ich kilka (dzień skokowy z wieloma wyniesieniami
 * na jednym cyklu zdarza się rzadko, ale model tego nie zabrania).
 */
export interface Leg {
  /** Numer wzlotu w sesji (1-based) — ten sam, którym `leg_close.legIndex` się posługuje. */
  index: number;
  startedAt: EpochMillis;
  stoppedAt: EpochMillis | null;
  /** Czas blokowy wzlotu (ms); 0 dopóki cykl otwarty. */
  durationMs: number;
  /**
   * Czy pilot potwierdził ten wzlot (`leg_close`, ekran 09).
   *
   * Wzlot niepotwierdzony jest LEGALNY — pilot mógł wyjść przez „Potwierdzę później",
   * a offline-first zabrania więzić go przy telefonie. Czasy i tak są w rejestrze,
   * więc wchodzą do sum; brakuje wyłącznie przejrzenia. To ta flaga rysuje pasek
   * „do potwierdzenia" w „Mój dzień".
   */
  confirmed: boolean;
  /**
   * Kiedy pilot potwierdził (null = jeszcze nie).
   *
   * To jest **kotwica 24-godzinnego okna korekty tego wzlotu** (§3.6a — każdy wzlot
   * ma własne okno). Wzlot niepotwierdzony kotwiczy się awaryjnie w `stoppedAt`,
   * inaczej brak potwierdzenia dawałby bezterminowe prawo zapisu.
   */
  confirmedAt: EpochMillis | null;
  /**
   * Odczyt liczników z potwierdzenia — `null`, gdy pilot go pominął (§3.6: odczyt
   * jest tu OPCJONALNY). `null` znaczy „nie wiem", nigdy „tyle samo co przed lotem".
   */
  reading: FuelMhReading | null;
  /** Uwaga pilota do wzlotu. */
  notes: string | null;
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

  operation: OperationType | null;
  departureIcao: string | null;
  arrivalIcao: string | null;
  client: string | null;
  /** Notatka pilota do dnia (issue #14) — wolny tekst z preflightu. */
  notes: string | null;
  mhFormat: MhFormat | null;

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
   * Do 2026-08-07 tę rolę pełnił `dutyStart` i było to poprawne tylko dopóty, dopóki
   * godzina meldunku była obowiązkowa. Od schemaVersion 2 klamra jest opcjonalna (§3.6a),
   * a ekran 02 w ogóle o nią nie pyta — `dutyStart` jest więc `null` w ZWYKŁYM przypadku
   * i mylenie go z brakiem preflightu blokowało pilotowi uruchomienie silnika.
   */
  preflightAt: EpochMillis | null;

  /**
   * Godziny KLAMRY SŁUŻBY zadeklarowane przez pilota — obie opcjonalne (§3.6a).
   * Służba jest klamrą wokół wzlotów, nie kontenerem: brak deklaracji nie jest brakiem
   * danych, tylko zgodą na wyliczenie klamry z lotów.
   */
  dutyStart: EpochMillis | null;
  dutyEnd: EpochMillis | null;

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
  drops: DropSummary;

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
    operation: null,
    departureIcao: null,
    arrivalIcao: null,
    client: null,
    notes: null,
    mhFormat: null,
    claimedAt: null,
    preflightAt: null,
    dutyStart: null,
    dutyEnd: null,
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
    drops: {
      count: 0,
      jumpers: { tandem: 0, aff: 0, solo: 0 },
      totalJumpers: 0,
      altitudeSumFt: 0,
      altitudeFixCount: 0,
      avgAltitudeFt: null,
    },
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
        state.preflightAt = t;
        // `?? null`, bo od schemaVersion 2 klamra jest opcjonalna (§3.6a) — brak
        // deklaracji ma być `null` („pilot nie podał"), nigdy `undefined`, inaczej
        // projekcja przestaje być totalna i psuje kontrakt DTO panelu.
        state.dutyStart = p.dutyStart ?? null;
        state.fuel.startL = p.reading.fuelL;
        state.fuel.lastReadingL = p.reading.fuelL;
        state.mh.start = p.reading.mh;
        break;
      }

      case 'engine_start': {
        state.legs.push({
          index: state.legs.length + 1,
          startedAt: t,
          stoppedAt: null,
          durationMs: 0,
          confirmed: false,
          confirmedAt: null,
          reading: null,
          notes: null,
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

      case 'refuel': {
        const p = event.payload;
        state.fuel.addedL += p.addedL;
        state.fuel.lastReadingL = p.afterL;
        break;
      }

      case 'drop': {
        const p = event.payload;
        state.drops.count += 1;
        state.drops.jumpers.tandem += p.jumpers.tandem;
        state.drops.jumpers.aff += p.jumpers.aff;
        state.drops.jumpers.solo += p.jumpers.solo;
        if (p.altitudeFt != null) {
          state.drops.altitudeSumFt += p.altitudeFt;
          state.drops.altitudeFixCount += 1;
        }
        if (state.client == null && p.client != null) state.client = p.client;
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
        state.dutyEnd = p.dutyEnd ?? null;
        state.closed = true;
        state.closedAt = t;
        break;
      }

      case 'leg_close': {
        // Potwierdzenie wzlotu (§3.6). NIE tworzy ani nie zamyka cyklu — te wyznaczają
        // `engine_start`/`engine_stop`. Przypina się do NAJSTARSZEGO niepotwierdzonego
        // zamkniętego wzlotu, a nie do `legIndex` z payloadu: numer z telefonu bywa
        // nieaktualny po korekcie (`event_correction` może unieważnić cykl i przenumerować
        // resztę), a strumień efektywny jest tu jedynym źródłem prawdy o kolejności.
        const p = event.payload;
        const leg = state.legs.find((l) => l.stoppedAt != null && !l.confirmed);
        if (leg) {
          leg.confirmed = true;
          leg.confirmedAt = t;
          leg.reading = p.reading ?? null;
          leg.notes = p.notes ?? null;
        }
        if (p.reading != null) {
          // Odczyt z zamknięcia wzlotu jest PEŁNOPRAWNY (§4.1 pkt 5: licznik fizyczny
          // bije rachubę), więc staje się ostatnim znanym stanem paliwomierza — tym
          // samym domyka interwał paliwowy analityki (§3.6b).
          state.fuel.lastReadingL = p.reading.fuelL;
        }
        // Odczyt MH z wzlotu NIE trafia do `mh.end` — to koniec ŁAŃCUCHA i należy do
        // zdania samolotu. Tutaj mieszka na `leg.reading`, skąd analityka bierze go
        // jako koniec interwału paliwowego, nie jako deltę sesji.
        break;
      }

      case 'session_claim':
        // Tożsamość aktualizowana z nagłówka (wyżej), payload informacyjny. Zostaje sam
        // czas: to on mówi, od kiedy samolot jest zajęty (09C, `claim_time` panelu).
        state.claimedAt = t;
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
