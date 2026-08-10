/**
 * UZ Aero (dane demo) — JEDNA SESJA SAMOLOTU JAKO STRUMIEŃ ZDARZEŃ.
 *
 * Czysta funkcja: opis sesji → tablica zdarzeń w kopercie `POST /events`. Żadnego I/O,
 * żadnego losowania, żadnej bazy — dzięki temu ten sam scenariusz jedzie w teście
 * (`test/demoScenario.test.ts`, PGlite przez prawdziwe gniazdo) i w skrypcie
 * (`scripts/seedDemo.ts`, HTTP do działającego serwera).
 *
 * ══ SESJA, NIE DZIEŃ (przebudowa flow, §3.6a — 2026-08-06) ══
 * Poprzednik tego pliku nazywał się `dayStream.ts` i produkował `DemoDay`: jeden samolot
 * = jeden dzień, klamra służby w payloadach, jeden cykl silnika na całą dobę. Po §3.6a
 * to jest błąd modelowy, a nie tylko nietrafiona nazwa — dzień służby należy do PILOTA
 * i obejmuje kilka maszyn, więc kontenerem zdarzeń jest **sesja samolotu**
 * (przejęcie → zdanie), a jednostką potwierdzenia danych **wzlot** (`leg_close`).
 *
 * Konsekwencje widoczne wprost w tym pliku:
 *  • `preflight_confirm` NIE niesie `dutyStart`, a `day_close` NIE niesie `dutyEnd` —
 *    ekrany 02/09b o nie nie pytają, więc strumień demo też ich nie ma prawa nieść.
 *    Klamra służby powstaje z projekcji `projectDuty`, nie z payloadu;
 *  • sesja ma TABLICĘ wzlotów, każdy z własną parą `engine_start`/`engine_stop`
 *    (dzień skokowy to 8–12 wzlotów pod rząd, nie jeden cykl z ośmioma lotami w środku);
 *  • `leg_close` jest OPCJONALNY, a jego odczyt liczników jeszcze bardziej opcjonalny
 *    (§3.6) — i to jest właśnie materiał, na którym kalibruje się analityka (§3.6b);
 *  • `day_close` bez ani jednego wzlotu niesie `noFlightReason` (ekran 09C).
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
 * Potwierdzenie wzlotu (ekran 09) — `null` na wzlocie, który go nie dostał.
 *
 * Wzlot bez potwierdzenia jest LEGALNY („Potwierdzę później", §3.6) i demo musi takie
 * mieć: to na nich stoi pasek „do potwierdzenia" w „Mój dzień" i kolumna stanu w panelu.
 */
export interface DemoLegClose {
  atMin: number;
  /**
   * Odczyt liczników — `null` znaczy, że pilot go pominął, i to jest przypadek
   * DOMYŚLNY w dniu skokowym (§3.6: nikt nie chodzi do licznika po każdym wzlocie).
   * Dla analityki różnica jest zasadnicza: odczyt zamyka interwał paliwowy, jego brak
   * zostawia całą sesję jednym odcinkiem (§3.6b).
   */
  reading: FuelMhReading | null;
  notes: string | null;
}

/**
 * WZLOT — jeden cykl silnika. Minuty liczone od północy UTC doby sesji.
 *
 * `takeoffMin === null` to wzlot BEZ LOTU: próba silnika po obsłudze technicznej.
 * Model tego nie zabrania i nie powinien — a dla analityki jest to jedyna obserwacja,
 * w której cały czas pracy silnika przypada na ziemię, więc rozdziela stawki lepiej
 * niż jakikolwiek lot.
 */
export interface DemoLeg {
  engineStartMin: number;
  taxiMin: number | null;
  takeoffMin: number | null;
  landingMin: number | null;
  /**
   * `null` = silnik NADAL PRACUJE. Wzlot bez `engine_stop` to sesja w toku (kokpit 05,
   * karta „Samoloty w powietrzu" na `A01`), a nie strumień z dziurą.
   */
  engineStopMin: number | null;
  /** Zrzut skoczków (operacja `skoki`); `null` dla wzlotów bez wyniesienia. */
  drop: { altitudeFt: number; jumpers: JumperCounts } | null;
  close: DemoLegClose | null;
}

/** Tankowanie między wzlotami (§3.4) — GRANICA interwału paliwowego, nie składnik. */
export interface DemoRefuel {
  atMin: number;
  beforeL: number;
  addedL: number;
  afterL: number;
}

/**
 * Zdanie samolotu (ekran 09b/09C). `null` = sesja NIEZDANA — samolot zostaje zajęty.
 *
 * To nie jest brak danych, tylko stan, który panel ma pokazywać: dwie niezamknięte
 * sesje jednej maszyny dają `aircraft_overlap` i wstrzymują kartę doby (§4.7).
 */
export interface DemoRelease {
  atMin: number;
  /** Odczyt końcowy = przekazanie dla następnego pilota (ogniwo łańcucha MH, §4.5). */
  finalReading: FuelMhReading;
  /** Powód zdania BEZ wzlotu (09C) — wypełniony wyłącznie dla sesji bez cyklu silnika. */
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
  legs: DemoLeg[];
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
 * ale karta doby i log cyklu czytają strumień), nie dla poprawności: `projectSession`
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

  // Payload BEZ `dutyStart`: przejęcie samolotu nie pyta o godzinę meldunku (§3.6a).
  push('preflight_confirm', session.preflightMin, {
    operation: session.operation,
    departureIcao: session.departureIcao,
    arrivalIcao: session.arrivalIcao,
    reading: session.reading,
    client: session.client,
    notes: session.notes,
    mhFormat: session.mhFormat,
  });

  // Wszystko między preflightem a zdaniem wplatamy PO CZASIE, a nie blokami: rejestr
  // `A04` i log cyklu czytają zdarzenia w kolejności, w jakiej stoją w strumieniu,
  // a tankowanie zdarza się pomiędzy wzlotami.
  const timed: Array<{ min: number; emit: () => void }> = [];

  for (const [index, leg] of session.legs.entries()) {
    timed.push({
      min: leg.engineStartMin,
      emit: () =>
        push('engine_start', leg.engineStartMin, {
          position: BASE_POSITION,
          fieldElevationFt: BASE_ELEVATION_FT,
        }),
    });

    if (leg.taxiMin != null) {
      const taxiMin = leg.taxiMin;
      timed.push({ min: taxiMin, emit: () => push('taxi', taxiMin, { method: 'auto' }) });
    }
    if (leg.takeoffMin != null) {
      const takeoffMin = leg.takeoffMin;
      timed.push({
        min: takeoffMin,
        emit: () => push('takeoff', takeoffMin, { method: 'auto', position: BASE_POSITION }),
      });
    }
    if (leg.drop != null && leg.takeoffMin != null && leg.landingMin != null) {
      const drop = leg.drop;
      // Zrzut w połowie między startem a lądowaniem — wyniesienie na wysokość i skok.
      const dropMin = Math.round((leg.takeoffMin + leg.landingMin) / 2);
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
    if (leg.landingMin != null) {
      const landingMin = leg.landingMin;
      timed.push({
        min: landingMin,
        emit: () => push('landing', landingMin, { method: 'auto', position: BASE_POSITION }),
      });
    }

    if (leg.engineStopMin != null) {
      const engineStopMin = leg.engineStopMin;
      timed.push({
        min: engineStopMin,
        emit: () => push('engine_stop', engineStopMin, { position: BASE_POSITION }),
      });
    }

    // `leg_close` emitowane tu do 2026-08-10 — usunięte razem ze zdarzeniem.
    // POPRAWKA MECHANICZNA pod kompilację: pełna przebudowa generatora pod nowy
    // model (jedna sesja = jeden bieg, odczyty zawsze przy zdaniu) to etap E.
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
  // dopisania — a ta jest tu celowa (taxi przed takeoff, drop przed landing,
  // engine_stop przed leg_close).
  for (const entry of [...timed].sort((a, b) => a.min - b.min)) entry.emit();

  if (session.release != null) {
    const release = session.release;
    // Payload BEZ `dutyEnd`: zdanie samolotu NIE kończy dnia pilota (§3.6a).
    push('day_close', release.atMin, {
      finalReading: release.finalReading,
      noFlightReason: release.noFlightReason,
    });
  }

  return events;
}
