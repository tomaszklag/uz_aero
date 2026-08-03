/**
 * UZ Aero — panel: odczyt REJESTRU ZDARZEŃ (`A04`).
 *
 * Hook jest cienki z zasady: decyzja o treści ekranu mieszka w czystych modułach
 * `screens/events/*.ts`, a tutaj zostaje wyłącznie to, co dotyczy cache'u.
 *
 * ══ DLACZEGO `useInfiniteQuery`, A NIE „STRONA N" ══
 * Ten sam powód, co przy dzienniku audytu, tylko najmocniejszy w całym panelu:
 * `events` jest NAJSZYBCIEJ ROSNĄCĄ tabelą w systemie i rośnie W TRAKCIE przeglądania,
 * bo telefony dosyłają outboxy. Kursor keyset opisuje POZYCJĘ w porządku, więc dopisany
 * wiersz go nie przesuwa; `OFFSET` przesunąłby wszystko o jeden i administrator
 * przestałby widzieć akurat to zdarzenie, którego szuka — najgorszy możliwy tryb awarii
 * narzędzia śledczego.
 *
 * Kursor prowadzi TYLKO W PRZÓD, więc strony się DOKŁADAJĄ, a nie podmieniają.
 * Numerowany paginator wymagałby albo własnego stosu kursorów (stan, którego nie da
 * się wkleić w link), albo offsetu — czyli tego, czego serwer świadomie nie robi.
 *
 * Osobnego zapytania o liczniki tu NIE MA, inaczej niż przy audycie: serwer liczy je
 * jednym zapytaniem razem ze stroną i wydaje w polu `counts`. Drugie żądanie pytałoby
 * o liczbę, którą właśnie dostaliśmy.
 */

import { useInfiniteQuery } from '@tanstack/react-query';

import type { EventsPageDto } from '../api/dto';
import { listEvents, type EventListQuery } from '../api/events';
import { keys } from './keys';

/** Strony rejestru dokładane kursorem; `pageParam` nigdy nie powstaje w panelu. */
export function useEvents(query: EventListQuery, enabled = true) {
  return useInfiniteQuery<EventsPageDto, Error, EventsPageDto[], readonly unknown[], string | null>({
    queryKey: keys.events.list(query),
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      listEvents(pageParam == null ? query : { ...query, cursor: pageParam }),
    // `undefined` (czego wymaga TanStack) wyłącza przycisk „pokaż kolejne" — i to jest
    // właściwe zachowanie: nie ma czego pobierać.
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data) => data.pages,
    enabled,
  });
}
