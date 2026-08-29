/**
 * UZ Aero - panel: odczyt LISTY dni lotnych (`A02`).
 *
 * Hooki są cienkie z zasady: decyzja o treści ekranu mieszka w czystych modułach
 * `screens/days/*.ts`, a tutaj zostaje wyłącznie to, co dotyczy cache'u.
 *
 * ══ DLACZEGO `useInfiniteQuery`, A NIE „STRONA N" ══
 * Serwer stronicuje KURSOREM keyset, nie offsetem, bo tabela `sessions` rośnie
 * w trakcie przeglądania - telefony dosyłają outboxy. Kursor opisuje POZYCJĘ
 * w porządku, więc dopisanie dnia go nie przesuwa; `OFFSET` przesunąłby wszystko
 * o jeden i administrator przestałby widzieć akurat ten dzień, którego szuka.
 *
 * Konsekwencja dla panelu jest jednak taka, że kursor prowadzi TYLKO W PRZÓD:
 * z odpowiedzi da się wziąć „co dalej", nie da się wziąć „co było wcześniej".
 * Dlatego strony się DOKŁADAJĄ, a nie podmieniają - numerowany paginator
 * wymagałby albo własnego stosu kursorów (stan, którego nie da się wkleić w link),
 * albo offsetu, czyli dokładnie tego, czego serwer świadomie nie robi.
 *
 * Porządku listy nie ruszamy: sortuje serwer (`claim_time` malejąco domyślnie),
 * a kierunek jedzie parametrem `sort`. Przesortowanie na kliencie przestawiłoby
 * wiersze wewnątrz przypadkowego wycinka, bo lista jest przycięta `limit`-em.
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { SessionPageDto } from '../api/dto';
import { listSessions, type SessionListQuery } from '../api/sessions';
import { keys } from './keys';

/**
 * Strony listy dokładane kursorem. `pageParam` to nieprzezroczysty napis z poprzedniej
 * odpowiedzi albo `null` dla pierwszej strony - panel nigdy go nie buduje sam.
 */
export function useSessions(query: SessionListQuery) {
  return useInfiniteQuery<SessionPageDto, Error, SessionPageDto[], readonly unknown[], string | null>({
    queryKey: keys.sessions.list(query),
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      listSessions(pageParam == null ? query : { ...query, cursor: pageParam }),
    // `null` = koniec listy, a nie „spróbuj jeszcze raz". Zwrócenie `undefined`
    // (czego wymaga TanStack) wyłącza przycisk „pokaż kolejne" - i to jest właściwe
    // zachowanie: nie ma czego pobierać.
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data) => data.pages,
  });
}

/**
 * Sam LICZNIK dni spełniających filtr - `total` z odpowiedzi przy `limit=1`.
 *
 * Osobne zapytanie, bo odpowiada na inne pytanie niż lista: kafel „dni z otwartą
 * flagą" ma pokazać, ile ich jest w całym zakresie, także wtedy, gdy na ekranie
 * widać pierwszą stronę pięćdziesięciu wierszy. Policzenie tego z pobranych stron
 * dałoby liczbę, której serwer nigdy nie wysłał - i fałszywą przy każdym obcięciu.
 *
 * `limit: 1` zamiast `0`, bo trasa wymaga liczby dodatniej (`z.coerce.number().int()
 * .positive()`); jeden wiersz to najtańsze pytanie, jakie da się zadać.
 */
export function useSessionCount(query: SessionListQuery, enabled = true) {
  return useQuery<number>({
    queryKey: keys.sessions.count(query),
    queryFn: async () => (await listSessions(query)).total,
    enabled,
  });
}
