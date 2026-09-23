/**
 * Ninerdeck - KOPERTA KALENDARZA na kształt, którym liczy ekran (rezerwacje 3.0.0).
 *
 * Trasa `GET /bookings` oddaje chwile jako napisy ISO, bo tak wygląda kontrakt HTTP.
 * Ekran liczy pozycje pasków, godziny i kolizje ODEJMOWANIEM, więc parsowanie stoi
 * w jednym miejscu i dzieje się raz - a nie przy każdym renderze każdego wiersza.
 *
 * ══ TO NIE JEST CACHE ══
 * Cały moduł rezerwacji wymaga sieci (decyzja właściciela 2026-09-20, §2.2): zajętości
 * floty telefon NIE trzyma. Ten plik zamienia świeżą odpowiedź na liczby i tyle -
 * gdyby kiedyś wracał magazyn, będzie to osobna decyzja i osobny plik.
 */

import type { RemoteBooking, RemoteCalendar } from '../../../application';

import type { ClubDayBounds } from './clubClock';

/** Jedna zajętość maszyny: rezerwacja pilota albo wyłączenie z użytku. */
export interface CalendarBooking {
  id: string;
  aircraftId: string;
  kind: 'flight' | 'block';
  status: string;
  startsAt: number;
  endsAt: number;
  pilotId: string | null;
  dualId: string | null;
  operation: string | null;
  fromIcao: string | null;
  toIcao: string | null;
  plannedAirMin: number | null;
  plannedFuelL: number | null;
  sessionUuid: string | null;
  blockReason: string | null;
  note: string | null;
  /**
   * Chwila złożenia (ms) - 3.1.0, epik R-I. Opcjonalne: brak pola znaczy „nie ta
   * odpowiedź" (cudza rezerwacja, serwer sprzed 3.1.0), a `null` - odpowiedź bez stempla,
   * którego nie dało się przeczytać.
   */
  createdAt?: number | null;
}

export interface CalendarData {
  /** NAPIS do wyświetlenia („czas klubu"), nie materiał do rachunku. */
  timezone: string;
  /** Lotnisko macierzyste - z niego liczy się okno doby lotnej; `null` = brak ustawienia. */
  homeIcao: string | null;
  days: ClubDayBounds[];
  bookings: CalendarBooking[];
}

/**
 * Odpowiedź serwera → liczby.
 *
 * Wiersze bez dającej się przeczytać pary chwil WYPADAJĄ: pasek o nieznanym położeniu
 * nie ma jak stanąć na osi, a narysowany „gdzieś" kłamałby o zajętości maszyny. To ten
 * sam rachunek, co przy braku odczytu w dzienniku panelu - brak pokazuje się jako brak.
 */
export function toCalendar(wire: RemoteCalendar): CalendarData {
  return {
    timezone: wire.timezone,
    homeIcao: wire.homeIcao,
    days: wire.days.flatMap((d) => {
      const startsAt = Date.parse(d.startsAt);
      const endsAt = Date.parse(d.endsAt);
      return Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt > startsAt
        ? [{ date: d.date, startsAt, endsAt }]
        : [];
    }),
    bookings: wire.bookings.flatMap((b) => {
      const parsed = toBooking(b);
      return parsed == null ? [] : [parsed];
    }),
  };
}

/** Jedna zajętość z drutu; `null` = nie da się jej umieścić w czasie. */
export function toBooking(wire: RemoteBooking): CalendarBooking | null {
  const startsAt = Date.parse(wire.startsAt);
  const endsAt = Date.parse(wire.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || !(endsAt > startsAt)) return null;

  return {
    id: wire.id,
    aircraftId: wire.aircraftId,
    kind: wire.kind,
    status: wire.status,
    startsAt,
    endsAt,
    pilotId: wire.pilotId,
    // Pola własnej rezerwacji: z cudzej nie przychodzą wcale (W7), a `null` jest
    // tu poprawnym odwzorowaniem braku - ekran i tak pyta o nie tylko przy swoich
    // terminach i pomija wiersz, którego nie ma czym wypełnić.
    dualId: wire.dualId ?? null,
    operation: wire.operation ?? null,
    fromIcao: wire.fromIcao ?? null,
    toIcao: wire.toIcao ?? null,
    plannedAirMin: wire.plannedAirMin ?? null,
    plannedFuelL: wire.plannedFuelL ?? null,
    sessionUuid: wire.sessionUuid ?? null,
    blockReason: wire.blockReason,
    note: wire.note ?? null,
    createdAt: parsedOrNull(wire.createdAt),
  };
}

const parsedOrNull = (iso: string | undefined): number | null => {
  if (iso == null) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
};

/**
 * Zajętości NACHODZĄCE na dobę - z klamrą obustronnie otwartą, bo rezerwacja
 * kończąca się dokładnie o północy należy do doby, która właśnie minęła.
 *
 * Wielodniowe wyłączenie z użytku wchodzi przez to do KAŻDEJ doby, którą obejmuje,
 * i tak ma być: maszyna jest w serwisie w każdą z nich.
 */
export function bookingsOnDay(
  bookings: readonly CalendarBooking[],
  day: ClubDayBounds,
): CalendarBooking[] {
  return bookings.filter((b) => b.startsAt < day.endsAt && b.endsAt > day.startsAt);
}