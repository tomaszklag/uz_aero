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

import { applyCorrections } from '../../../domain';
import type { Event, EventOf, MhFormat, SessionState } from '../../../domain';
import type { DayCycleSection, DaySection, EventLogRow, LogChip, LogKind } from '../../components';
import { duration, durationLong, litres, motoHours, timeUtc } from '../../format';

const LABEL: Record<string, string> = {
  session_claim: 'Przejęcie samolotu',
  engine_start: 'Start engine',
  engine_stop: 'Stop engine',
  taxi: 'Taxi',
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
  taxi: 'taxi',
  takeoff: 'takeoff',
  landing: 'landing',
  refuel: 'ground',
  crew_change: 'ground',
  manual_log_entry: 'ground',
};

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): number => e.gpsTime ?? e.deviceTime;

/** Chip zrzutu: liczba skoczków i wysokość — tak jak w mockupie 05. */
function dropChip(payload: EventOf<'drop'>['payload']): LogChip {
  const jumpers = payload.jumpers.tandem + payload.jumpers.aff + payload.jumpers.solo;
  const parts = [`${jumpers} skoczków`];
  if (payload.altitudeFt != null) parts.push(`${Math.round(payload.altitudeFt)} ft`);
  return { label: parts.join(' · '), tone: 'blue' };
}

/**
 * Buduje wiersze logu w porządku **chronologicznym** (najstarsze u góry, jak w mockupie —
 * oś czasu czyta się z góry na dół, a szyna cyklu wymaga sąsiedztwa start → stop).
 */
export function buildLogRows(
  events: Event[],
  projection: SessionState,
  mhFormat: MhFormat,
): EventLogRow[] {
  // Log pokazuje strumień EFEKTYWNY (po korektach 04c) — te same czasy, które liczy
  // projekcja. Surowe czasy istnieją tylko w rejestrze; pokazywanie ich obok
  // poprawionych myliłoby, a serwer i tak dostaje pełną historię.
  const ordered = applyCorrections(events).sort((a, b) => at(a) - at(b));
  const rows: EventLogRow[] = [];

  let mhCursor = projection.mh.start;
  let openStart: number | null = null;
  let openTakeoff: number | null = null;
  let fuelShown = false;
  /** Indeks wiersza kołowania czekającego na czas trwania (dopisywany przy starcie). */
  let openTaxi: number | null = null;
  /** Czasy kołowań pod indeksem wiersza — potrzebne do policzenia różnicy przy starcie. */
  const taxiTimes: Record<number, number> = {};

  for (const event of ordered) {
    // Zdarzenia organizacyjne nie są przebiegiem dnia — nie zaśmiecamy nimi osi czasu.
    // Preflight też zostaje poza logiem: odczyty początkowe ustala się wyłącznie
    // stepperami 02a i potwierdzeniem 03, a wiersz dawałby im ołówek korekty 04c.
    // Jego MH i paliwo niesie pierwszy `engine_start` (mockup 04); świeży dzień
    // zaczyna od pustej osi (04a).
    if (event.type === 'session_claim' || event.type === 'preflight_confirm') continue;

    const time = timeUtc(at(event));
    const base = {
      id: event.uuid,
      time,
      label: LABEL[event.type] ?? event.type,
      kind: KIND[event.type] ?? ('event' as LogKind),
      pending: event.syncedAt == null,
    };

    switch (event.type) {
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

      case 'taxi': {
        openTaxi = rows.length; // zapamiętujemy wiersz, żeby dopisać mu czas po starcie
        taxiTimes[openTaxi] = at(event);
        rows.push(base);
        break;
      }

      case 'takeoff': {
        openTakeoff = at(event);
        // Kołowanie trwa DO startu (mockup: „13:11 · Taxi · 0:13" i „13:24 · Takeoff").
        // Czasu nie da się podać w chwili kołowania — dopisujemy go, gdy lot rusza.
        if (openTaxi != null) {
          const taxiRow = rows[openTaxi]!;
          const taxiAt = taxiTimes[openTaxi];
          if (taxiAt != null) taxiRow.meta = duration(at(event) - taxiAt);
          openTaxi = null;
        }
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
        // Mockup 04 trzyma w etykiecie samo „Tankowanie", a liczby po prawej:
        // „+48 L · 10:48". Doklejanie stanu do etykiety rozpychało wiersz i dublowało
        // informację, którą i tak niesie następny `engine_start`.
        rows.push({ ...base, meta: `+${Math.round(event.payload.addedL)} L` });
        break;
      }

      case 'drop': {
        rows.push({ ...base, kind: 'drop', chips: [dropChip(event.payload)] });
        break;
      }

      default:
        rows.push(base);
    }
  }

  return rows;
}

/**
 * Log dnia pocięty na sekcje do zwijania (mockup 04 `.cycle-head`): cykl START→…→STOP
 * jako całość z nagłówkiem-podsumowaniem, zdarzenia naziemne między cyklami luzem.
 *
 * Wszystko w nagłówku pochodzi z gotowych wierszy `buildLogRows` — czasy, blok
 * i MH mają jedno źródło, więc zwinięty nagłówek nie może rozjechać się z tym,
 * co pilot zobaczy po rozwinięciu.
 */
export function buildDaySections(
  events: Event[],
  projection: SessionState,
  mhFormat: MhFormat,
): DaySection[] {
  const sections: DaySection[] = [];
  let current: DayCycleSection | null = null;
  let no = 0;

  for (const row of buildLogRows(events, projection, mhFormat)) {
    if (row.kind === 'start') {
      no += 1;
      current = {
        kind: 'cycle',
        id: row.id,
        no,
        range: `${row.time}–…`,
        takeoffs: 0,
        block: null,
        closed: false,
        pending: row.pending === true,
        rows: [row],
      };
      sections.push(current);
      continue;
    }

    if (current != null && !current.closed) {
      current.rows.push(row);
      if (row.pending === true) current.pending = true;
      if (row.kind === 'takeoff') current.takeoffs += 1;
      if (row.kind === 'stop') {
        current.closed = true;
        current.range = `${current.rows[0]!.time}–${row.time}`;
        current.block = row.meta ?? null;
      }
      continue;
    }

    sections.push({ kind: 'loose', row });
  }

  return sections;
}

/**
 * Log **bieżącego cyklu** (mockup 05 `.cycle-log`): zdarzenia od ostatniego `engine_start`,
 * podzielone separatorami na kolejne loty, zakończone wierszem „na żywo".
 *
 * Dlaczego osobno od logu dnia: w powietrzu interesuje wyłącznie ten cykl, a podział na
 * loty jest tu konieczny — przy sześciu wyniesieniach w jednym cyklu bez separatorów nie
 * widać, do którego lotu należy zrzut i które lądowanie go zamyka.
 */
export function buildCycleRows(
  events: Event[],
  projection: SessionState,
  mhFormat: MhFormat,
  now: number,
): EventLogRow[] {
  const ordered = [...events].sort((a, b) => at(a) - at(b));

  // Cykl zaczyna się od ostatniego uruchomienia silnika, które nie zostało zamknięte.
  let cycleStart = -1;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (ordered[i]!.type === 'engine_start') {
      cycleStart = i;
      break;
    }
  }
  if (cycleStart < 0) return [];

  const rows = buildLogRows(ordered.slice(cycleStart), projection, mhFormat);

  // Separator przed każdym startem — pierwszy lot cyklu też go dostaje.
  let flightNo = 0;
  for (const row of rows) {
    if (row.kind === 'takeoff') {
      flightNo += 1;
      row.section = `Lot ${flightNo}`;
    }
  }

  // Wiersz „na żywo": licznik od startu, gdy w powietrzu, albo od uruchomienia silnika.
  const since = projection.openTakeoffAt ?? projection.openEngineStartAt;
  if (since != null) {
    rows.push({
      id: 'live',
      kind: 'live',
      time: durationLong(now - since),
      label: projection.inFlight ? 'In flight…' : 'Silnik pracuje…',
    });
  }

  return rows;
}
