/**
 * Ninerdeck - panel: skrzynka powiadomień - odczyt w stronach i przeczytanie (4.0.0, K7
 * `docs/kanal-klubu.md`; epik KK-D #246).
 *
 * Jedno zapytanie dla dzwonka i szuflady: dzwonek czyta liczbę nieprzeczytanych
 * z pierwszej strony, szuflada - listę. Świeżość daje kanał klubu: ramka `notification`
 * dopisuje wiadomość do tej samej pamięci (`useLiveChannel`), a wznowienie połączenia
 * dociąga całość. `enabled` - skrzynkę ma wyłącznie sesja klubu.
 */

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { InboxPageDto } from '../api/dto';
import { getInbox, INBOX_PAGE, markNotificationRead, type InboxCursor } from '../api/notifications';
import { cursorOf, withRead, type InboxData } from './inboxCache';
import { keys } from './keys';

export function useInbox(enabled: boolean) {
  return useInfiniteQuery<InboxPageDto, Error, InboxData, readonly unknown[], InboxCursor | null>({
    queryKey: keys.notifications.inbox,
    queryFn: ({ pageParam }) => getInbox(pageParam),
    initialPageParam: null as InboxCursor | null,
    // Strona krótsza niż limit jest ostatnią - dalej nie ma czego pobierać.
    getNextPageParam: (last) => {
      const tail = last.items[last.items.length - 1];
      return last.items.length < INBOX_PAGE || tail == null ? undefined : cursorOf(tail);
    },
    enabled,
  });
}

/**
 * Przeczytanie listy wiadomości - „Nowe" gaśnie z otwarciem skrzynki, w panelu i w telefonie
 * naraz. Liczba przy dzwonku spada OD RAZU (zapis w pamięci przed odpowiedzią): skrzynka
 * jest otwarta, a licznik, który świeci nad nią jeszcze sekundę, wygląda jak usterka.
 *
 * Odczyt skrzynki w locie (otwarcie szuflady odświeża nieświeżą listę) przyniósłby stan
 * sprzed przeczytania i zapalił liczbę drugi raz - dlatego najpierw go wstrzymujemy, a po
 * zapisie skrzynka czyta się od nowa. Wiadomość, której przeczytanie nie doszło, wraca
 * wtedy jako nowa zamiast udawać przeczytaną.
 */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: readonly string[]) => {
      await Promise.allSettled(ids.map((id) => markNotificationRead(id)));
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: keys.notifications.inbox });
      qc.setQueryData<InboxData>(keys.notifications.inbox, (data) =>
        withRead(data, new Set(ids), new Date().toISOString()),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.notifications.inbox }),
  });
}
