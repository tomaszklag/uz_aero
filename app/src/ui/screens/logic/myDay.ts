/**
 * UZ Aero — model widoku ekranu 01 „Mój dzień" (`design/01-moj-dzien.html`, issue #23).
 *
 * Czysta warstwa między projekcją dnia pilota (`projectPilotDay`) a widokiem: bierze
 * `PilotDay` i oddaje gotowe napisy oraz stany, których ekran nie musi już wyliczać.
 * Zero React, zero zegara systemowego.
 *
 * REGUŁA, KTÓRĄ TEN MODUŁ CZYNI WIDOCZNĄ: do pilota w danej dobie przypisana jest
 * LISTA SESJI — płaska oś czasu, posortowana po uruchomieniu silnika, z rejestracją
 * jako informacją kafelka (issue #23 pkt 3: grupowanie po samolocie kłamało o przebiegu
 * dnia przy każdej przesiadce). Klamra służby — meldunek, koniec, suma „Służba",
 * „Zamknij dzień" — została usunięta W CAŁOŚCI razem z modelem (issue #23 pkt 2):
 * ta wielkość niczego nie mierzyła. Dnia się nie otwiera i nie zamyka.
 *
 * SESJA JEST KAFELKIEM, NIE WIERSZEM TABELI (issue #42, 2026-08-13): kształt przychodzi
 * z `sessionCard.ts`, wspólnego z „Poprzednimi dniami" (12). Ten moduł dokłada tylko to,
 * co na 01 jest inne — nagłówkiem kafelka jest NUMER SESJI w dobie, bo data stoi
 * w nagłówku ekranu i na każdym kafelku powtarzałaby to samo.
 */

import { duration } from '../../format';
import type { PilotDay } from '../../../domain';
import { type SessionCardVm, sessionStats, sessionTimes } from './sessionCard';

export interface MyDayVm {
  /** Płaska oś czasu sesji doby — już posortowana i ponumerowana przez projekcję. */
  sessions: SessionCardVm[];
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
      // Numer w dobie zastąpił kolumnę `.leg-num` starej tabeli: niesie kolejność,
      // której same godziny nie niosą, gdy pilot przegląda listę kątem oka.
      title: `SESJA ${session.index}`,
      aircraft: session.aircraftId,
      times: sessionTimes(session.startedAt, session.stoppedAt),
      stats: sessionStats(session.flightCount, session.blockMs, session.flightMs),
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

/** Przycisk pasa akcji ekranu 01 — decyzja o TREŚCI, nie o wyglądzie. */
export interface MyDayAction {
  id: 'start' | 'manual';
  label: string;
  /** Akcja główna dnia (zielona, pełna) — najwyżej JEDNA na ekranie. */
  primary: boolean;
}

/**
 * Co da się zrobić z poziomu „Mój dzień".
 *
 * ══ DLACZEGO TO JEST REGUŁA, A NIE `empty ? A : B` W JSX ══
 * Bo pierwsza wersja tego warunku miała dziurę i nikt jej nie zauważył: pusty dzień
 * dostawał WYŁĄCZNIE „ROZPOCZNIJ LOT", więc pilot, który przyleciał bez telefonu
 * (padła bateria, aparat został w kurtce) i nie ma dziś ANI JEDNEJ sesji, nie miał jak
 * wpisać lotu — a to jest dokładnie ta sytuacja, w której wpis ręczny powstał (§3.8,
 * mockup 15). Wejście znikało w stanie, w którym jest najbardziej potrzebne.
 *
 * Zmienia się WAGA przycisku, nie jego obecność: przy pustym dniu „ROZPOCZNIJ LOT" jest
 * akcją główną (zielone, pełne), przy dniu z sesjami oba są drugorzędne — bo wtedy
 * dopisanie kolejnej sesji nie jest niczym wyjątkowym.
 */
export function myDayActions(empty: boolean): MyDayAction[] {
  return [
    { id: 'start', label: 'ROZPOCZNIJ LOT', primary: empty },
    { id: 'manual', label: 'DODAJ LOT RĘCZNIE', primary: false },
  ];
}
