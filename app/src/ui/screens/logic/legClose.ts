/**
 * UZ Aero — model widoku ekranu 09 „Zamknij lot" (`design/09-zamknij-lot.html`, §3.6).
 *
 * Ekran potwierdza JEDEN wzlot: pilot przegląda czasy z detekcji, opcjonalnie dopisuje
 * odczyt liczników i uwagę. Ten moduł odpowiada na trzy pytania, których widok nie ma
 * prawa rozstrzygać sam:
 *
 *  1. **KTÓRY wzlot zamykamy** — najstarszy niepotwierdzony, nie ostatni. Pilot mógł
 *     wyjść przez „Potwierdzę później" i wraca do kolejki od początku.
 *  2. **CZY pokazać sekcję zrzutów** — istnieje wyłącznie w dniu skokowym (issue #19).
 *     To BRAK SEKCJI, nie sekcja pusta: zrzut przy przelocie nie mógł się wydarzyć.
 *  3. **CZY ostrzec o pominiętych odczytach** — po pięciu z rzędu (§3.6). Ostrzeżenie
 *     jest warunkowe (Typ B): znika samo, gdy pilot wpisze odczyt, i nie da się go
 *     zamknąć ręcznie.
 *
 * Czysta funkcja: bez React, bez zegara. Odczyt jest OPCJONALNY i to jest decyzja, nie
 * niedopatrzenie — w serii skokowej nikt nie chodzi do licznika po każdym wzlocie.
 */

import { isJumpOperation } from '../../../domain';
import type { Event, EpochMillis, Leg, MhFormat, SessionState } from '../../../domain';
import { duration, litres, motoHours, thousands, timeUtc } from '../../format';

/** Ile pominiętych odczytów z rzędu zapala ostrzeżenie warunkowe (§3.6). */
export const SKIPPED_READINGS_WARNING = 5;

/** Skąd pochodzi czas w wierszu — plakietka AUTO / RĘCZNIE przy każdym z nich. */
export type TimeSource = 'auto' | 'manual';

export interface TimeRowVm {
  /** „Off block", „Takeoff", „Landing", „On block". */
  key: string;
  /** „13:40" albo „—", gdy zdarzenia nie było (lot bez startu = kołowanie techniczne). */
  value: string;
  source: TimeSource | null;
  /** Uuid zdarzenia — adres korekty (04c). `null`, gdy zdarzenia nie ma. */
  targetUuid: string | null;
}

/** Podsumowanie zrzutu — TYLKO w dniu skokowym; zapisany w locie (05e), tu do przejrzenia. */
export interface DropSummaryVm {
  dropNumber: number;
  jumperCount: number;
  /** „4 TANDEM · 2 AFF · 0 SOLO". */
  breakdown: string;
  /** „2 700 ft · 13:14 UTC · SKY CAMP" albo sam czas, gdy zabrakło fixa. */
  meta: string;
  /** Uuid zdarzenia `drop` — adres ołówka „Popraw zrzut" (05e). */
  targetUuid: string;
}

/** Ostatnia komórka paska wyniku — CO w niej stoi, zależy od wariantu ekranu. */
export interface TrailingCellVm {
  value: string;
  label: string;
}

export interface LegCloseVm {
  /** Numer wzlotu w sesji — nagłówek „SP-KLM · WZLOT 3". */
  legIndex: number;
  aircraftId: string;
  /** Pasek wyniku: liczby POLICZONE ze zdarzeń, pilot ich nie wpisuje. */
  summary: {
    blockLabel: string;
    flightLabel: string;
    takeoffs: number;
    landings: number;
    /**
     * Czwarta komórka: przy serii skokowej licznik wzlotów („7 / 7"), poza nią lotnisko
     * lądowania. To wybór INFORMACJI, nie stylu — dlatego zapada tutaj, a nie w widoku.
     */
    trailing: TrailingCellVm;
  };
  times: TimeRowVm[];
  /**
   * Podpowiedź pod polem paliwa: ostatni znany odczyt. Nie jest wartością domyślną —
   * pilot ma ODCZYTAĆ paliwomierz, a nie potwierdzić naszą rachubę (§4.1 pkt 5).
   */
  fuelHint: string;
  /** Podpowiedź pod polem MH: odczyt przed wzlotem i spodziewany przyrost. */
  mhHint: string;
  /** `null` przy operacji innej niż skoki — sekcji NIE MA (issue #19). */
  drop: DropSummaryVm | null;
  /** Ile wzlotów z rzędu poszło bez odczytu; `>= SKIPPED_READINGS_WARNING` zapala baner. */
  skippedReadings: number;
  /** Czy pokazać ostrzeżenie warunkowe o pominiętych odczytach. */
  warnSkippedReadings: boolean;
}

/**
 * Buduje model ekranu dla wzlotu czekającego na potwierdzenie.
 *
 * @returns `null`, gdy nie ma czego zamykać — wtedy ekran w ogóle nie powinien się
 *          otworzyć, a nie pokazywać pustego formularza.
 */
export function buildLegClose(state: SessionState, events: readonly Event[]): LegCloseVm | null {
  const leg = state.legs.find((l) => l.stoppedAt != null && !l.confirmed);
  if (leg == null || state.aircraftId == null) return null;

  const inLeg = eventsWithin(events, leg);
  const flights = state.flights.filter(
    (f) => f.takeoffAt >= leg.startedAt && (leg.stoppedAt == null || f.takeoffAt <= leg.stoppedAt),
  );

  const skipped = skippedReadingsBefore(state, leg);
  const drop = dropSummary(state, inLeg);

  return {
    legIndex: leg.index,
    aircraftId: state.aircraftId,
    summary: {
      blockLabel: duration(leg.durationMs),
      flightLabel: duration(flights.reduce((sum, f) => sum + f.durationMs, 0)),
      takeoffs: flights.length,
      landings: flights.filter((f) => f.landingAt != null).length,
      trailing: trailingCell(state, leg, drop),
    },
    times: buildTimes(leg, inLeg),
    fuelHint: fuelHint(state),
    mhHint: mhHint(state, leg),
    drop,
    skippedReadings: skipped,
    warnSkippedReadings: skipped >= SKIPPED_READINGS_WARNING,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Czasy
// ─────────────────────────────────────────────────────────────────────────────

function buildTimes(leg: Leg, inLeg: readonly Event[]): TimeRowVm[] {
  const takeoff = inLeg.find((e) => e.type === 'takeoff');
  const landing = inLeg.find((e) => e.type === 'landing');
  const engineStart = inLeg.find((e) => e.type === 'engine_start');
  const engineStop = inLeg.find((e) => e.type === 'engine_stop');

  return [
    row('Off block', leg.startedAt, 'auto', engineStart?.uuid ?? null),
    row(
      'Takeoff',
      takeoff != null ? at(takeoff) : null,
      takeoff?.type === 'takeoff' ? takeoff.payload.method : null,
      takeoff?.uuid ?? null,
    ),
    row(
      'Landing',
      landing != null ? at(landing) : null,
      landing?.type === 'landing' ? landing.payload.method : null,
      landing?.uuid ?? null,
    ),
    // STOP ENGINE jest jedyną akcją zawsze inicjowaną ręcznie (§3.2), więc plakietka
    // „RĘCZNIE" nie jest tu wyjątkiem — jest regułą i tak ma się czytać.
    row('On block', leg.stoppedAt, 'manual', engineStop?.uuid ?? null),
  ];
}

/**
 * Czwarta komórka paska wyniku.
 *
 * W serii skokowej pilot pyta „który to już raz", poza nią — „gdzie wylądowałem".
 *
 * ROZJAZD Z MOCKUPEM 09A, ŚWIADOMY: mockup podpisuje tę komórkę „Wzlot dnia", a liczba
 * pochodzi z SESJI tego samolotu. Po §3.6a to dwie różne rzeczy — doba pilota może objąć
 * kilka maszyn i wtedy „7 / 7 dnia" byłoby nieprawdą. Podpis mówi więc o sesji; policzenie
 * wzlotów całej doby wymagałoby tu `DutyDay`, czyli wciągnięcia osi pilota do ekranu,
 * który opisuje jeden samolot.
 */
function trailingCell(state: SessionState, leg: Leg, drop: DropSummaryVm | null): TrailingCellVm {
  if (drop != null) {
    return { value: `${leg.index} / ${state.legs.length}`, label: 'Wzlot sesji' };
  }
  return {
    // Przy skokach start i lądowanie to ten sam plac (issue #13), więc lotnisko odlotu
    // jest poprawnym zastępnikiem, gdy pola przylotu nie ma.
    value: state.arrivalIcao ?? state.departureIcao ?? '—',
    label: 'Lądowanie',
  };
}

function row(
  key: string,
  value: EpochMillis | null,
  source: TimeSource | null,
  targetUuid: string | null,
): TimeRowVm {
  return {
    key,
    value: value != null ? timeUtc(value) : '—',
    source: value != null ? source : null,
    targetUuid,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Podpowiedzi pod licznikami
// ─────────────────────────────────────────────────────────────────────────────

function fuelHint(state: SessionState): string {
  if (state.fuel.lastReadingL == null) return 'brak wcześniejszego odczytu';
  return `ostatni odczyt ${litres(state.fuel.lastReadingL)}`;
}

/**
 * Podpowiedź MH: odczyt sprzed wzlotu i spodziewany przyrost równy czasowi blokowemu.
 * Podajemy OBIE liczby, nie samą sumę — pilot ma porównać z licznikiem, a nie przepisać
 * naszą rachubę. Gdy odczytu startowego brak, nie zmyślamy przyrostu.
 */
function mhHint(state: SessionState, leg: Leg): string {
  const format: MhFormat = state.mhFormat ?? 'decimal';
  const before = mhBefore(state, leg);
  if (before == null) return 'brak odczytu startowego — wpisz z licznika';

  const expected = before + leg.durationMs / 3_600_000;
  return `przed wzlotem ${motoHours(before, format)} · +${duration(leg.durationMs)} = ${motoHours(expected, format)}`;
}

/** Ostatni znany odczyt MH przed tym wzlotem: z potwierdzenia wcześniejszego albo z przejęcia. */
function mhBefore(state: SessionState, leg: Leg): number | null {
  for (const earlier of legsBefore(state, leg)) {
    if (earlier.reading != null) return earlier.reading.mh;
  }
  return state.mh.start;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zrzuty i pominięte odczyty
// ─────────────────────────────────────────────────────────────────────────────

function dropSummary(state: SessionState, inLeg: readonly Event[]): DropSummaryVm | null {
  // Sekcja istnieje WYŁĄCZNIE w dniu skokowym. Operacja nieznana (stary strumień)
  // też jej nie dostaje — brak wiedzy nie jest zgodą.
  if (state.operation == null || !isJumpOperation(state.operation)) return null;

  const drop = inLeg.find((e) => e.type === 'drop');
  if (drop == null || drop.type !== 'drop') return null;

  const { tandem, aff, solo } = drop.payload.jumpers;
  const altitude = drop.payload.altitudeFt;

  return {
    dropNumber: drop.payload.dropNumber,
    jumperCount: tandem + aff + solo,
    breakdown: `${tandem} TANDEM · ${aff} AFF · ${solo} SOLO`,
    meta: [
      // Brak wysokości to NIEWIEDZA, nie zero — mówimy o tym wprost zamiast pisać „0 ft".
      altitude != null ? `${thousands(Math.round(altitude))} ft` : null,
      `${timeUtc(at(drop))} UTC`,
      altitude == null ? 'bez fixa GPS' : null,
      // Klient dziedziczony z preflightu (§5.1) — to strona przychodowa dnia skokowego.
      state.client,
    ]
      .filter(Boolean)
      .join(' · '),
    targetUuid: drop.uuid,
  };
}

/**
 * Ile ZAMKNIĘTYCH wzlotów bezpośrednio przed tym poszło bez odczytu liczników.
 *
 * Liczymy wstecz i przerywamy na pierwszym z odczytem: ostrzeżenie ma mówić „od pięciu
 * wzlotów nie schodziłeś do licznika", a nie „w tym dniu bywały wzloty bez odczytu".
 * Wzlot potwierdzony bez odczytu liczy się tak samo jak niepotwierdzony — z punktu
 * widzenia łańcucha paliwowego oba są dziurą.
 */
function skippedReadingsBefore(state: SessionState, leg: Leg): number {
  let count = 0;
  for (const earlier of legsBefore(state, leg)) {
    if (earlier.reading != null) break;
    count += 1;
  }
  return count;
}

/**
 * Wzloty poprzedzające dany, od najbliższego wstecz.
 *
 * Idziemy po POZYCJI w tablicy, nie po arytmetyce na `leg.index`. Numer wzlotu jest
 * etykietą dla pilota i nie musi się pokrywać z pozycją — po korekcie unieważniającej
 * cykl albo przy sesji wczytanej fragmentarycznie założenie „index = pozycja + 1"
 * cicho przestaje obowiązywać i psuje liczenie, zamiast wywalić się głośno.
 */
function legsBefore(state: SessionState, leg: Leg): Leg[] {
  const position = state.legs.indexOf(leg);
  if (position < 0) return [];
  return state.legs.slice(0, position).reverse();
}

// ─────────────────────────────────────────────────────────────────────────────
// Pomocnicze
// ─────────────────────────────────────────────────────────────────────────────

const at = (e: Event): EpochMillis => e.gpsTime ?? e.deviceTime;

/** Zdarzenia mieszczące się w oknie wzlotu (włącznie z granicami). */
function eventsWithin(events: readonly Event[], leg: Leg): Event[] {
  return events.filter((e) => {
    const t = at(e);
    return t >= leg.startedAt && (leg.stoppedAt == null || t <= leg.stoppedAt);
  });
}
