/**
 * Ninerdeck - POPRAWKA ISTNIEJĄCEJ REZERWACJI („PRZESUŃ I POPRAW" z karty 23, #162 F7).
 *
 * Ten sam formularz zakłada termin i go poprawia, bo pyta dokładnie o to samo. Różni się
 * WYŁĄCZNIE tym, co znaczy „zapisz" - i to jest cała treść tego modułu.
 *
 * ══ POPRAWKA NIESIE SAMĄ RÓŻNICĘ ══
 * `PATCH` zostawia pola pominięte bez zmian, więc wysyłamy tylko te, które pilot ruszył.
 * Komplet pól przepisywałby wartości, których nikt nie tknął - a w rejestrze zajętości
 * każdy zapis ma stempel i autora.
 *
 * ══ ZMIANA MASZYNY TO NOWA REZERWACJA ══
 * (decyzja właściciela 2026-09-21). `PATCH` maszyny nie przyjmuje: rezerwacja należy do
 * konkretnego egzemplarza. Ekran robi wtedy DWA zapisy - i **kolejność jest częścią
 * decyzji**: najpierw zakłada nowy termin, dopiero po jego potwierdzeniu odwołuje stary.
 * Odwrotna kolejność oddawałaby slot, zanim wiadomo, czy jest co wziąć w zamian - a przy
 * zajętym terminie na nowej maszynie pilot zostałby bez rezerwacji, którą przed chwilą
 * miał. Obie stoją na RÓŻNYCH maszynach, więc nie mają jak zderzyć się ze sobą.
 */

import type { RemoteBookingPatch } from '../../../application/ports';
import type { BookingDraft } from '../../store/bookingDraft';

import type { CalendarBooking } from './calendarData';
import type { ClubDayBounds } from './clubClock';
import { operationTypeOf } from './operations';

/** Szkic odtworzony z istniejącej rezerwacji - punkt odniesienia dla „co się zmieniło". */
export function draftOfBooking(booking: CalendarBooking, day: ClubDayBounds): BookingDraft {
  return {
    date: day.date,
    aircraftId: booking.aircraftId,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    // Rodzaj spoza tego wydania schodzi do `null`: formularz kazałby pilotowi wybrać go
    // ponownie, zamiast pokazać pustą kartę zadania, której nie umie nazwać.
    operation: operationTypeOf(booking.operation),
    departureIcao: booking.fromIcao ?? '',
    arrivalIcao: booking.toIcao ?? '',
    dualId: booking.dualId,
    plannedAirMin: booking.plannedAirMin,
    plannedFuelL: booking.plannedFuelL,
    notes: booking.note,
  };
}

/** Czy pilot cokolwiek ruszył - bramka arkusza rezygnacji w trybie poprawki. */
export function bookingChanged(draft: BookingDraft, base: BookingDraft): boolean {
  return (Object.keys(base) as (keyof BookingDraft)[]).some((key) => draft[key] !== base[key]);
}

/** Czy poprawka wychodzi poza `PATCH` - czyli czy trzeba założyć rezerwację od nowa. */
export function aircraftChanged(draft: BookingDraft, base: BookingDraft): boolean {
  return draft.aircraftId !== base.aircraftId;
}

/**
 * Sama RÓŻNICA, gotowa na drut. `null` = nic się nie zmieniło, więc nie ma czego wysyłać.
 *
 * Puste lotnisko jedzie jako `null`, a nie pusty napis: kontrakt zna brak trasy, a `''`
 * byłoby kodem ICAO o zerowej długości.
 */
export function bookingChanges(draft: BookingDraft, base: BookingDraft): RemoteBookingPatch | null {
  const patch: RemoteBookingPatch = {};

  if (draft.startsAt !== base.startsAt && draft.startsAt != null) {
    patch.startsAt = new Date(draft.startsAt).toISOString();
  }
  if (draft.endsAt !== base.endsAt && draft.endsAt != null) {
    patch.endsAt = new Date(draft.endsAt).toISOString();
  }
  if (draft.operation !== base.operation && draft.operation != null) {
    patch.operation = draft.operation;
  }
  if (draft.dualId !== base.dualId) patch.dualId = draft.dualId;
  if (draft.departureIcao !== base.departureIcao) {
    patch.fromIcao = draft.departureIcao === '' ? null : draft.departureIcao;
  }
  if (draft.arrivalIcao !== base.arrivalIcao) {
    patch.toIcao = draft.arrivalIcao === '' ? null : draft.arrivalIcao;
  }
  if (draft.plannedAirMin !== base.plannedAirMin) patch.plannedAirMin = draft.plannedAirMin;
  if (draft.plannedFuelL !== base.plannedFuelL) patch.plannedFuelL = draft.plannedFuelL;
  if (draft.notes !== base.notes) patch.note = draft.notes;

  return Object.keys(patch).length === 0 ? null : patch;
}
