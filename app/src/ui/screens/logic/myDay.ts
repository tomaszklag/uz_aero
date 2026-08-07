/**
 * UZ Aero — model widoku ekranu 01 „Mój dzień" (`design/01-moj-dzien.html`, §3.6a).
 *
 * Czysta warstwa między projekcją służby (`projectDuty`) a widokiem: bierze `DutyDay`
 * i oddaje gotowe napisy oraz stany, których ekran nie musi już wyliczać. Zero React,
 * zero zegara systemowego — `now` podaje wołający, tak jak w `liveBlockTimeMs`.
 *
 * REGUŁA, KTÓRĄ TEN MODUŁ CZYNI WIDOCZNĄ: służba jest KLAMRĄ wokół wzlotów, nie ich
 * kontenerem. Dlatego każda z dwóch godzin klamry niesie ze sobą informację, SKĄD się
 * wzięła — „poprawione" (deklaracja pilota) albo „z pierwszego wzlotu" (wyliczone).
 * Bez tego rozróżnienia ekran pokazywałby dwie identyczne liczby o zupełnie różnym
 * statusie, a pilot nie wiedziałby, czy ma co poprawiać.
 */

import { duration, timeLocal, timeUtc } from '../../format';
import type { DutyDay, DutyLeg, EpochMillis } from '../../../domain';

/** Skąd wzięła się godzina klamry — decyduje o podpisie i kolorze na ekranie. */
export type BracketOrigin =
  /** Pilot zadeklarował ją sam (arkusz godziny na 01). */
  | 'declared'
  /** Wyliczona z pierwszego/ostatniego wzlotu doby. */
  | 'derived'
  /** Nie ma jeszcze ani deklaracji, ani wzlotu. */
  | 'pending'
  /** Służba trwa — koniec ustali się na ostatnim wzlocie. */
  | 'running';

export interface BracketVm {
  /** Duża wartość: „07:10", „— : —" albo „TRWA". */
  value: string;
  /** Czas lokalny obok UTC — WYŁĄCZNIE tutaj (reguła strefy czasowej, CLAUDE.md). */
  localTime: string | null;
  /** Podpis mówiący, skąd ta godzina pochodzi. */
  hint: string;
  origin: BracketOrigin;
  /** Czy pilot może ją teraz poprawić (arkusz godziny). */
  editable: boolean;
}

export interface LegRowVm {
  /**
   * Sesja, do której wzlot należy. Bez niej wiersz wie „kiedy", ale nie wie, KTÓRY
   * strumień otworzyć — a ślad (14) i korekta (04c) działają na konkretnej sesji.
   */
  sessionUuid: string;
  /** Numer w dobie — ciągiem przez samoloty, tak jak numeruje mockup. */
  index: number;
  /** „08:12 → 09:05" albo „13:40 → …" dla wzlotu otwartego. */
  times: string;
  blockLabel: string;
  flightLabel: string;
  /** `false` → wiersz dostaje pasek „do potwierdzenia" prowadzący na 09. */
  confirmed: boolean;
}

/**
 * Grupa wzlotów jednej maszyny — CIĄGŁA w czasie, nie zbiorcza.
 *
 * Pilot, który wziął SP-AXA, potem SP-KLM, a potem znów SP-AXA, zobaczy TRZY grupy,
 * nie dwie. Dzień czyta się jako oś czasu i scalanie odległych odcinków w jedną kartę
 * kłamałoby o przebiegu dnia — a przy okazji uniemożliwiało pokazanie, kiedy maszyna
 * była zdana.
 */
export interface LegGroupVm {
  aircraftId: string;
  /** Sesja tej maszyny — adres rozliczenia (10) dla KAŻDEJ grupy, nie tylko ostatniej. */
  sessionUuid: string;
  legs: LegRowVm[];
  /** Czy ta grupa dotyczy maszyny nadal trzymanej (ostatnia grupa z otwartą sesją). */
  held: boolean;
}

export interface MyDayVm {
  start: BracketVm;
  end: BracketVm;
  groups: LegGroupVm[];
  /** Sumy doby — `null` tam, gdzie nie ma czego liczyć („— —", nigdy zero). */
  totals: {
    duty: string | null;
    block: string | null;
    flight: string | null;
    takeoffs: number;
    landings: number;
    aircraftCount: number;
  };
  legCount: number;
  /** Ile wzlotów czeka na potwierdzenie — zasila pasek amber. */
  unconfirmedCount: number;
  /** Czy dzień jest pusty (ani wzlotu, ani deklaracji) — wariant 01A. */
  empty: boolean;
}

const DASH = '— —';

/**
 * Buduje model widoku ekranu 01.
 *
 * @param duty projekcja służby (`projectDuty`),
 * @param now  „teraz" do liczenia trwającej służby; podaje wołający,
 * @param heldAircraftId samolot aktualnie trzymany przez pilota (`null`, gdy żaden).
 */
export function buildMyDay(
  duty: DutyDay,
  now: EpochMillis,
  heldAircraftId: string | null = null,
): MyDayVm {
  const groups = groupContiguously(duty.legs, heldAircraftId);
  const empty = duty.legs.length === 0 && duty.declaredStart == null && duty.declaredEnd == null;

  return {
    start: startBracket(duty),
    end: endBracket(duty),
    groups,
    totals: {
      duty: dutyTotal(duty, now),
      block: duty.legs.length > 0 ? duration(duty.blockTimeMs) : null,
      flight: duty.legs.length > 0 ? duration(duty.flightTimeMs) : null,
      takeoffs: duty.takeoffCount,
      landings: duty.landingCount,
      // Liczba maszyn doby zasila podpis „2 samoloty" pod sumą bloku. Widok NIE ma tego
      // liczyć sam — `Set` w JSX byłby dokładnie tym obliczeniem, którego tu unikamy.
      aircraftCount: duty.aircraftIds.length,
    },
    legCount: duty.legs.length,
    unconfirmedCount: duty.unconfirmedLegCount,
    empty,
  };
}

/** „— —" zamiast liczby, gdy nie ma czego pokazać (ta sama zasada co na 01A). */
export function totalLabel(value: string | null): string {
  return value ?? DASH;
}

// ─────────────────────────────────────────────────────────────────────────────
// Klamra
// ─────────────────────────────────────────────────────────────────────────────

function startBracket(duty: DutyDay): BracketVm {
  const firstLeg = duty.legs.length > 0 ? duty.legs[0]!.startedAt : null;

  if (duty.declaredStart != null) {
    return {
      value: timeUtc(duty.startAt),
      localTime: timeLocal(duty.startAt),
      // Gdy deklaracja ZAWĘŻA klamrę, mówimy o tym wprost — pilot ma zobaczyć, że
      // wpisana godzina nie jest tą, którą system liczy (§3.6a: lot jest faktem).
      hint: duty.declarationNarrowsStart
        ? `wpisano ${timeUtc(duty.declaredStart)} · liczy się pierwszy wzlot ${timeUtc(firstLeg)}`
        : firstLeg != null
          ? `poprawione · pierwszy wzlot ${timeUtc(firstLeg)}`
          : 'poprawione',
      origin: 'declared',
      editable: true,
    };
  }

  if (firstLeg != null) {
    return {
      value: timeUtc(firstLeg),
      localTime: timeLocal(firstLeg),
      hint: 'z pierwszego wzlotu',
      origin: 'derived',
      editable: true,
    };
  }

  return {
    value: '— : —',
    localTime: null,
    hint: 'ustali się na pierwszym wzlocie',
    origin: 'pending',
    editable: true,
  };
}

/**
 * Koniec klamry — i jedyne miejsce, w którym widok NIE bierze wartości z projekcji wprost.
 *
 * `DutyDay.endAt` to klamra ROZSTRZYGNIĘTA: gdy wszystkie wzloty są zamknięte, projekcja
 * podaje czas ostatniego z nich, bo tak §3.6a każe domykać dzień, którego pilot nie zamknął.
 * Dla dnia, który WŁAŚNIE TRWA, to jednak nie jest odpowiedź na pytanie ekranu. Pilot
 * o 15:25 stoi przy samolocie, którego jeszcze nie zdał — jego służba nie skończyła się
 * o 15:10 tylko dlatego, że wtedy zgasł silnik.
 *
 * Rozstrzygnięcie: **dopóki pilot nie zadeklarował końca („Zamknij dzień" na 01B), koniec
 * pokazujemy jako TRWA, a długość liczymy do teraz.** Projekcja zostaje nietknięta i dalej
 * mówi prawdę o klamrze rozstrzygniętej — tego potrzebuje serwer, historia i arkusz.
 * Różnica jest prezentacyjna i tu jest jej miejsce.
 */
function endBracket(duty: DutyDay): BracketVm {
  const lastStop = lastClosedStop(duty.legs);

  if (duty.declaredEnd != null) {
    return {
      value: timeUtc(duty.endAt),
      localTime: timeLocal(duty.endAt),
      hint: duty.declarationNarrowsEnd
        ? `wpisano ${timeUtc(duty.declaredEnd)} · liczy się ostatni wzlot ${timeUtc(lastStop)}`
        : lastStop != null
          ? `potwierdzone · ostatni wzlot ${timeUtc(lastStop)}`
          : 'potwierdzone',
      origin: 'declared',
      editable: true,
    };
  }

  const anyLegOpen = duty.legs.some((l) => l.stoppedAt == null);

  return {
    value: duty.legs.length > 0 ? 'TRWA' : '— : —',
    localTime: null,
    hint:
      lastStop != null
        ? `ustali się na ostatnim wzlocie — ${timeUtc(lastStop)}`
        : 'ustali się na ostatnim wzlocie',
    origin: duty.legs.length > 0 ? 'running' : 'pending',
    // Końca nie da się wpisać, dopóki jakikolwiek silnik pracuje — nie ma czego domykać.
    editable: !anyLegOpen,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wzloty
// ─────────────────────────────────────────────────────────────────────────────

function groupContiguously(legs: readonly DutyLeg[], heldAircraftId: string | null): LegGroupVm[] {
  const groups: LegGroupVm[] = [];

  for (const leg of legs) {
    const last = groups[groups.length - 1];
    const row: LegRowVm = {
      sessionUuid: leg.sessionUuid,
      index: leg.index,
      times:
        leg.stoppedAt != null
          ? `${timeUtc(leg.startedAt)} → ${timeUtc(leg.stoppedAt)}`
          : `${timeUtc(leg.startedAt)} → …`,
      blockLabel: duration(leg.blockMs),
      flightLabel: duration(leg.flightMs),
      confirmed: leg.confirmed,
    };

    if (last != null && last.aircraftId === leg.aircraftId) {
      last.legs.push(row);
    } else {
      groups.push({
        aircraftId: leg.aircraftId,
        sessionUuid: leg.sessionUuid,
        legs: [row],
        held: false,
      });
    }
  }

  // Trzymana jest co najwyżej OSTATNIA grupa — wcześniejsze maszyny pilot już zdał,
  // nawet jeśli wróci do tej samej rejestracji później w ciągu dnia.
  const last = groups[groups.length - 1];
  if (last != null && heldAircraftId != null && last.aircraftId === heldAircraftId) {
    last.held = true;
  }

  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sumy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Długość służby. Ta sama zasada, co przy końcu klamry: dopóki pilot nie zadeklarował
 * końca, liczymy DO TERAZ („8:15 · do teraz" w mockupie), a nie do ostatniego wzlotu.
 * Dzień zamknięty oddaje wartość rozstrzygniętą z projekcji.
 */
function dutyTotal(duty: DutyDay, now: EpochMillis): string | null {
  if (duty.startAt == null) return null;
  if (duty.declaredEnd != null && duty.durationMs != null) return duration(duty.durationMs);
  return duration(Math.max(0, now - duty.startAt));
}

function lastClosedStop(legs: readonly DutyLeg[]): EpochMillis | null {
  let last: EpochMillis | null = null;
  for (const leg of legs) {
    if (leg.stoppedAt == null) continue;
    last = last == null || leg.stoppedAt > last ? leg.stoppedAt : last;
  }
  return last;
}
