/**
 * Ninerdeck - FILTR MASZYN osi kalendarza (21D, uwaga właściciela 2026-09-19:
 * „samolotów może być dużo - nawet kilkanaście").
 *
 * Przy kilkunastu maszynach oś przestaje odpowiadać na „co jest wolne", bo odpowiedzi
 * trzeba szukać przewijaniem. Zawężenie jest PREFERENCJĄ PATRZENIA, nie danymi klubu:
 * mieszka lokalnie per pilot i klub, jak motyw - dwóch pilotów tego samego klubu widzi
 * własny wybór i nikt nikomu nic nie chowa.
 *
 * ══ PAMIĘTAMY UKRYTE, NIE POKAZYWANE ══
 * Maszyna dokupiona przez klub ma pojawić się na osi SAMA. Gdyby zapis trzymał listę
 * pokazywanych, każdy nowy samolot byłby domyślnie niewidoczny u każdego, kto raz
 * dotknął filtra - i wyglądałby jak maszyna, której klub nie ma.
 */

import type { ReferenceAircraft } from '../../../domain';

import type { CalendarBooking } from './calendarData';

export interface FilterRowVm {
  aircraftId: string;
  reg: string;
  type: string;
  /** Wyłączenie z użytku w oglądanej dobie; `null` = maszyna dostępna. */
  tag: string | null;
  shown: boolean;
}

/**
 * Napis chipa filtra.
 *
 * Sygnał zawężenia niesie SAMA LICZBA („6 z 12" kontra „12"): pilot patrzący na krótszą
 * listę musi wiedzieć, że czegoś nie widzi - inaczej brakująca maszyna wygląda jak
 * maszyna sprzedana. Stan domyślny jest neutralny i nie krzyczy (reguła SyncChipa).
 */
export function filterLabel(shown: number, total: number): string {
  return shown === total ? String(total) : `${shown} z ${total}`;
}

/** Czy filtr cokolwiek chowa - chip świeci wtedy o stopień jaśniej. */
export function isNarrowed(shown: number, total: number): boolean {
  return shown < total;
}

/** Maszyny widoczne na osi, w kolejności floty. */
export function visibleAircraft(
  all: readonly ReferenceAircraft[],
  hidden: readonly string[],
): ReferenceAircraft[] {
  const out = new Set(hidden);
  return all.filter((a) => !out.has(a.id));
}

/** Wiersze arkusza wyboru - cała flota, także maszyny właśnie ukryte. */
export function buildFilterRows(
  all: readonly ReferenceAircraft[],
  hidden: readonly string[],
  blocks: readonly CalendarBooking[],
): FilterRowVm[] {
  const out = new Set(hidden);
  return all.map((a) => ({
    aircraftId: a.id,
    reg: a.reg,
    type: a.type,
    tag: blocks.find((b) => b.kind === 'block' && b.aircraftId === a.id)?.blockReason ?? null,
    shown: !out.has(a.id),
  }));
}

/** Przełączenie jednej maszyny w szkicu wyboru. */
export function toggleHidden(hidden: readonly string[], aircraftId: string): string[] {
  return hidden.includes(aircraftId)
    ? hidden.filter((id) => id !== aircraftId)
    : [...hidden, aircraftId];
}

/**
 * Napis przycisku zatwierdzenia: „POKAŻ 6".
 *
 * Przy wyborze pustym arkusz nie ma czego pokazać - i to jest jedyna blokada tego
 * arkusza, widoczna z listy nad przyciskiem, więc bez zdania (issue #55).
 */
export function confirmLabel(shown: number): string {
  return `POKAŻ ${shown}`;
}
