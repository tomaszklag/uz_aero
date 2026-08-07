/**
 * UZ Aero — logika ekranu 07 (zmiana załogi), czysta i testowalna bez React Native.
 *
 * Najtrudniejsze pytanie tego ekranu brzmi: „od kiedy i ile block time ma KAŻDY członek
 * załogi z osobna". Mockup pokazuje przy obu wierszach „od 08:00 · block: 2:22", ale
 * Dual mógł wejść w połowie dnia — wtedy jego block time liczy się wyłącznie z cykli
 * silnika, które zaszły PO jego wejściu. Do dokumentów każdy pilot wpisuje własny czas,
 * więc przybliżenie „wszyscy mają tyle co dzień" byłoby fałszem rozliczeniowym.
 */

import type { EpochMillis, Event, Leg, SessionState } from '../../../domain';

export interface CrewRowModel {
  role: 'PIC' | 'DUAL';
  /** Kod pilota; null = miejsce Duala puste. */
  pilotId: string | null;
  /** Od kiedy w załodze (UTC); null gdy nie dotyczy. */
  since: EpochMillis | null;
  /** Block time naliczony od wejścia do załogi (ms). */
  blockMs: number;
}

/**
 * Część cykli silnika przypadająca na okres od `since` do `now`.
 *
 * Cykl otwarty liczy się do „teraz" — dokładnie tak, jak robi to licznik na kokpicie.
 * Cykl, który zaczął się przed wejściem pilota, liczy się od momentu wejścia: pilot
 * nie zapisuje sobie czasu, przy którym go nie było.
 */
export function blockSince(
  runs: readonly Leg[],
  since: EpochMillis,
  now: EpochMillis,
): number {
  let total = 0;
  for (const run of runs) {
    const start = Math.max(run.startedAt, since);
    const end = Math.min(run.stoppedAt ?? now, now);
    if (end > start) total += end - start;
  }
  return total;
}

/**
 * Od kiedy AKTUALNY Dual jest w załodze.
 *
 * Domyślnie od początku dnia (preflight ustawia załogę), a jeśli był zmieniany —
 * od OSTATNIEGO `crew_change`, które go wprowadziło. Zdarzenia przeglądamy od końca,
 * bo interesuje nas ostatnia zmiana, nie historia wszystkich.
 */
export function dualSince(
  events: readonly Event[],
  dutyStart: EpochMillis | null,
): EpochMillis | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (e.type === 'crew_change' && e.payload.role === 'dual') {
      return e.gpsTime ?? e.deviceTime;
    }
  }
  return dutyStart;
}

/** Wiersze „Aktualna załoga" — dane, nie napisy; formatowanie należy do ekranu. */
export function crewRows(
  projection: SessionState,
  events: readonly Event[],
  now: EpochMillis,
): CrewRowModel[] {
  const picSince = projection.dutyStart;
  const rows: CrewRowModel[] = [
    {
      role: 'PIC',
      pilotId: projection.picId,
      since: picSince,
      blockMs: picSince != null ? blockSince(projection.legs, picSince, now) : 0,
    },
  ];

  const dSince = projection.dualId != null ? dualSince(events, projection.dutyStart) : null;
  rows.push({
    role: 'DUAL',
    pilotId: projection.dualId,
    since: dSince,
    blockMs: dSince != null ? blockSince(projection.legs, dSince, now) : 0,
  });

  return rows;
}

/**
 * Wartość „bez drugiego pilota" na liście wyboru.
 *
 * Sentinel zamiast `null`, bo `CardPicker` operuje na łańcuchach — a rezygnacja z Duala
 * jest pełnoprawnym wyborem (mockup ma ją jako pozycję listy), nie brakiem wyboru.
 */
export const NO_DUAL = '__none__' as const;

/**
 * Powód blokady zapisu zmiany Duala; `null` = wolno zapisać.
 *
 * Kolejność sprawdzeń odpowiada wadze: brak wyboru → wymóg załogi 2-osobowej (An-2)
 * → zmiana, która niczego nie zmienia.
 */
export function dualChangeBlocker(
  selected: string | null,
  currentDualId: string | null,
  dualRequired: boolean,
  aircraftLabel: string,
): string | null {
  if (selected == null) return 'Wybierz nowego Duala albo „Bez drugiego pilota"';
  const next = selected === NO_DUAL ? null : selected;
  if (next == null && dualRequired) {
    return `${aircraftLabel} wymaga załogi 2-osobowej — miejsce Duala nie może zostać puste`;
  }
  if (next === currentDualId) return 'Wybrany pilot już jest Dualem — nie ma czego zmieniać';
  return null;
}
