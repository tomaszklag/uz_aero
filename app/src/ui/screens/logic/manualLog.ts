/**
 * UZ Aero — logika ekranu 08 (lista ręczna): grupowanie zdarzeń wokół BIEGU SILNIKA.
 *
 * Mockup 08 nie pokazuje płaskiej listy, tylko log sesji z klamrą biegu (start → stop
 * silnika) i zdarzeniami naziemnymi poza nią. Powód jest praktyczny: pilot odtwarzający
 * zapis z pamięci myśli „od uruchomienia do zgaszenia" — i to w tej klamrze widzi,
 * którego zdarzenia brakuje.
 *
 * SESJA MA DOKŁADNIE JEDEN BIEG (pivot 2026-08-10, `SESSION_ALREADY_RAN`), więc grup
 * biegu jest tu zwykle jedna, a nazwa „cykl" i licznik „2 / 3" wypadły ze słownika
 * razem z modelem, w którym dzień był kontenerem na wiele uruchomień. Pętla nadal
 * potrafi zwrócić kilka grup i to jest świadome: projekcja musi opisać także strumień
 * ZŁAMANY (ta sama zasada, co w `projectPilotDay`) — dwa biegi dadzą dwie grupy,
 * a nie cichą utratę drugiego. Wiele LOTÓW w jednym biegu jest normą, nie wyjątkiem.
 *
 * Wiersze OCZEKIWANE (`awaited`): bieg aktywny pokazuje z góry, czego jeszcze nie ma
 * („— · Landing · W locie…"). To nie ozdoba — to jest wprost lista tego, co pilot będzie
 * musiał dopisać ręcznie, jeśli GPS nie wykryje.
 */

import type { Event, MhFormat, SessionState } from '../../../domain';
import type { EventLogRow } from '../../components';
import { buildLogRows } from './cockpitLog';

export interface RunGroup {
  kind: 'run';
  /** Numer biegu (1-based). Widoczny TYLKO przy strumieniu złamanym — patrz `runCount`. */
  index: number;
  /** Bieg bez `engine_stop` — wyróżniony i z przyciskiem dopisania. */
  active: boolean;
  rows: EventLogRow[];
  /**
   * Stopka „Uwagi · …" (§3.8). Biegi z autodetekcji uwag nie mają (null → „—");
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

export type LogGroup = RunGroup | GroundGroup;

/**
 * Tnie wiersze logu (z `buildLogRows`, więc chronologiczne i z gotowymi metami) na grupy.
 *
 * Zdarzenia organizacyjne (`preflight`, `day_close` — kind `event`) pomijamy: mockup 08
 * zaczyna log od pierwszego uruchomienia silnika, a preflight ma własny ekran.
 * Zrzuty zostają — należą do przebiegu biegu.
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
  let current: RunGroup | null = null;
  let runNo = 0;

  for (const row of rows) {
    if (row.kind === 'event') continue;

    if (row.kind === 'ground') {
      // Tankowanie w trakcie biegu (silnik pracuje) formalnie nie występuje — reguła
      // domenowa je odrzuca — więc zdarzenie naziemne zawsze zamyka bieżącą grupę.
      current = null;
      groups.push({ kind: 'ground', row, notes: notesByUuid.get(row.id) ?? null });
      continue;
    }

    if (row.kind === 'start' || current == null) {
      runNo += 1;
      current = { kind: 'run', index: runNo, active: false, rows: [], notes: null };
      groups.push(current);
    }
    current.rows.push(row);
    if (row.kind === 'stop') current = null;
  }

  // Bieg bez `engine_stop` = aktywny; dopisujemy wiersze oczekiwane.
  const last = groups[groups.length - 1];
  if (last != null && last.kind === 'run' && projection.engineRunning) {
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

/**
 * Liczba biegów silnika w sesji — liczona raz, nie w pętli renderu.
 *
 * Poprawna sesja daje 1, więc numeracja („2 / 3") jest tu OSTRZEŻENIEM, nie ozdobą:
 * ekran pokazuje ją wyłącznie wtedy, gdy strumień niesie więcej niż jeden bieg.
 */
export function runCount(groups: readonly LogGroup[]): number {
  return groups.filter((g) => g.kind === 'run').length;
}
