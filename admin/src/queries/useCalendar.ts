/**
 * Ninerdeck - panel: kalendarz zajętości - odczyt i trzy zapisy (issue #160).
 *
 * ══ ZAPIS UNIEWAŻNIA CAŁY KALENDARZ, NIE WSTAWIA WIERSZA DO CACHE'U ══
 * Inaczej niż przy kodzie klubu, gdzie odpowiedź JEST całą treścią karty. Tutaj zapis
 * zmienia obraz SIATKI: wyłączenie z użytku na trzy dni dotyka trzech kolumn, a odwołanie
 * rezerwacji zwalnia termin, w który zaraz ktoś wejdzie. Wstawianie pojedynczego wiersza
 * do zapamiętanej odpowiedzi znaczyłoby siatkę złożoną z dwóch epok naraz.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelBooking,
  cancelOwnBooking,
  createBlock,
  createBooking,
  createOwnBooking,
  getBooking,
  getCalendar,
  getMyApprovalPath,
  getSuggestions,
  patchOwnBooking,
  type CalendarRange,
  type NewAdminBooking,
  type NewBlock,
  type NewOwnBooking,
  type OwnBookingPatch,
  type SuggestionsQuery,
} from '../api/bookings';
import type { BookingDetailDto, BookingDto, CalendarDto, SuggestionsDto } from '../api/dto';
import { keys } from './keys';

export function useCalendar(range: CalendarRange) {
  return useQuery<CalendarDto>({
    queryKey: keys.calendar.range(range),
    queryFn: () => getCalendar(range),
  });
}

/**
 * JEDNA zajętość ze stanem ścieżki (3.1.0) - dla szuflady. `null` = szuflada zamknięta,
 * więc nie ma o co pytać.
 */
export function useBooking(id: string | null) {
  return useQuery<BookingDetailDto>({
    queryKey: keys.calendar.detail(id ?? ''),
    queryFn: () => getBooking(id ?? ''),
    enabled: id != null,
  });
}

function useCalendarMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.calendar.all });
    },
  });
}

export const useCreateBlock = () => useCalendarMutation<NewBlock, unknown>(createBlock);

export const useCreateBooking = () => useCalendarMutation<NewAdminBooking, unknown>(createBooking);

export const useCancelBooking = () =>
  useCalendarMutation<{ id: string; reason: string | null }, unknown>(({ id, reason }) =>
    cancelBooking(id, reason),
  );

/**
 * Zajętość JEDNEJ maszyny w jednej dobie - pasek w szufladzie własnej rezerwacji (#233).
 * Osobny odczyt, a nie wycinek okna siatki: dzień wybrany w szufladzie bywa poza tygodniem,
 * który stoi na osi. `null` = maszyna albo dzień jeszcze niewybrane.
 */
export function useDayOccupancy(range: CalendarRange | null) {
  return useQuery<CalendarDto>({
    queryKey: keys.calendar.range(range ?? { from: '', to: '' }),
    queryFn: () => getCalendar(range!),
    enabled: range != null,
  });
}

/**
 * Sugestie slotów (#233). Poprzednia odpowiedź zostaje na ekranie, dopóki nowa nie
 * przyjdzie: kafelki znikające przy każdej zmianie godziny skakałyby układem szuflady.
 */
export function useSuggestions(query: SuggestionsQuery | null) {
  return useQuery<SuggestionsDto>({
    queryKey: keys.calendar.suggestions(query ?? { aircraftId: '', day: '', minutes: 0 }),
    queryFn: () => getSuggestions(query!),
    enabled: query != null,
    placeholderData: keepPreviousData,
  });
}

/**
 * Kroki ścieżki dla własnej rezerwacji - pod korzeniem kalendarza, bo zapis ścieżki
 * i tak unieważnia sprawy w toku, a stopka ma mówić o bieżącej konfiguracji.
 */
export function useMyApprovalPath(enabled: boolean) {
  return useQuery<{ steps: string[] }>({
    queryKey: keys.calendar.myPath,
    queryFn: getMyApprovalPath,
    enabled,
  });
}

/** Własna rezerwacja - trzy zapisy, każdy unieważnia CAŁY kalendarz, jak reszta. */
export const useCreateOwnBooking = () => useCalendarMutation<NewOwnBooking, BookingDto>(createOwnBooking);

export const usePatchOwnBooking = () =>
  useCalendarMutation<{ id: string; patch: OwnBookingPatch }, BookingDto>(({ id, patch }) =>
    patchOwnBooking(id, patch),
  );

export const useCancelOwnBooking = () => useCalendarMutation<string, void>(cancelOwnBooking);
