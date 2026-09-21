/**
 * Ninerdeck - NAGŁÓWEK DOBY nad osią floty (`design/21`, `.grid-title`).
 *
 * „Sobota 19 września" - dzień tygodnia jest tu treścią, nie ozdobą: pasek chipów
 * pokazuje same liczby, a pilot planujący lot myśli weekendami.
 */

import { dateUtcDayMonthLong, weekdayUtc } from '@ninerdeck/format';

import type { ClubDayBounds } from './clubClock';

export function dayHeading(day: ClubDayBounds): string {
  // Dzień tygodnia i data liczą się ze ŚRODKA doby: granica doby klubu wypada przed
  // północą UTC, więc rachunek z `startsAt` trafiłby w dzień poprzedni.
  const midday = (day.startsAt + day.endsAt) / 2;
  const dow = weekdayUtc(midday).toLowerCase();
  return `${dow.charAt(0).toUpperCase()}${dow.slice(1)} ${dateUtcDayMonthLong(midday).toLowerCase()}`;
}
