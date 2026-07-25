/**
 * UZ Aero — formatowanie do wyświetlenia (warstwa UI).
 *
 * Domena trzyma liczby (ms, litry, godziny dziesiętne); tutaj zamieniamy je na napisy.
 * Czas pokazujemy w UTC — to domyślna strefa całej aplikacji (`CLAUDE.md`, sekcja
 * „Strefa czasowa"): czas nieoznaczony = UTC, LT tylko przy meldunku.
 */

import type { EpochMillis } from '../domain';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Czas zdarzenia jako „HH:MM" UTC. */
export function timeUtc(t: EpochMillis | null): string {
  if (t == null) return '—';
  const d = new Date(t);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** Czas trwania jako „H:MM" (block time, duty). */
export function duration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(totalMin / 60)}:${pad2(totalMin % 60)}`;
}

/** Czas trwania jako „HH:MM:SS" — dla liczników odliczających na żywo. */
export function durationLong(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(totalSec / 3600), Math.floor((totalSec % 3600) / 60), totalSec % 60]
    .map(pad2)
    .join(':');
}

/**
 * Motogodziny wg formatu z konfiguracji samolotu (§5.4).
 * W danych zawsze trzymamy godziny dziesiętne; `hhmm` to wyłącznie prezentacja.
 */
export function motoHours(value: number | null, format: 'decimal' | 'hhmm' | null): string {
  if (value == null) return '—';
  if (format === 'hhmm') {
    const h = Math.floor(value);
    const m = Math.round((value - h) * 60);
    // Zaokrąglenie 59,6 min → 60 przesuwa godzinę, żeby nie wyszło „1234:60".
    return m === 60 ? `${h + 1}:00` : `${h}:${pad2(m)}`;
  }
  return value.toFixed(1);
}

/** Paliwo w litrach — bez miejsc po przecinku, bo paliwomierz i tak nie jest precyzyjny. */
export function litres(value: number | null): string {
  return value == null ? '—' : `${Math.round(value)} L`;
}
