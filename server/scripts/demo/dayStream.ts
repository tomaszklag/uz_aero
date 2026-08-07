/**
 * UZ Aero (dane demo) — JEDEN DZIEŃ LOTNY JAKO STRUMIEŃ ZDARZEŃ.
 *
 * Czysta funkcja: opis dnia → tablica zdarzeń w kopercie `POST /events`. Żadnego I/O,
 * żadnego losowania, żadnej bazy — dzięki temu ten sam scenariusz jedzie w teście
 * (`test/demoScenario.test.ts`, PGlite przez `app.inject`) i w skrypcie
 * (`scripts/seedDemo.ts`, prawdziwy HTTP do działającego serwera).
 *
 * ══ DLACZEGO ZDARZENIA, A NIE `INSERT` DO PROJEKCJI ══
 * Bo `sessions`, `flags`, `export_log` i `exported_sheets` są PROJEKCJAMI — wiersze
 * wstawione ręcznie byłyby zgodne ze schematem i niezgodne z regułami, a panel pokazywałby
 * dane, których produkcyjny kod nigdy by nie wyprodukował. Demo ma świecić na tym samym
 * torze co telefon: paczka na `POST /events` → ingest → projekcja → flagi → karta dnia.
 *
 * ══ IDENTYFIKATORY SĄ CZYTELNE, I TO JEST DECYZJA ══
 * `demo-axa-0714` zamiast UUID-a v4. Koperta wymaga wyłącznie napisu (1–100 znaków),
 * a w panelu te napisy widać na `A02`, `A03` i `A04` — po `demo-` widać z daleka, że to
 * dane testowe, i da się o nie zapytać greppem. Stałe id dają też IDEMPOTENCJĘ: powtórny
 * bieg seeda wraca jako `duplicates`, a nie jako drugi komplet dni.
 */

import {
  CURRENT_SCHEMA_VERSION,
  type EventOf,
  type EventType,
  type FuelMhReading,
  type JumperCounts,
  type MhFormat,
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

/** Lot w obrębie jednego cyklu silnika. Minuty liczone od północy UTC dnia lotnego. */
export interface DemoFlight {
  taxiMin: number;
  takeoffMin: number;
  landingMin: number;
  /** Zrzut skoczków (operacja `skoki`); `null` dla lotów bez wyniesienia. */
  drop: { altitudeFt: number; jumpers: JumperCounts } | null;
}

/** Tankowanie w trakcie dnia (§3.4) — punkt kontrolny zużycia. */
export interface DemoRefuel {
  atMin: number;
  beforeL: number;
  addedL: number;
  afterL: number;
}

/**
 * Dzień lotny w opisie, z którego da się złożyć strumień.
 *
 * `finalReading === null` znaczy DZIEŃ OTWARTY — nie ma `day_close`, więc nie ma karty
 * arkusza, a samolot zostaje zajęty. To nie jest brak danych, tylko stan, który panel
 * ma pokazywać (i który tworzy nakładkę `aircraft_overlap`, gdy dojdzie druga sesja).
 */
export interface DemoDay {
  sessionUuid: string;
  aircraftId: string;
  picId: string;
  dualId: string | null;
  /** Północ UTC dnia lotnego (epoch ms). */
  dayStartMs: number;
  dutyStartMin: number;
  dutyEndMin: number | null;
  engineStartMin: number;
  engineStopMin: number | null;
  operation: OperationType;
  client: string | null;
  departureIcao: string;
  arrivalIcao: string | null;
  mhFormat: MhFormat;
  /** Odczyt liczników w preflightcie — początek ogniwa łańcucha MH (§4.5). */
  reading: FuelMhReading;
  /** Odczyt z `day_close` = przekazanie dla następnego pilota; `null` = dzień otwarty. */
  finalReading: FuelMhReading | null;
  flights: DemoFlight[];
  refuel: DemoRefuel | null;
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
 * Zdarzenia dnia w porządku chronologicznym.
 *
 * Kolejność ma znaczenie dla CZYTELNOŚCI rejestru (`A04` sortuje po czasie przyjęcia,
 * ale karta dnia i log cyklu czytają strumień), nie dla poprawności: `projectSession`
 * i tak sortuje po czasie zdarzenia.
 */
export function dayEvents(day: DemoDay): WireEvent[] {
  const at = (min: number): number => day.dayStartMs + min * 60_000;
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
      uuid: `${day.sessionUuid}-${String(seq).padStart(2, '0')}-${type}`,
      sessionUuid: day.sessionUuid,
      aircraftId: day.aircraftId,
      picId: day.picId,
      dualId: day.dualId,
      type,
      deviceTime,
      // Rozjazd zegarów jest własnością TELEFONU na czas dnia, więc dotyka każdego
      // zdarzenia z fixem — flaga i tak raportuje maksimum (`domain/clockDrift.ts`).
      gpsTime: deviceTime - day.clockDriftMs,
      payload,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    } as WireEvent;
    events.push(event);
    return event;
  };

  push('session_claim', day.dutyStartMin, { mode: 'free' });

  push('preflight_confirm', day.dutyStartMin, {
    operation: day.operation,
    departureIcao: day.departureIcao,
    arrivalIcao: day.arrivalIcao,
    dutyStart: at(day.dutyStartMin),
    reading: day.reading,
    client: day.client,
    mhFormat: day.mhFormat,
  });

  push('engine_start', day.engineStartMin, {
    position: BASE_POSITION,
    fieldElevationFt: BASE_ELEVATION_FT,
  });

  // Zdarzenia dnia poza cyklem silnika (tankowanie) wplatamy w czasie, a nie na końcu:
  // rejestr `A04` i log cyklu czytają je w kolejności, w jakiej stoją w strumieniu.
  const timed: Array<{ min: number; emit: () => void }> = [];

  for (const [index, flight] of day.flights.entries()) {
    timed.push({ min: flight.taxiMin, emit: () => push('taxi', flight.taxiMin, { method: 'auto' }) });
    timed.push({
      min: flight.takeoffMin,
      emit: () => push('takeoff', flight.takeoffMin, { method: 'auto', position: BASE_POSITION }),
    });
    if (flight.drop != null) {
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
            client: day.client,
          }),
      });
    }
    timed.push({
      min: flight.landingMin,
      emit: () => push('landing', flight.landingMin, { method: 'auto', position: BASE_POSITION }),
    });
  }

  if (day.refuel != null) {
    const refuel = day.refuel;
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

  if (day.engineStopMin != null) {
    push('engine_stop', day.engineStopMin, { position: BASE_POSITION });
  }

  if (day.finalReading != null && day.dutyEndMin != null) {
    push('day_close', day.dutyEndMin, {
      finalReading: day.finalReading,
      dutyEnd: at(day.dutyEndMin),
    });
  }

  return events;
}
