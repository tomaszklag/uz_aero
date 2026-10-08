/**
 * Ninerdeck - logika ekranu 07 (zmiana załogi), czysta i testowalna bez React Native.
 *
 * Najtrudniejsze pytanie tego ekranu brzmi: „od kiedy i ile block time ma KAŻDY członek
 * załogi z osobna". Mockup pokazuje przy obu wierszach „od 08:00 · block: 2:22", ale
 * Dual mógł wejść w połowie dnia - wtedy jego block time liczy się wyłącznie z cykli
 * silnika, które zaszły PO jego wejściu. Do dokumentów każdy pilot wpisuje własny czas,
 * więc przybliżenie „wszyscy mają tyle co dzień" byłoby fałszem rozliczeniowym.
 */

import type { EpochMillis, Event, Leg, SessionState } from '../../../domain';

export interface CrewRowModel {
  /** Napis roli w wierszu - po polsku, jak w całej aplikacji (2026-10-08). */
  role: 'Dowódca' | 'Drugi pilot';
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
 * Cykl otwarty liczy się do „teraz" - dokładnie tak, jak robi to licznik na kokpicie.
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
 * Domyślnie od przejęcia samolotu (preflight ustawia załogę), a jeśli był zmieniany -
 * od OSTATNIEGO `crew_change`, które go wprowadziło. Zdarzenia przeglądamy od końca,
 * bo interesuje nas ostatnia zmiana, nie historia wszystkich.
 */
export function dualSince(
  events: readonly Event[],
  claimedAt: EpochMillis | null,
): EpochMillis | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (e.type === 'crew_change' && e.payload.role === 'dual') {
      return e.gpsTime ?? e.deviceTime;
    }
  }
  return claimedAt;
}

/** Wiersze „Aktualna załoga" - dane, nie napisy; formatowanie należy do ekranu. */
export function crewRows(
  projection: SessionState,
  events: readonly Event[],
  now: EpochMillis,
): CrewRowModel[] {
  // Od PRZEJĘCIA samolotu, nie od meldunku: załoga dotyczy tej maszyny, a klamra służby
  // należy do pilota i po §3.6a bywa pusta. `claimedAt` jest tu jedyną godziną, która
  // zawsze istnieje i naprawdę odpowiada na „od kiedy prowadzisz ten samolot".
  const picSince = projection.claimedAt;
  const rows: CrewRowModel[] = [
    {
      role: 'Dowódca',
      pilotId: projection.picId,
      since: picSince,
      blockMs: picSince != null ? blockSince(projection.legs, picSince, now) : 0,
    },
  ];

  const dSince = projection.dualId != null ? dualSince(events, projection.claimedAt) : null;
  rows.push({
    role: 'Drugi pilot',
    pilotId: projection.dualId,
    since: dSince,
    blockMs: dSince != null ? blockSince(projection.legs, dSince, now) : 0,
  });

  return rows;
}

/**
 * Wartość „bez drugiego pilota" na liście wyboru.
 *
 * Sentinel zamiast `null`, bo `CardPicker` operuje na łańcuchach - a rezygnacja z Duala
 * jest pełnoprawnym wyborem (mockup ma ją jako pozycję listy), nie brakiem wyboru.
 */
export const NO_DUAL = '__none__' as const;

/**
 * Powód blokady zapisu zmiany drugiego pilota; `null` = ten powód nie stoi na drodze.
 *
 * Zdanie dostaje WYŁĄCZNIE wymóg załogi dwuosobowej - blokada, której nie widać z samej
 * listy. Pusty wybór i wybór, który niczego nie zmienia (`dualChangeUnchanged`), blokują
 * bez zdania: oba widać na liście tuż nad przyciskiem (wąski wyjątek issue #55).
 */
export function dualChangeBlocker(
  selected: string | null,
  currentDualId: string | null,
  dualRequired: boolean,
  aircraftLabel: string,
): string | null {
  if (selected == null) return null;
  const next = selected === NO_DUAL ? null : selected;
  if (next == null && currentDualId != null && dualRequired) {
    return `${aircraftLabel} wymaga załogi dwuosobowej - wybierz drugiego pilota.`;
  }
  return null;
}

/** Wybór, który zostawia załogę taką, jaka jest - zapis nie miałby czego zapisać. */
export function dualChangeUnchanged(selected: string | null, currentDualId: string | null): boolean {
  if (selected == null) return false;
  return (selected === NO_DUAL ? null : selected) === currentDualId;
}
