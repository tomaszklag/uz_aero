/**
 * UZ Aero — logika ekranu 08 (lista ręczna): grupowanie zdarzeń w cykle silnikowe.
 *
 * Mockup 08 nie pokazuje płaskiego logu, tylko dzień pocięty na CYKLE (start → stop
 * silnika) z tankowaniami między nimi. Powód jest praktyczny: pilot odtwarzający dzień
 * z pamięci myśli cyklami („drugie uruchomienie, po tankowaniu"), a nie ciągłą listą —
 * i to w cyklu widzi, którego zdarzenia brakuje.
 *
 * Wiersze OCZEKIWANE (`awaited`): aktywny cykl pokazuje z góry, czego jeszcze nie ma
 * („— · Landing · W locie…"). To nie ozdoba — to jest wprost lista tego, co pilot będzie
 * musiał dopisać ręcznie, jeśli GPS nie wykryje.
 */

import type { Event, MhFormat, SessionState } from '../../../domain';
import type { EventLogRow } from '../../components';
import { buildLogRows } from './cockpitLog';

export interface CycleGroup {
  kind: 'cycle';
  /** Numer cyklu (1-based) — badge „1 / 3". */
  index: number;
  /** Cykl bez `engine_stop` — wyróżniony i z przyciskiem dopisania. */
  active: boolean;
  rows: EventLogRow[];
  /**
   * Stopka „Uwagi · …" (§3.8). Cykle z autodetekcji uwag nie mają (null → „—");
   * dosłowna kolumna nie mieści się w 393 px — stopka per grupa to jej nośnik.
   */
  notes: string | null;
}

export interface GroundGroup {
  kind: 'ground';
  row: EventLogRow;
  /** Uwagi wpisu ręcznego (`manual_log_entry.notes`); inne zdarzenia naziemne — null. */
  notes: string | null;
}

export type LogGroup = CycleGroup | GroundGroup;

/**
 * Tnie wiersze logu (z `buildLogRows`, więc chronologiczne i z gotowymi metami) na grupy.
 *
 * Zdarzenia organizacyjne (`preflight`, `day_close` — kind `event`) pomijamy: mockup 08
 * zaczyna dzień od pierwszego uruchomienia silnika, a preflight ma własny ekran.
 * Zrzuty zostają — należą do przebiegu cyklu.
 */
export function buildLogGroups(
  events: Event[],
  projection: SessionState,
  mhFormat: MhFormat,
): LogGroup[] {
  const rows = buildLogRows(events, projection, mhFormat);
  // Uwagi niesie wyłącznie `manual_log_entry`; wiersz logu zna tylko uuid — mapka
  // spina jedno z drugim bez przemycania payloadów do warstwy wierszy.
  const notesByUuid = new Map<string, string>();
  for (const event of events) {
    if (event.type === 'manual_log_entry' && event.payload.notes != null) {
      notesByUuid.set(event.uuid, event.payload.notes);
    }
  }

  const groups: LogGroup[] = [];
  let current: CycleGroup | null = null;
  let cycleNo = 0;

  for (const row of rows) {
    if (row.kind === 'event') continue;

    if (row.kind === 'ground') {
      // Tankowanie w trakcie cyklu (silnik pracuje) formalnie nie występuje — reguła
      // domenowa je odrzuca — więc zdarzenie naziemne zawsze zamyka bieżącą grupę.
      current = null;
      groups.push({ kind: 'ground', row, notes: notesByUuid.get(row.id) ?? null });
      continue;
    }

    if (row.kind === 'start' || current == null) {
      cycleNo += 1;
      current = { kind: 'cycle', index: cycleNo, active: false, rows: [], notes: null };
      groups.push(current);
    }
    current.rows.push(row);
    if (row.kind === 'stop') current = null;
  }

  // Cykl bez `engine_stop` = aktywny; dopisujemy wiersze oczekiwane.
  const last = groups[groups.length - 1];
  if (last != null && last.kind === 'cycle' && projection.engineRunning) {
    last.active = true;
    if (projection.inFlight) {
      last.rows.push(awaitedRow('awaited-landing', 'Landing', 'W locie…'));
    }
    last.rows.push(awaitedRow('awaited-stop', 'Stop engine'));
  }

  return groups;
}

function awaitedRow(id: string, label: string, meta?: string): EventLogRow {
  return { id, kind: 'event', time: '—', label, meta, awaited: true };
}

/** Liczba cykli — badge „n / N" liczy się raz, nie w pętli renderu. */
export function cycleCount(groups: readonly LogGroup[]): number {
  return groups.filter((g) => g.kind === 'cycle').length;
}
