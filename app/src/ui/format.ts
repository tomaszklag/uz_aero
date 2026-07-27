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

/**
 * Czas lokalny urządzenia jako „HH:MM" — WYŁĄCZNIE jako wartość drugorzędna przy
 * meldunku (`CLAUDE.md`: „LT tylko jako wartość drugorzędna"). Mockup pokazuje scenariusz
 * UTC+2; tutaj bierzemy prawdziwą strefę telefonu, bo to ona odpowiada na pytanie pilota
 * „która to u mnie godzina".
 */
export function timeLocal(t: EpochMillis | null): string {
  if (t == null) return '—';
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const MONTHS_UTC = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

/** Data dnia lotnego jako „22 JUNE 2026" (UTC) — badge z mockupu 02. */
export function dateUtcLong(t: EpochMillis): string {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS_UTC[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
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

/**
 * Odwrotność `motoHours` — wpis pilota na godziny dziesiętne.
 *
 * Przyjmujemy oba zapisy niezależnie od skonfigurowanego formatu, bo pilot przepisuje
 * to, co widzi na liczniku, a nie to, co ustawił administrator: „1234:30" i „1234,5"
 * mają znaczyć to samo. Przecinek jest równoprawny z kropką (klawiatura PL).
 * `null` = wpis nieczytelny; wołający ma wtedy zablokować zapis, a nie zgadywać.
 */
export function parseMotoHours(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (cleaned.length === 0) return null;

  const hhmm = /^(\d+):([0-5]?\d)$/.exec(cleaned);
  if (hhmm) return Number(hhmm[1]) + Number(hhmm[2]) / 60;

  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Wpis litrów → liczba. `null` gdy wpis nie jest liczbą (blokuje zapis). */
export function parseLitres(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * „Tomasz Małkiewicz" → „T. Małkiewicz".
 *
 * Skrót imienia z podsumowań (mockup 03): w dwukolumnowej siatce pełne imię i nazwisko
 * łamie kolumnę, a nazwisko wystarcza do rozpoznania. Jednoczłonowe zostawiamy w całości.
 */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  return `${parts[0]![0]!.toUpperCase()}. ${parts.slice(1).join(' ')}`;
}

/** Paliwo w litrach — bez miejsc po przecinku, bo paliwomierz i tak nie jest precyzyjny. */
export function litres(value: number | null): string {
  return value == null ? '—' : `${Math.round(value)} L`;
}
