/**
 * Ninerdeck - panel: kalendarz zajętości - odczyt i trzy zapisy (issue #160).
 *
 * ══ ZAPIS UNIEWAŻNIA CAŁY KALENDARZ, NIE WSTAWIA WIERSZA DO CACHE'U ══
 * Inaczej niż przy kodzie klubu, gdzie odpowiedź JEST całą treścią karty. Tutaj zapis
 * zmienia obraz SIATKI: wyłączenie z użytku na trzy dni dotyka trzech kolumn, a odwołanie
 * rezerwacji zwalnia termin, w który zaraz ktoś wejdzie. Wstawianie pojedynczego wiersza
 * do zapamiętanej odpowiedzi znaczyłoby siatkę złożoną z dwóch epok naraz.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelBooking,
  createBlock,
  createBooking,
  getCalendar,
  type CalendarRange,
  type NewAdminBooking,
  type NewBlock,
} from '../api/bookings';
import type { CalendarDto } from '../api/dto';
import { keys } from './keys';

export function useCalendar(range: CalendarRange) {
  return useQuery<CalendarDto>({
    queryKey: keys.calendar.range(range),
    queryFn: () => getCalendar(range),
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
