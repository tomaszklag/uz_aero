/**
 * UZ Aero — zdarzenia dnia → wiersze logu (mockup 04 `.day-log`).
 *
 * Osobny moduł, bo to jedyna nietrywialna logika prezentacji w kokpicie i jedyna,
 * którą da się przetestować bez React Native.
 *
 * Co jest tu wyliczane, a czego świadomie NIE ma:
 *  • **Chip MH** przy starcie/stopie silnika liczymy z łańcucha (§4.5): odczyt początkowy
 *    plus zsumowany czas bloku. Inwariant „Δ MH = block time" jest sprawdzany w
 *    `projections.test.ts`, więc to wyliczenie, a nie zgadywanie.
 *  • **Chip paliwa** pokazujemy WYŁĄCZNIE tam, gdzie paliwo faktycznie się zmieniło:
 *    przy odczycie początkowym i przy tankowaniu. Mockup ma go przy każdym cyklu, ale
 *    my nie mamy pomiaru zużycia w locie — dopisanie tam liczby byłoby zmyślaniem
 *    danych, a `CLAUDE.md` stawia licznik fizyczny ponad szacunkami.
 */

import type { Event, MhFormat, SessionState } from '../../domain';
import type { EventLogRow, LogKind } from '../components';
import { duration, litres, motoHours, timeUtc } from '../format';

const LABEL: Record<string, string> = {
  session_claim: 'Przejęcie samolotu',
  preflight_confirm: 'Preflight',
  engine_start: 'Start engine',
  engine_stop: 'Stop engine',
  takeoff: 'Takeoff',
  landing: 'Landing',
  drop: 'Zrzut',
  refuel: 'Tankowanie',
  crew_change: 'Zmiana załogi',
  manual_log_entry: 'Wpis ręczny',
  day_close: 'Zamknięcie dnia',
};

const KIND: Record<string, LogKind> = {
  engine_start: 'start',
  engine_stop: 'stop',
  takeoff: 'takeoff',
  landing: 'landing',
  refuel: 'ground',
  crew_change: 'ground',
  manual_log_entry: 'ground',
};

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): number => e.gpsTime ?? e.deviceTime;

/**
 * Buduje wiersze logu w porządku **chronologicznym** (najstarsze u góry, jak w mockupie —
 * oś czasu czyta się z góry na dół, a szyna cyklu wymaga sąsiedztwa start → stop).
 */
export function buildLogRows(
  events: Event[],
  projection: SessionState,
  mhFormat: MhFormat,
): EventLogRow[] {
  const ordered = [...events].sort((a, b) => at(a) - at(b));
  const rows: EventLogRow[] = [];

  let mhCursor = projection.mh.start;
  let openStart: number | null = null;
  let openTakeoff: number | null = null;
  let fuelShown = false;

  for (const event of ordered) {
    // Zdarzenia organizacyjne nie są przebiegiem dnia — nie zaśmiecamy nimi osi czasu.
    if (event.type === 'session_claim') continue;

    const time = timeUtc(at(event));
    const base = {
      id: event.uuid,
      time,
      label: LABEL[event.type] ?? event.type,
      kind: KIND[event.type] ?? ('event' as LogKind),
      pending: event.syncedAt == null,
    };

    switch (event.type) {
      case 'preflight_confirm': {
        rows.push({
          ...base,
          kind: 'event',
          chips: [
            { label: `MH ${motoHours(event.payload.reading.mh, mhFormat)}` },
            { label: litres(event.payload.reading.fuelL), tone: 'amber' },
          ],
        });
        fuelShown = true;
        break;
      }

      case 'engine_start': {
        openStart = at(event);
        const chips: EventLogRow['chips'] = [];
        if (mhCursor != null) chips.push({ label: `MH ${motoHours(mhCursor, mhFormat)}` });
        if (!fuelShown && projection.fuel.startL != null) {
          chips.push({ label: litres(projection.fuel.startL), tone: 'amber' });
          fuelShown = true;
        }
        rows.push({ ...base, chips });
        break;
      }

      case 'engine_stop': {
        const blockMs = openStart != null ? at(event) - openStart : null;
        // Licznik motogodzin chodzi z silnikiem — o tyle przesuwa się łańcuch (§4.5).
        if (mhCursor != null && blockMs != null) mhCursor += blockMs / 3_600_000;
        openStart = null;
        rows.push({
          ...base,
          meta: blockMs != null ? `blok ${duration(blockMs)}` : undefined,
          chips: mhCursor != null ? [{ label: `MH ${motoHours(mhCursor, mhFormat)}` }] : undefined,
        });
        break;
      }

      case 'takeoff': {
        openTakeoff = at(event);
        rows.push(base);
        break;
      }

      case 'landing': {
        const flightMs = openTakeoff != null ? at(event) - openTakeoff : null;
        openTakeoff = null;
        rows.push({ ...base, meta: flightMs != null ? duration(flightMs) : undefined });
        break;
      }

      case 'refuel': {
        rows.push({
          ...base,
          label: `${base.label} · ${litres(event.payload.afterL)} po dolaniu`,
          meta: `+${Math.round(event.payload.addedL)} L`,
        });
        break;
      }

      case 'drop': {
        rows.push({
          ...base,
          kind: 'event',
          meta: `${event.payload.jumpers.tandem + event.payload.jumpers.aff + event.payload.jumpers.solo} skoczków`,
        });
        break;
      }

      default:
        rows.push(base);
    }
  }

  return rows;
}
