/**
 * Ninerdeck - panel: hooki karty „Obserwowane samoloty" na `#/konto` (3.2.0, issue #205).
 *
 * ══ ZAPIS UNIEWAŻNIA LISTĘ, NIE PRZESTAWIA WIERSZA W CACHE'U ══
 * Odpowiedź przełącznika jest pusta (`204`), więc nie ma czego wpisać - a lista niesie
 * obok flagi STAN maszyny „teraz", który od ostatniego odczytu mógł się zmienić.
 * Odświeżenie po zapisie oddaje przy okazji świeży stan, i o to chodzi: wiersz ma mówić
 * prawdę o maszynie w chwili, w której ktoś na niego patrzy.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { WatchListDto } from '../api/dto';
import { myWatches, setWatch } from '../api/watches';
import { keys } from './keys';

/**
 * Flota klubu sesji ze stanem „teraz" i flagą obserwowania.
 *
 * Bez `enabled`: pyta o to WYŁĄCZNIE karta, która już wie, że sesja ma `fleet.watch`
 * (rozstrzyga `AccountScreen`). Hook z własną bramką dublowałby tę decyzję - a dwie
 * bramki na jedno pytanie rozjeżdżają się przy pierwszej poprawce jednej z nich.
 */
export function useMyWatches() {
  return useQuery<WatchListDto>({ queryKey: keys.account.watches, queryFn: () => myWatches() });
}

export interface SetWatchInput {
  aircraftId: string;
  on: boolean;
}

/** Przełącznik przy wierszu: zapis od razu, po nim lista czyta się na nowo. */
export function useSetWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ aircraftId, on }: SetWatchInput) => setWatch(aircraftId, on),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.account.watches });
    },
  });
}
