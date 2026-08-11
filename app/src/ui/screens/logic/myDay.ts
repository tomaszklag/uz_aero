/**
 * UZ Aero — model widoku ekranu 01 „Mój dzień" (`design/01-moj-dzien.html`, issue #23).
 *
 * Czysta warstwa między projekcją dnia pilota (`projectPilotDay`) a widokiem: bierze
 * `PilotDay` i oddaje gotowe napisy oraz stany, których ekran nie musi już wyliczać.
 * Zero React, zero zegara systemowego.
 *
 * REGUŁA, KTÓRĄ TEN MODUŁ CZYNI WIDOCZNĄ: do pilota w danej dobie przypisana jest
 * LISTA SESJI — płaska oś czasu, posortowana po uruchomieniu silnika, z rejestracją
 * jako informacją wiersza (issue #23 pkt 3: grupowanie po samolocie kłamało o przebiegu
 * dnia przy każdej przesiadce). Klamra służby — meldunek, koniec, suma „Służba",
 * „Zamknij dzień" — została usunięta W CAŁOŚCI razem z modelem (issue #23 pkt 2):
 * ta wielkość niczego nie mierzyła. Dnia się nie otwiera i nie zamyka.
 */

import { duration, timeUtc } from '../../format';
import type { PilotDay } from '../../../domain';

export interface SessionRowVm {
  /**
   * Sesja, którą wiersz opisuje. Bez niej wiersz wie „kiedy", ale nie wie, KTÓRY
   * strumień otworzyć — a ślad (14) i korekta (04c) działają na konkretnej sesji.
   */
  sessionUuid: string;
  /** Numer w dobie — ciągiem przez maszyny, tak jak numeruje mockup. */
  index: number;
  /** „08:12 → 09:05" albo „13:40 → …" dla biegu jeszcze otwartego. */
  times: string;
  /** Rejestracja — INFORMACJA wiersza, nie oś grupowania (issue #23 pkt 3). */
  aircraftId: string;
  /** Liczba lotów sesji — kolumna „Loty" z mockupu 01. */
  flightsLabel: string;
  blockLabel: string;
  flightLabel: string;
}

export interface MyDayVm {
  /** Płaska oś czasu sesji doby — już posortowana i ponumerowana przez projekcję. */
  sessions: SessionRowVm[];
  /** Sumy doby — `null` tam, gdzie nie ma czego liczyć („— —", nigdy zero). */
  totals: {
    block: string | null;
    flight: string | null;
    takeoffs: number;
    landings: number;
    aircraftCount: number;
  };
  sessionCount: number;
  /** Czy dzień jest pusty — wariant 01A. */
  empty: boolean;
}

const DASH = '— —';

/** Buduje model widoku ekranu 01 z projekcji dnia pilota. */
export function buildMyDay(day: PilotDay): MyDayVm {
  return {
    sessions: day.sessions.map((session) => ({
      sessionUuid: session.sessionUuid,
      index: session.index,
      times:
        session.stoppedAt != null
          ? `${timeUtc(session.startedAt)} → ${timeUtc(session.stoppedAt)}`
          : `${timeUtc(session.startedAt)} → …`,
      aircraftId: session.aircraftId,
      flightsLabel: String(session.flightCount),
      blockLabel: duration(session.blockMs),
      flightLabel: duration(session.flightMs),
    })),
    totals: {
      block: day.sessions.length > 0 ? duration(day.blockTimeMs) : null,
      flight: day.sessions.length > 0 ? duration(day.flightTimeMs) : null,
      takeoffs: day.takeoffCount,
      landings: day.landingCount,
      // Liczba maszyn doby zasila podpis „2 samoloty" pod sumą bloku. Widok NIE ma tego
      // liczyć sam — `Set` w JSX byłby dokładnie tym obliczeniem, którego tu unikamy.
      aircraftCount: day.aircraftIds.length,
    },
    sessionCount: day.sessions.length,
    empty: day.sessions.length === 0,
  };
}

/** „— —" zamiast liczby, gdy nie ma czego pokazać (ta sama zasada co na 01A). */
export function totalLabel(value: string | null): string {
  return value ?? DASH;
}
