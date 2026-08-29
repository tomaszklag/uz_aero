/**
 * UZ Aero - panel: odczyt MONITORA EKSPORTU (`A05`).
 *
 * Hooki są cienkie z zasady: decyzja o treści ekranu mieszka w czystych modułach
 * `screens/exports/*.ts`, a tutaj zostaje wyłącznie to, co dotyczy cache'u.
 *
 * ══ DLACZEGO ZWYKŁE `useQuery`, A NIE KURSOR ══
 * Inaczej niż przy dniach i dzienniku audytu: monitor jest zawężony do ZAKRESU DAT,
 * a zakres w skali klubu to kilkadziesiąt dni lotnych. Kursor keyset istnieje po to,
 * żeby lista rosnąca bez granicy nie gubiła wierszy między stronami - tutaj granicę
 * stawia kalendarz, więc kursor byłby kosztem bez problemu do rozwiązania. Serwer
 * odpowiada jedną stroną i jednym kompletem liczników.
 *
 * Kalendarza panel jednak jeszcze NIE MA, więc granicę stawia dziś `?limit=`
 * (`EXPORTS_PAGE_LIMIT`). Liczniki opisują mimo to cały zakres - liczy je serwer poza
 * `LIMIT`-em - a `ExportPageDto.truncated` mówi, czy lista jest przycięta. Ekran pokazuje
 * to banerem, bo lista przycięta po cichu wygląda na komplet.
 */

import { useQuery } from '@tanstack/react-query';

import type { ExportHistoryDto, ExportPageDto, SheetPreviewDto } from '../api/dto';
import {
  getExportHistory,
  getSheetPreview,
  listExports,
  type ExportListQuery,
} from '../api/exports';
import { keys } from './keys';

export function useExports(query: ExportListQuery, enabled = true) {
  return useQuery<ExportPageDto>({
    queryKey: keys.exports.list(query),
    queryFn: () => listExports(query),
    enabled,
  });
}

/**
 * Historia rewizji WYBRANEJ karty - pobierana dopiero po wskazaniu wiersza.
 *
 * Osobne żądanie, a nie pole listy: dziennik jednej karty ma jednocyfrową długość, ale
 * dołożenie go do każdego wiersza znaczyłoby N zapytań na jedną tabelę przy każdym
 * wejściu na ekran - dla danych, których administrator w większości nie otworzy.
 */
export function useExportHistory(sessionUuid: string | null) {
  return useQuery<ExportHistoryDto>({
    // `sessionUuid!` jest tu bezpieczne, bo `enabled` wyłącza zapytanie przy `null` -
    // TanStack nie woła `queryFn` dla wyłączonego zapytania.
    queryKey: keys.exports.history(sessionUuid ?? ''),
    queryFn: () => getExportHistory(sessionUuid as string),
    enabled: sessionUuid != null,
  });
}

/**
 * Treść bieżącej karty. **404 jest tu odpowiedzią, nie awarią** - dzień bez karty jest
 * normalnym stanem tego ekranu, więc `retry: false`: powtarzanie żądania o kartę,
 * której nie ma, nie zmieni odpowiedzi, a opóźni komunikat.
 */
export function useSheetPreview(sessionUuid: string | null) {
  return useQuery<SheetPreviewDto>({
    queryKey: keys.exports.sheet(sessionUuid ?? ''),
    queryFn: () => getSheetPreview(sessionUuid as string),
    enabled: sessionUuid != null,
    retry: false,
  });
}
