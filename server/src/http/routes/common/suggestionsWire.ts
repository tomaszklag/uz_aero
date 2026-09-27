/**
 * Ninerdeck (serwer) - SUGESTIE SLOTÓW NA DRUCIE, wspólne dla telefonu i panelu
 * (milestone 3.0.0, issue #158; panel od 3.2.0, issue #233).
 *
 * Telefon pyta o sugestie na kroku 1 rezerwacji (22), panel - w szufladzie własnej
 * rezerwacji (K7). To jest to samo pytanie o ten sam dzień tej samej maszyny, więc
 * zapytanie i odpowiedź mają JEDEN kształt: dwie kopie rozjechałyby się przy pierwszym
 * nowym polu i te same godziny miałyby na dwóch ekranach inny powód.
 *
 * `day` to DOWOLNA chwila doby, o którą pytamy - zapytanie sprowadzi ją do granic doby
 * w strefie klubu, więc klient ma jedną rzecz mniej do policzenia.
 *
 * Sufit długości to doba: slot dłuższy niż dzień nie istnieje, a liczba bez sufitu
 * kazałaby funkcji przemielić okno w poszukiwaniu czegoś, czego nie ma.
 */

import { z } from 'zod';

import type { BookingQueries } from '../../../application/common/queries/bookings.ts';

export const suggestionsQuery = z.object({
  aircraftId: z.string().min(1).max(100),
  day: z.string().datetime(),
  minutes: z.coerce.number().int().positive().max(24 * 60),
  preferredAt: z.string().datetime().optional(),
});

type SuggestionsView = NonNullable<Awaited<ReturnType<BookingQueries['suggestions']>>>;

/**
 * Pusta lista NIE JEST błędem: dzień bywa pełny, i to jest odpowiedź. ETagu tu nie ma -
 * sugestie zależą od chwili bieżącej, więc znacznik starzałby się co minutę.
 */
export function suggestionsWire(view: SuggestionsView): Record<string, unknown> {
  return {
    day: {
      date: view.day.date,
      startsAt: new Date(view.day.startsAt).toISOString(),
      endsAt: new Date(view.day.endsAt).toISOString(),
    },
    window: {
      from: new Date(view.window.from).toISOString(),
      to: new Date(view.window.to).toISOString(),
      basis: view.window.basis,
    },
    suggestions: view.suggestions.map((s) => ({
      startsAt: new Date(s.startsAt).toISOString(),
      endsAt: new Date(s.endsAt).toISOString(),
      reason: s.reason,
      gapBeforeMin: Math.round(s.gapBeforeMs / 60_000),
      gapAfterMin: Math.round(s.gapAfterMs / 60_000),
    })),
    // Wolne pasma w oknie doby (issue #233) - telefon ich nie czyta (liczy je sam tą
    // samą funkcją domeny z okna kalendarza), panel pisze z nich podpis pod paskiem.
    free: view.free.map((f) => ({
      startsAt: new Date(f.startsAt).toISOString(),
      endsAt: new Date(f.endsAt).toISOString(),
    })),
  };
}

/** Zapytanie z drutu → wywołanie zapytania w klubie `orgId`; `null` = maszyny nie ma w klubie. */
export function askSuggestions(
  calendar: BookingQueries,
  orgId: string,
  q: z.infer<typeof suggestionsQuery>,
): ReturnType<BookingQueries['suggestions']> {
  return calendar.suggestions(orgId, q.aircraftId, Date.parse(q.day), q.minutes * 60_000, {
    preferredAt: q.preferredAt == null ? null : Date.parse(q.preferredAt),
  });
}
