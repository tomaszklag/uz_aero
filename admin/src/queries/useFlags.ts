/**
 * UZ Aero - panel: odczyt skrzynki flag (`A03`).
 *
 * Hooki są cienkie z zasady: cała decyzja o treści ekranu mieszka w czystych
 * modułach `screens/flags/*.ts`, a tutaj zostaje wyłącznie to, co dotyczy CACHE'U -
 * klucz, zapytanie i nic poza tym.
 *
 * **Porządku listy nie ruszamy.** Skrzynka przychodzi posortowana przez serwer
 * (blokujące eksport na górze, potem od najstarszych) i to jest część kontraktu,
 * nie przypadek: lista przycięta `limit`-em musi być przycięta po WŁAŚCIWEJ stronie
 * porządku, a przesortowanie jej na kliencie pokazałoby inne pierwsze wiersze niż te,
 * które serwer uznał za pilne.
 */

import { useQuery } from '@tanstack/react-query';

import type { FlagPageDto } from '../api/dto';
import { listFlags, type FlagListQuery } from '../api/flags';
import { keys } from './keys';

export function useFlags(query: FlagListQuery) {
  return useQuery<FlagPageDto>({
    queryKey: keys.flags.list(query),
    queryFn: () => listFlags(query),
  });
}

/**
 * Sam licznik spraw danego statusu - `total` z odpowiedzi, przy `limit=1`.
 *
 * Osobne zapytanie, bo licznik ODPOWIADA NA INNE PYTANIE niż lista: plakietka
 * „7" przy pozycji „Flagi" w nawigacji ma pokazywać wszystkie otwarte sprawy także
 * wtedy, gdy człowiek patrzy właśnie na listę rozwiązanych albo zawęził ją do
 * jednego samolotu. Policzenie tego z wierszy na ekranie dałoby liczbę, której
 * serwer nigdy nie wysłał - i fałszywą przy każdym filtrze.
 */
export function useFlagCount(status: 'open' | 'resolved', enabled = true) {
  return useQuery<number>({
    queryKey: keys.flags.count(status),
    queryFn: async () => (await listFlags({ status, limit: 1 })).total,
    // Rama panelu woła ten hook BEZWARUNKOWO (hooki nie mogą być warunkowe),
    // a montuje się także wtedy, gdy sesji jeszcze nie ma - bez tej bramki każde
    // wejście na adres panelu strzelałoby 401 w logi serwera, zanim ktokolwiek
    // się zalogował.
    enabled,
  });
}
