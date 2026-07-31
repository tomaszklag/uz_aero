/**
 * UZ Aero — dni z lokalnego strumienia → treść ekranu 12 (mockup `design/12-historia.html`).
 *
 * Ten sam podział co `statsDay.ts`/`syncStatus.ts`: logika prezentacji w czystych
 * funkcjach, testowalnych bez React Native.
 *
 * Ekran 12 pokazuje wyłącznie dni ZAMKNIĘTE: dzień otwarty nie jest historią, tylko
 * teraźniejszością — po restarcie wraca prosto do kokpitu (`ResumeGate`), więc karta
 * w historii robiłaby z niego dwie prawdy naraz. Podział na grupy robi okno korekty
 * (decyzja 2026-07-23): w oknie → „Możesz jeszcze poprawić" (karta klikalna),
 * po oknie → „Zamknięte".
 */

import { correctionWindow, type SessionState } from '../../../domain';
import type { HistoryDay } from '../../../application';
import { dateUtcLong, duration } from '../../format';
import { dateTimeUtcShort } from './statsDay';
import { eventsCount } from './syncStatus';

/** Karta dnia (mockup `.day-card`). */
export interface DayCardSpec {
  sessionUuid: string;
  /** „22 JUNE 2026". */
  date: string;
  aircraft: string;
  /** Loty / Block / Duty / Skoczków — kolejność z mockupu. */
  stats: { k: string; v: string }[];
  /** Tag wysyłki: zielony „Wysłane" albo amber „W kolejce · n zdarzeń". */
  sync: { label: string; pending: boolean };
}

/** Karta dnia w oknie korekty — dodatkowo termin i odliczanie. */
export interface EditableDaySpec extends DayCardSpec {
  /** „Korekta do 23 JUN 16:45". */
  deadline: string;
  /** „zostało 23 h 04 min". */
  remaining: string;
}

export interface HistoryGroups {
  editable: EditableDaySpec[];
  closed: DayCardSpec[];
}

/** „zostało 23 h 04 min" / „zostało 42 min" — zero wiodące minut jak w mockupie. */
export function remainingLabel(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return h > 0 ? `zostało ${h} h ${String(min).padStart(2, '0')} min` : `zostało ${min} min`;
}

function cardSpec(day: HistoryDay): DayCardSpec {
  const { state, pendingCount } = day;
  const dutyMs =
    state.dutyStart != null && state.dutyEnd != null ? state.dutyEnd - state.dutyStart : null;
  return {
    sessionUuid: state.sessionUuid ?? '',
    date: state.dutyStart != null ? dateUtcLong(state.dutyStart) : '—',
    aircraft: state.aircraftId ?? '—',
    stats: [
      { k: 'Loty', v: `${state.flights.length}` },
      { k: 'Block', v: duration(state.blockTimeMs) },
      { k: 'Duty', v: dutyMs != null ? duration(dutyMs) : '—' },
      { k: 'Skoczków', v: `${state.drops.totalJumpers}` },
    ],
    sync:
      pendingCount === 0
        ? { label: 'Wysłane', pending: false }
        : { label: `W kolejce · ${eventsCount(pendingCount)}`, pending: true },
  };
}

/**
 * Podział zamkniętych dni na grupy ekranu 12. Dni otwarte i sesje bez claimu
 * (śmieciowe strumienie) odpadają — patrz docblock modułu.
 */
export function buildHistory(days: HistoryDay[], now: number): HistoryGroups {
  const groups: HistoryGroups = { editable: [], closed: [] };
  for (const day of days) {
    if (day.state.sessionUuid == null || day.state.dutyEnd == null) continue;
    const window = correctionWindow(day.state, now);
    if (window.open && window.closesAt != null) {
      groups.editable.push({
        ...cardSpec(day),
        deadline: `Korekta do ${dateTimeUtcShort(window.closesAt)}`,
        remaining: remainingLabel(window.closesAt - now),
      });
    } else {
      groups.closed.push(cardSpec(day));
    }
  }
  return groups;
}

/**
 * Plakietka na przycisku „Poprzednie dni" ekranu 01 (`.history-badge`):
 * najświeższy dzień w oknie korekty → „22 JUN — można poprawić"; brak → null.
 */
export function editableBadge(days: HistoryDay[], now: number): string | null {
  for (const day of days) {
    if (day.state.dutyEnd == null || day.state.dutyStart == null) continue;
    if (correctionWindow(day.state, now).open) {
      // `dateTimeUtcShort` daje „22 JUN 16:45" — plakietka bierze samą datę.
      const label = dateTimeUtcShort(day.state.dutyStart).split(' ').slice(0, 2).join(' ');
      return `${label} — można poprawić`;
    }
  }
  return null;
}
