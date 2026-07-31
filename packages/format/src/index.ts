/**
 * UZ Aero — formatowanie do wyświetlenia (warstwa UI).
 *
 * Domena trzyma liczby (ms, litry, godziny dziesiętne); tutaj zamieniamy je na napisy.
 * Czas pokazujemy w UTC — to domyślna strefa całej aplikacji (`CLAUDE.md`, sekcja
 * „Strefa czasowa"): czas nieoznaczony = UTC, LT tylko przy meldunku.
 */

import type { EpochMillis } from '@uzaero/domain';

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
 * Wpis godziny w trakcie pisania → „HH:MM". Dwukropek stawia maska, nie pilot.
 *
 * Powód: klawiatura numeryczna Androida nie ma dwukropka, a pełna QWERTY dla czterech
 * cyfr to zła zamiana — zajmuje pół ekranu i podstawia podpowiedzi słownikowe. Pilot
 * wbija „0800", maska pokazuje „08:00" (zgłoszenie z urządzenia: arkusz godziny meldunku).
 *
 * Liczą się wyłącznie cyfry i tylko cztery pierwsze — resztę ucinamy, zamiast pozwolić
 * na „08:0012". Wpis krótszy zostaje krótki („08:0"), bo to normalny stan w połowie
 * pisania; o tym, czy wartość ma sens, orzeka `parseTimeUtcOnDay`.
 */
export function maskTimeUtcInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * „08:00" → znacznik czasu tego samego dnia UTC (`reference` daje dzień lotny).
 *
 * Pilot wpisuje godzinę, nie datę — meldunek i zakończenie duty należą do dnia, który
 * właśnie poprawia, więc datę bierzemy z wartości sprzed edycji, a nie z „teraz".
 * `null` = wpis nieczytelny; wołający ma wtedy zablokować zapis (§6 pkt 3: nigdy cichy błąd).
 */
export function parseTimeUtcOnDay(text: string, reference: EpochMillis): EpochMillis | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 23) return null;

  const day = new Date(reference);
  return Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    hours,
    Number(match[2]),
  );
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

/**
 * Polska liczba mnoga: 1 → `one`, 2–4 (poza 12–14) → `few`, reszta → `many`.
 * Mieszka tu (nie w helperze jednego ekranu), bo odmieniają: ekran 11, 12, zamek 00,
 * ustawienia 13 i komponenty DS (`OutboxGuard`).
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** „1 zdarzenie" / „3 zdarzenia" / „12 zdarzeń". */
export function eventsCount(n: number): string {
  return `${n} ${plural(n, 'zdarzenie', 'zdarzenia', 'zdarzeń')}`;
}

/**
 * Pozycja jako „50°04.7'N 019°47.1'E" — stopnie i minuty dziesiętne (mockup 13).
 *
 * Format lotniczy, nie geodezyjny: mapy lotnicze i GPS-y pokładowe używają właśnie
 * DDM (stopnie + minuty z dziesiętną), więc pilot porówna wartość wzrokiem 1:1.
 */
export function formatLatLon(lat: number, lon: number): string {
  const part = (value: number, positive: string, negative: string, degWidth: number): string => {
    const hemi = value >= 0 ? positive : negative;
    const abs = Math.abs(value);
    const deg = Math.floor(abs);
    const min = (abs - deg) * 60;
    return `${String(deg).padStart(degWidth, '0')}°${min.toFixed(1).padStart(4, '0')}'${hemi}`;
  };
  return `${part(lat, 'N', 'S', 2)} ${part(lon, 'E', 'W', 3)}`;
}

/**
 * Czas trwania jako „HH:MM" Z WIODĄCYM ZEREM — format czasów z mockupu 10 (statystyki)
 * i kart arkusza (§4.7).
 *
 * ISTNIEJE OBOK `duration`, KTÓRA DAJE „H:MM" BEZ ZERA, I TO NIE JEST NIEDOPATRZENIE.
 * Każda z nich jest wierna innemu zatwierdzonemu mockupowi: kokpit, koniec dnia
 * i historia pokazują `6:39`, a ekran statystyk i wyeksportowana karta `06:39`.
 * Scalenie ich „w ramach porządków" zepsułoby jeden z dwóch — dlatego obie mają
 * własną nazwę i własny komentarz, zamiast jednej funkcji z flagą, którą ktoś
 * kiedyś ustawi odwrotnie.
 */
export function hhmm(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return `${pad2(Math.floor(totalMin / 60))}:${pad2(totalMin % 60)}`;
}
