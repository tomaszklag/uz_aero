/**
 * UZ Aero - panel 2.0: DZIENNIK, unieważnienie CAŁEGO wpisu - warstwa czysta.
 *
 * ══ PYTANIE NIE MOŻE BRZMIEĆ „UNIEWAŻNIĆ TĘ SESJĘ?" ══
 * Dwa wpisy tej samej maszyny w jednej dobie różnią się WYŁĄCZNIE godzinami, a wejście
 * w sesję bywa wklejonym linkiem. Potwierdzenie musi więc nazwać KONKRETNY wpis: dzień,
 * bieg silnika, pilota i to, ile z tej sesji wychodzi lotów i czasu blokowego.
 *
 * Fakty składamy z `sessionRow` - tego samego kształtu, który stoi w gridzie poziomu 2.
 * Drugie formatowanie tych samych wartości rozjechałoby się przy pierwszej poprawce
 * jednej z kopii, i to w miejscu, w którym człowiek podejmuje decyzję nieodwracalną.
 */

import type { SessionListItemDto } from '../../api/dto';
import { sessionRow } from './sessionRows';

/** Wiersz odniesienia w potwierdzeniu: co dokładnie zniknie z rachunków. */
export interface VoidFact {
  label: string;
  value: string;
}

const NONE = '—';

export function voidFacts(s: SessionListItemDto): VoidFact[] {
  const row = sessionRow(s);
  return [
    { label: 'Dzień', value: row.day },
    { label: 'Silnik', value: `${row.engine.from} → ${row.engine.to}` },
    { label: 'Pilot', value: row.pic },
    { label: 'Loty', value: row.flights },
    // Kreska, nie zero: sesja bez biegu silnika nie ma czasu blokowego, a `0:00`
    // czytałoby się jak zmierzone zero (reguła „brak odczytu zostaje brakiem").
    { label: 'Czas blokowy', value: row.engine.note ?? NONE },
  ];
}
