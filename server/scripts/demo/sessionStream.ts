/**
 * UZ Aero (dane demo) — JEDNA SESJA SAMOLOTU JAKO STRUMIEŃ ZDARZEŃ.
 *
 * Czysta funkcja: opis sesji → tablica zdarzeń w kopercie `POST /events`. Żadnego I/O,
 * żadnego losowania, żadnej bazy — dzięki temu ten sam scenariusz jedzie w teście
 * (`test/demoScenario.test.ts`, PGlite przez prawdziwe gniazdo) i w skrypcie
 * (`scripts/seedDemo.ts`, HTTP do działającego serwera).
 *
 * ══ SESJA = JEDEN BIEG SILNIKA (pivot 2026-08-10) ══
 * Poprzednia wersja tego pliku niosła TABLICĘ wzlotów (`DemoLeg[]`) z opcjonalnym
 * `leg_close` przy każdym — model z 2026-08-06. Po pivocie sesja ma NAJWYŻEJ JEDEN
 * bieg silnika (`SESSION_ALREADY_RAN`), a dzień skokowy z gorącym załadunkiem to jeden
 * bieg z WIELOMA LOTAMI (start → lądowanie) w środku. Konsekwencje w tym pliku:
 *  • `DemoSession.run` to POJEDYNCZY bieg z tablicą lotów (`DemoFlight[]`), nie lista
 *    cykli; próba silnika po obsłudze = bieg z pustą tablicą lotów;
 *  • `leg_close` nie istnieje — jedyne odczyty sesji to preflight (przejęcie),
 *    tankowania i `day_close.finalReading` (zdanie = ZATWIERDZENIE logu, wymagane);
 *  • tankowanie zdarza się PRZED uruchomieniem albo PO zatrzymaniu (kokpit 04a/04),
 *    nigdy w środku biegu;
 *  • klamry służby (`dutyStart`/`dutyEnd`) nie ma w ogóle — pola znikły z payloadów
 *    razem z modelem (issue #23, 2026-08-11);
 *  • `day_close` bez biegu niesie `noFlightReason` (ekran 09C).
 *
 * ══ DLACZEGO ZDARZENIA, A NIE `INSERT` DO PROJEKCJI ══
 * Bo `sessions`, `flags`, `export_log` i `exported_sheets` są PROJEKCJAMI — wiersze
 * wstawione ręcznie byłyby zgodne ze schematem i niezgodne z regułami, a panel pokazywałby
 * dane, których produkcyjny kod nigdy by nie wyprodukował. Demo ma świecić na tym samym
 * torze co telefon: paczka na `POST /events` → ingest → projekcja → flagi → karta doby.
 *
 * ══ IDENTYFIKATORY SĄ CZYTELNE, I TO JEST DECYZJA ══
 * `demo-axa-20260714-pwi` zamiast UUID-a v4. Koperta wymaga wyłącznie napisu (1–100
 * znaków), a w panelu te napisy widać na `A02`, `A03` i `A04` — po `demo-` widać z daleka,
 * że to dane testowe, i da się o nie zapytać greppem. Stałe id dają też IDEMPOTENCJĘ:
 * powtórny bieg seeda wraca jako `duplicates`, a nie jako drugi komplet sesji.
 */

import {
  CURRENT_SCHEMA_VERSION,
  type EventOf,
  type EventType,
  type FuelMhReading,
  type JumperCounts,
  type MhFormat,
  type NoFlightReason,
  type OperationType,
} from '@uzaero/domain';

/**
 * Zdarzenie w kopercie drutu — model domenowy BEZ `syncedAt`.
 *
 * `syncedAt` opisuje outbox TELEFONU („czy poszło"), więc na serwer nie jedzie i trasa
 * `POST /events` go nie zna. Mapowany typ zamiast `Omit<Event, 'syncedAt'>`, bo `Omit`
 * spłaszcza unię dyskryminowaną: po nim `type` i `payload` przestają być powiązane
 * i kompilator przepuściłby `takeoff` z payloadem `day_close`.
 */
export type WireEvent = { [K in EventType]: Omit<EventOf<K>, 'syncedAt'> }[EventType];

/**
 * LOT (start → lądowanie) wewnątrz jedynego biegu sesji. Minuty od północy UTC doby.
 *
 * `landingMin === null` to lot W POWIETRZU — legalne wyłącznie w ostatnim locie sesji
 * w toku (kokpit 05, karta „Samoloty w powietrzu" na `A01`).
 */
export interface DemoFlight {
  takeoffMin: number;
  landingMin: number | null;
  /** Zrzut skoczków (operacja `skoki`); `null` dla lotów bez wyniesienia. */
  drop: { altitudeFt: number; jumpers: JumperCounts } | null;
}

/**
 * JEDYNY bieg silnika sesji (pivot 2026-08-10). Pusta tablica `flights` to próba
 * silnika po obsłudze — dla analityki bezcenna, bo cały czas pracy przypada na ziemię
 * i to ona rozdziela stawki ziemia/lot lepiej niż jakikolwiek lot.
 *
 * `engineStopMin === null` = silnik NADAL PRACUJE (sesja w toku), nie strumień z dziurą.
 */
export interface DemoRun {
  engineStartMin: number;
  taxiMin: number | null;
  flights: DemoFlight[];
  engineStopMin: number | null;
}

/**
 * Tankowanie — GRANICA interwału paliwowego, nie składnik. Po pivocie zdarza się
 * wyłącznie przed uruchomieniem albo po zatrzymaniu (w środku biegu nie ma przerwy,
 * w której pilot stoi przy dystrybutorze).
 */
export interface DemoRefuel {
  atMin: number;
  beforeL: number;
  addedL: number;
  afterL: number;
}

/**
 * Zdanie samolotu (ekran 09b/09C) = ZATWIERDZENIE logu sesji. `null` = sesja NIEZDANA —
 * samolot zostaje zajęty.
 *
 * To nie jest brak danych, tylko stan, który panel ma pokazywać: dwie niezamknięte
 * sesje jednej maszyny dają `aircraft_overlap` i wstrzymują kartę doby (§4.7).
 */
export interface DemoRelease {
  atMin: number;
  /** Odczyt końcowy WYMAGANY = przekazanie dla następnego pilota (łańcuch MH, §4.5). */
  finalReading: FuelMhReading;
  /** Powód zdania BEZ uruchomienia silnika (09C) — wyłącznie dla sesji bez biegu. */
  noFlightReason: NoFlightReason | null;
}

/** Sesja samolotu w opisie, z którego da się złożyć strumień. */
export interface DemoSession {
  sessionUuid: string;
  aircraftId: string;
  picId: string;
  dualId: string | null;
  /** Północ UTC doby, w której samolot został PRZEJĘTY (§4.7 — doba karty). */
  dayStartMs: number;
  /** `session_claim` — od tej chwili maszyna jest zajęta (`sessions.claim_time`). */
  claimMin: number;
  /** `preflight_confirm` — zadanie, trasa i odczyt startowy. BEZ godziny meldunku. */
  preflightMin: number;
  operation: OperationType;
  client: string | null;
  /** Notatka pilota do dnia (issue #14) — wolny tekst z preflightu. */
  notes: string | null;
  departureIcao: string;
  arrivalIcao: string | null;
  mhFormat: MhFormat;
  /** Odczyt liczników w preflightcie — początek ogniwa łańcucha MH (§4.5). */
  reading: FuelMhReading;
  /** Jedyny bieg sesji; `null` = silnik nie ruszył (materiał na 09C). */
  run: DemoRun | null;
  refuels: DemoRefuel[];
  release: DemoRelease | null;
  /**
   * Rozjazd zegara telefonu względem GPS (ms). `gpsTime = deviceTime − drift`, więc
   * wartość powyżej `CLOCK_DRIFT_MS` (120 s) daje flagę `clock_drift`. 0 = zegary zgodne.
   */
  clockDriftMs: number;
}

/** Lotnisko bazowe scenariusza — pozycja pod `engine_start` i elewacja pola. */
const BASE_POSITION = { lat: 50.0777, lon: 19.7848 } as const;
const BASE_ELEVATION_FT = 782;

/**
 * Zdarzenia sesji w porządku chronologicznym.
 *
 * Kolejność ma znaczenie dla CZYTELNOŚCI rejestru (`A04` sortuje po czasie przyjęcia,
 * ale karta doby i log sesji czytają strumień), nie dla poprawności: `projectSession`
 * i tak sortuje po czasie zdarzenia.
 */
export function sessionStream(session: DemoSession): WireEvent[] {
  const at = (min: number): number => session.dayStartMs + min * 60_000;
  const events: WireEvent[] = [];
  let seq = 0;

  /**
   * Koperta ze wspólnym nagłówkiem. `uuid` numerujemy w obrębie sesji, więc jest stały
   * między biegami — na tym stoi idempotencja seeda.
   */
  const push = <K extends EventType>(
    type: K,
    min: number,
    payload: EventOf<K>['payload'],
  ): WireEvent => {
    seq += 1;
    const deviceTime = at(min);
    const event = {
      uuid: `${session.sessionUuid}-${String(seq).padStart(2, '0')}-${type}`,
      sessionUuid: session.sessionUuid,
      aircraftId: session.aircraftId,
      picId: session.picId,
      dualId: session.dualId,
      type,
      deviceTime,
      // Rozjazd zegarów jest własnością TELEFONU na czas sesji, więc dotyka każdego
      // zdarzenia z fixem — flaga i tak raportuje maksimum (`domain/clockDrift.ts`).
      gpsTime: deviceTime - session.clockDriftMs,
      payload,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    } as WireEvent;
    events.push(event);
    return event;
  };

  push('session_claim', session.claimMin, { mode: 'free' });

  // Godziny meldunku nie ma — klamra służby znikła z modelu (issue #23).
  push('preflight_confirm', session.preflightMin, {
    operation: session.operation,
    departureIcao: session.departureIcao,
    arrivalIcao: session.arrivalIcao,
    reading: session.reading,
    client: session.client,
    notes: session.notes,
    mhFormat: session.mhFormat,
  });

  // Tankowania i bieg wplatamy PO CZASIE, a nie blokami: rejestr `A04` i log sesji
  // czytają zdarzenia w kolejności strumienia, a dolewka przed startem ma stać
  // PRZED `engine_start`, dolewka po locie — za `engine_stop`.
  const timed: Array<{ min: number; emit: () => void }> = [];

  const run = session.run;
  if (run != null) {
    timed.push({
      min: run.engineStartMin,
      emit: () =>
        push('engine_start', run.engineStartMin, {
          position: BASE_POSITION,
          fieldElevationFt: BASE_ELEVATION_FT,
        }),
    });

    if (run.taxiMin != null) {
      const taxiMin = run.taxiMin;
      timed.push({ min: taxiMin, emit: () => push('taxi', taxiMin, { method: 'auto' }) });
    }

    for (const [index, flight] of run.flights.entries()) {
      timed.push({
        min: flight.takeoffMin,
        emit: () =>
          push('takeoff', flight.takeoffMin, { method: 'auto', position: BASE_POSITION }),
      });
      if (flight.drop != null && flight.landingMin != null) {
        const drop = flight.drop;
        // Zrzut w połowie między startem a lądowaniem — wyniesienie na wysokość i skok.
        const dropMin = Math.round((flight.takeoffMin + flight.landingMin) / 2);
        timed.push({
          min: dropMin,
          emit: () =>
            push('drop', dropMin, {
              dropNumber: index + 1,
              altitudeFt: drop.altitudeFt,
              jumpers: drop.jumpers,
              client: session.client,
            }),
        });
      }
      if (flight.landingMin != null) {
        const landingMin = flight.landingMin;
        timed.push({
          min: landingMin,
          emit: () => push('landing', landingMin, { method: 'auto', position: BASE_POSITION }),
        });
      }
    }

    if (run.engineStopMin != null) {
      const engineStopMin = run.engineStopMin;
      timed.push({
        min: engineStopMin,
        emit: () => push('engine_stop', engineStopMin, { position: BASE_POSITION }),
      });
    }
  }

  for (const refuel of session.refuels) {
    timed.push({
      min: refuel.atMin,
      emit: () =>
        push('refuel', refuel.atMin, {
          beforeL: refuel.beforeL,
          addedL: refuel.addedL,
          afterL: refuel.afterL,
        }),
    });
  }

  // Sort stabilny (ES2019+), więc zdarzenia o tej samej minucie zachowują kolejność
  // dopisania — a ta jest tu celowa (taxi przed takeoff, drop przed landing).
  for (const entry of [...timed].sort((a, b) => a.min - b.min)) entry.emit();

  if (session.release != null) {
    const release = session.release;
    // Zdanie samolotu NIE kończy dnia pilota; klamry służby nie ma (issue #23).
    push('day_close', release.atMin, {
      finalReading: release.finalReading,
      noFlightReason: release.noFlightReason,
    });
  }

  return events;
}
