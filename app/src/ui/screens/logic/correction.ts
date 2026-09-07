/**
 * UZ Aero - logika ekranu 04c (korekta zdarzenia), czysta i testowalna bez RN.
 *
 * Najważniejsza jest tu rzetelność wiersza „Wpływ na czas lotu: 0:53 → 0:56". Nie
 * liczymy go „na piechotę" obok projekcji - budujemy KANDYDATA korekty, przepuszczamy
 * przez tę samą `projectSession`, którą liczy cała aplikacja, i porównujemy wyniki.
 * Dzięki temu podgląd wpływu nie może rozjechać się z tym, co korekta faktycznie zrobi.
 */

import { projectSession } from '../../../domain';
import type { Event, EventCorrectionPayload, EventType } from '../../../domain';

/** Wpływ korekty na metrykę czasu; `null` = korekta nie zmienia żadnego czasu. */
export interface CorrectionImpact {
  /** Etykieta wiersza („Wpływ na czas lotu"). */
  label: string;
  beforeMs: number;
  afterMs: number;
}

/** Syntetyczne zdarzenie korekty - tylko do podglądu, nigdy nie trafia do rejestru. */
function syntheticCorrection(target: Event, payload: EventCorrectionPayload): Event {
  return {
    uuid: '__preview__',
    sessionUuid: target.sessionUuid,
    aircraftId: target.aircraftId,
    picId: target.picId,
    dualId: target.dualId,
    type: 'event_correction',
    deviceTime: Number.MAX_SAFE_INTEGER, // „ostatnia wygrywa" - podgląd zawsze najnowszy
    gpsTime: null,
    payload,
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

/**
 * Co zmieni korekta czasu - przez podwójną projekcję (przed / po).
 *
 * Start i lądowanie ruszają czas LOTU; cykle silnika ruszają czas BLOKU (a przez §4.5
 * także oczekiwany przyrost MH). Tankowanie, zrzut i kołowanie nie wyznaczają żadnego
 * czasu - wtedy wiersza wpływu po prostu nie ma, zamiast pokazywać „0:00 → 0:00".
 */
export function correctionImpact(
  events: readonly Event[],
  target: Event,
  newTime: number,
): CorrectionImpact | null {
  const metric: 'flight' | 'block' | null =
    target.type === 'takeoff' || target.type === 'landing'
      ? 'flight'
      : target.type === 'engine_start' || target.type === 'engine_stop'
        ? 'block'
        : null;
  if (metric == null) return null;

  const before = projectSession([...events]);
  const after = projectSession([
    ...events,
    syntheticCorrection(target, { targetUuid: target.uuid, action: 'retime', newTime }),
  ]);

  return metric === 'flight'
    ? { label: 'Wpływ na czas lotu', beforeMs: before.flightTimeMs, afterMs: after.flightTimeMs }
    : { label: 'Wpływ na czas bloku', beforeMs: before.blockTimeMs, afterMs: after.blockTimeMs };
}

/**
 * Numer lotu, do którego należy zdarzenie („Landing · Lot 1") - liczony po strumieniu
 * efektywnym tak samo, jak numeruje go log cyklu. `null` dla zdarzeń spoza lotów.
 */
export function flightNumberOf(events: readonly Event[], target: Event): number | null {
  if (target.type !== 'takeoff' && target.type !== 'landing') return null;

  const t = (e: Event): number => e.gpsTime ?? e.deviceTime;
  let flights = 0;
  for (const e of [...events].sort((a, b) => t(a) - t(b))) {
    if (e.type === 'takeoff') flights += 1;
    if (e.uuid === target.uuid) return Math.max(1, flights);
  }
  return null;
}

/** Napis destrukcyjny - dopełniacz per typ („TEGO LĄDOWANIA NIE BYŁO"). */
export function voidLabelFor(type: EventType): string {
  // Rodzaj żeński poza szablonem: „TEGO DOLEWKI" kłamałoby gramatyką (issue #60).
  if (type === 'oil_add') return 'TEJ DOLEWKI NIE BYŁO';
  const noun: Partial<Record<EventType, string>> = {
    landing: 'LĄDOWANIA',
    takeoff: 'STARTU',
    taxi: 'KOŁOWANIA',
    refuel: 'TANKOWANIA',
    drop: 'ZRZUTU',
    boarding: 'ZAŁADUNKU',
    engine_start: 'URUCHOMIENIA',
    engine_stop: 'WYŁĄCZENIA',
    manual_log_entry: 'WPISU',
  };
  return `TEGO ${noun[type] ?? 'ZDARZENIA'} NIE BYŁO`;
}

/** Badge pochodzenia wpisu: autodetekcja vs pilot. `null` dla zdarzeń bez metody. */
export function methodBadgeFor(target: Event): string | null {
  const method = (target.payload as { method?: string }).method;
  if (method === 'auto') return 'auto · GPS';
  if (method === 'manual') return 'ręcznie';
  return null;
}
