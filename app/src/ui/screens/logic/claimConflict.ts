/**
 * Ninerdeck - CUDZA REZERWACJA NA MASZYNĘ, KTÓRĄ PILOT BIERZE (23A, #162 F9).
 *
 * ══ BANER, NIGDY BLOKADA ══
 * (§2.3, decyzja właściciela). Rezerwacja nie warunkuje lotu: kolega mógł odpuścić,
 * zamienić się albo po prostu nie przyjść, a maszyna stoi wolna. Ekran mówi, CZYJ to
 * plan, i na tym kończy swoją rolę - decyzję podejmuje pilot, nie formularz.
 *
 * ══ WYMAGA SIECI I TO JEST ZNANA CENA ══
 * (§2.2). Bez zasięgu ostrzeżenia nie ma, a przejęcie idzie dalej dokładnie tak, jak
 * szło przed 3.0.0. Degraduje się łagodnie, bo nigdy nie było warunkiem lotu.
 *
 * ══ NAZWISKO ZA SEPARATOREM ══
 * „zarezerwowana przez A. Kowalską" wymaga dopełniacza, a odmiany nie da się wyprowadzić
 * regułą - ta sama decyzja, co przy powodach sugestii i odmowie zapisu.
 */

import { shortName } from '@ninerdeck/format';

import type { CalendarBooking } from './calendarData';
import { clubDayAt, clubHhmm, type ClubDayBounds } from './clubClock';

/**
 * Jak daleko w przód patrzymy szukając cudzego terminu.
 *
 * Dwie godziny, bo tyle trwa typowy lot klubowy: rezerwacja zaczynająca się później
 * nie koliduje z lotem, do którego pilot właśnie siada, a baner przy każdym planie
 * z dzisiejszego popołudnia nauczyłby oko pomijać górę ekranu (reguła SyncChipa).
 */
export const CONFLICT_WINDOW_MS = 2 * 3_600_000;

export interface ClaimConflictInput {
  /** Zajętość floty z serwera; `null` = brak sieci, czyli ostrzeżenia nie ma. */
  bookings: readonly CalendarBooking[] | null;
  days: readonly ClubDayBounds[];
  /** Maszyna wskazana na kroku 1; `null` = jeszcze nie wybrano. */
  aircraftId: string | null;
  /** Znak maszyny z cache floty - do zdania. */
  reg: string | null;
  pilotId: string;
  now: number;
  nameOf: (id: string | null) => string | null;
}

export interface ClaimConflictVm {
  title: string;
  text: string;
}

export function claimConflict(input: ClaimConflictInput): ClaimConflictVm | null {
  if (input.bookings == null || input.aircraftId == null) return null;

  const until = input.now + CONFLICT_WINDOW_MS;
  const clash = input.bookings.find(
    (b) =>
      b.aircraftId === input.aircraftId &&
      b.kind === 'flight' &&
      // WŁASNA rezerwacja nie jest kolizją, tylko planem, z którego pilot właśnie
      // korzysta - baner nad własnym terminem byłby ostrzeżeniem przed sobą samym.
      b.pilotId !== input.pilotId &&
      (b.status === 'confirmed' || b.status === 'pending') &&
      b.startsAt < until &&
      b.endsAt > input.now,
  );
  if (clash == null) return null;

  const day = clubDayAt(input.days, clash.startsAt);
  if (day == null) return null;

  const reg = input.reg ?? 'Ta maszyna';
  const hours = `${clubHhmm(clash.startsAt, day)} → ${clubHhmm(clash.endsAt, day)}`;
  const name = input.nameOf(clash.pilotId);
  const who = name == null ? '' : ` · ${shortName(name)}`;

  return {
    title: 'Ktoś ma tę maszynę zarezerwowaną',
    text: `${reg} ma rezerwację ${hours}${who}. Możesz lecieć - to tylko informacja o cudzym planie.`,
  };
}
