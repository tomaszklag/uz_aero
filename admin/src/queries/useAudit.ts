/**
 * UZ Aero - panel: odczyt DZIENNIKA AUDYTU (`A09`).
 *
 * Hooki są cienkie z zasady: decyzja o treści ekranu mieszka w czystych modułach
 * `screens/audit/*.ts`, a tutaj zostaje wyłącznie to, co dotyczy cache'u.
 *
 * ══ DLACZEGO `useInfiniteQuery`, A NIE „STRONA N" ══
 * Ten sam powód, co przy dniach, tylko mocniejszy: `admin_audit` rośnie w nieskończoność
 * i rośnie W TRAKCIE przeglądania, bo drugi administrator właśnie coś zmienia.
 * Kursor keyset opisuje POZYCJĘ w porządku, więc dopisany wiersz go nie przesuwa;
 * `OFFSET` przesunąłby wszystko o jeden i administrator przestałby widzieć akurat ten
 * wpis, którego szuka - najgorszy możliwy tryb awarii narzędzia nadzoru.
 *
 * Kursor prowadzi TYLKO W PRZÓD, więc strony się DOKŁADAJĄ, a nie podmieniają.
 * Numerowany paginator wymagałby albo własnego stosu kursorów (stan, którego nie da
 * się wkleić w link), albo offsetu - czyli tego, czego serwer świadomie nie robi.
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { listAudit, type AuditListQuery } from '../api/audit';
import type { AuditPageDto } from '../api/dto';
import { keys } from './keys';

/** Strony dziennika dokładane kursorem; `pageParam` nigdy nie powstaje w panelu. */
export function useAudit(query: AuditListQuery, enabled = true) {
  return useInfiniteQuery<AuditPageDto, Error, AuditPageDto[], readonly unknown[], string | null>({
    queryKey: keys.audit.list(query),
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      listAudit(pageParam == null ? query : { ...query, cursor: pageParam }),
    // `undefined` (czego wymaga TanStack) wyłącza przycisk „pokaż kolejne" - i to jest
    // właściwe zachowanie: nie ma czego pobierać.
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data) => data.pages,
    enabled,
  });
}

/**
 * Sam LICZNIK wpisów spełniających filtr - `total` z odpowiedzi przy `limit=1`.
 *
 * Osobne zapytanie, bo odpowiada na inne pytanie niż lista: kafel „wpisy dziś" ma
 * pokazać, ile ich było w całej dobie, także wtedy, gdy na ekranie widać pierwszą
 * stronę pięćdziesięciu wierszy sprzed tygodnia. Policzenie tego z pobranych stron
 * dałoby liczbę, której serwer nigdy nie wysłał.
 *
 * Typ jest `number | null`, bo takie jest pole na drucie. W praktyce kafel dostanie tu
 * zawsze liczbę - to zapytanie nigdy nie wysyła kursora, a licznika brakuje wyłącznie
 * stronom kursorowym. Zawężenie typu asercją byłoby obietnicą kontraktu, której ten
 * plik nie ma jak dotrzymać; `undefined` (zapytanie w drodze) i `null` dają na ekranie
 * to samo „-".
 */
export function useAuditCount(query: AuditListQuery, enabled = true) {
  return useQuery<number | null>({
    queryKey: keys.audit.count(query),
    queryFn: async () => (await listAudit(query)).total,
    enabled,
  });
}
