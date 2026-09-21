/**
 * Ninerdeck - PASEK DNI kalendarza (21, rezerwacje 3.0.0).
 *
 * Horyzont rezerwacji jest krótki, więc doby wybiera się chipami przewijanymi kciukiem,
 * a nie pełnym kalendarzem miesięcznym - ten stoi w arkuszu daty przy zakładaniu
 * rezerwacji, gdzie termin wybiera się świadomie.
 *
 * ══ KROPKA ZNACZY „MASZ TU SWOJĄ REZERWACJĘ" ══
 * Nie liczbę rezerwacji klubu: kalendarz klubu w sezonie ma wpisy każdego dnia, więc
 * licznik przy każdym chipie niczego by nie odróżniał (reguła SyncChipa z issue #12).
 * Kropka odpowiada na jedyne pytanie, które pasek dni potrafi zadać z sensem - „gdzie
 * już coś mam".
 */

import { weekdayShortUtc } from '@ninerdeck/format';

import type { CalendarBooking } from './calendarData';
import { bookingsOnDay } from './calendarData';
import type { ClubDayBounds } from './clubClock';

export interface DayChipVm {
  /** `RRRR-MM-DD` w strefie klubu - klucz wyboru, nie napis. */
  date: string;
  /** Skrót dnia tygodnia: „Sob". */
  dow: string;
  /** Dzień miesiąca bez zera wiodącego - „19". */
  day: string;
  /** Pilot ma w tej dobie własną rezerwację. */
  mine: boolean;
  selected: boolean;
  /** Doba bieżąca - chip niesie nią wyróżnienie nawet niewybrany. */
  today: boolean;
}

export interface DayChipsInput {
  days: readonly ClubDayBounds[];
  bookings: readonly CalendarBooking[];
  pilotId: string;
  /** `RRRR-MM-DD` wybranej doby. */
  selected: string;
  now: number;
}

export function buildDayChips(input: DayChipsInput): DayChipVm[] {
  return input.days.map((day) => ({
    date: day.date,
    // Dzień tygodnia liczy się ze ŚRODKA doby, nie z jej początku: granica doby klubu
    // wypada przed północą UTC, więc `getUTCDay()` z `startsAt` trafiłby w poniedziałek
    // dla wtorku. Środek leży od obu granic najdalej, jaką by nie miała długość.
    dow: capitalize(weekdayShortUtc(midday(day)).toLowerCase()),
    day: String(dayOfMonth(day)),
    mine: bookingsOnDay(input.bookings, day).some(
      (b) => b.kind === 'flight' && b.pilotId === input.pilotId,
    ),
    selected: day.date === input.selected,
    today: input.now >= day.startsAt && input.now < day.endsAt,
  }));
}

/**
 * Doba, którą pokazać po wczytaniu: dzisiejsza, a gdy jej w oknie nie ma - pierwsza.
 *
 * Drugi przypadek nie jest teoretyczny: pilot patrzący na przyszły tydzień dostaje
 * okno bez dzisiaj, a ekran bez wybranej doby nie miałby czego narysować.
 */
export function defaultDay(days: readonly ClubDayBounds[], now: number): string | null {
  const today = days.find((d) => now >= d.startsAt && now < d.endsAt);
  return today?.date ?? days[0]?.date ?? null;
}

/** Dzień miesiąca z klucza doby - napis z serwera, a nie rachunek na chwilach. */
function dayOfMonth(day: ClubDayBounds): number {
  const parsed = Number(day.date.slice(8, 10));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : new Date(midday(day)).getUTCDate();
}

function midday(day: ClubDayBounds): number {
  return (day.startsAt + day.endsAt) / 2;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}
