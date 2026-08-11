/**
 * UZ Aero — dni z lokalnego strumienia → treść ekranu 12 (mockup `design/12-historia.html`).
 *
 * Ten sam podział co `statsDay.ts`/`syncStatus.ts`: logika prezentacji w czystych
 * funkcjach, testowalnych bez React Native.
 *
 * Ekran 12 pokazuje wyłącznie sesje ZDANE: trzymany samolot nie jest historią, tylko
 * teraźniejszością — po restarcie wznowienie prowadzi prosto do kokpitu
 * (`navigation/resumeTarget.ts`), więc karta w historii robiłaby z niego dwie prawdy
 * naraz. Podział na grupy robi okno korekty (decyzja 2026-07-23): w oknie → „Możesz
 * jeszcze poprawić" (karta klikalna), po oknie → „Zamknięte".
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
  /** Loty / Block / Sesja / Skoczków — „Duty" ustąpiło czasowi trzymania maszyny (§3.6a). */
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
  // Karta opisuje SESJĘ SAMOLOTU, więc jej miarą jest czas trzymania maszyny:
  // przejęcie → zdanie. Do 2026-08-07 stała tu „Duty" liczone z klamry służby, co po
  // §3.6a jest pomyłką kategorii — służba należy do PILOTA i potrafi objąć kilka maszyn,
  // więc przypisanie jej do jednej sesji kłamałoby przy każdej przesiadce.
  const heldMs =
    state.claimedAt != null && state.closedAt != null ? state.closedAt - state.claimedAt : null;
  return {
    sessionUuid: state.sessionUuid ?? '',
    date: state.claimedAt != null ? dateUtcLong(state.claimedAt) : '—',
    aircraft: state.aircraftId ?? '—',
    stats: [
      { k: 'Loty', v: `${state.flights.length}` },
      { k: 'Block', v: duration(state.blockTimeMs) },
      { k: 'Sesja', v: heldMs != null ? duration(heldMs) : '—' },
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
    // Warunkiem jest ZDANIE samolotu (`closed`), nie klamra służby. Do 2026-08-07 stało
    // tu `dutyEnd == null` i po §3.6a znaczyło coś zupełnie innego, niż miało: ekran
    // „Zdaj samolot" `dutyEnd` NIE WYSYŁA, więc poprawnie zdana sesja wypadała z historii
    // W CAŁOŚCI — a to jedyny ekran, z którego pilot dosięga okna korekty.
    if (day.state.sessionUuid == null || !day.state.closed) continue;
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
    // Warunkiem jest OTWARTE OKNO, nie obecność klamry służby. Po §3.6a okno kotwiczy się
    // we wzlocie, więc `correctionWindow` odpowiada samo — a wymóg `dutyEnd`/`dutyStart`
    // wyciszał plakietkę na każdej sesji bez deklaracji, czyli na prawie każdej.
    if (day.state.claimedAt == null) continue;
    if (correctionWindow(day.state, now).open) {
      // `dateTimeUtcShort` daje „22 JUN 16:45" — plakietka bierze samą datę.
      const label = dateTimeUtcShort(day.state.claimedAt).split(' ').slice(0, 2).join(' ');
      return `${label} — można poprawić`;
    }
  }
  return null;
}
