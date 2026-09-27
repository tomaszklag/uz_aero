/**
 * Ninerdeck - panel 3.2: „Do sprawdzenia" - trzy źródła spraw, skrzynka rozjazdów,
 * karty dnia i dwie mutacje (rozstrzygnięcie flagi, ponowienie eksportu).
 *
 * Mutacje deklarują SWOJE unieważnienia tutaj, nie na ekranie (`docs/architektura-panelu-
 * frontend.md` §4.3). Rozstrzygnięcie flagi dotyka CZTERECH widoków naraz: skrzynki
 * (sprawa zmienia status), plakietki w kolumnie (suma spada), kart dnia (zamknięta
 * nakładka wysyła kartę) i dziennika (plakietka przy operacji gaśnie, rewizja rośnie).
 * Ponowienie eksportu - kart, sumy i dziennika (rewizja karty stoi przy operacji).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AttentionDto,
  ExportHistoryDto,
  ExportPageDto,
  FlagPageDto,
  SheetPreviewDto,
} from '../api/dto';
import {
  listExports,
  listFlags,
  loadAttention,
  loadExportHistory,
  loadSheetPreview,
  resolveFlag,
  retryExport,
  type ExportListQuery,
  type FlagListQuery,
} from '../api/attention';
import { keys } from './keys';

/** Skrzynka pokazuje do stu spraw; pełną liczbę mówi `total` w podtytule. */
export const FLAG_LIST_LIMIT = 100;
/** Karty dnia: bezpiecznik widoczny, nie stronicowanie - odpowiedź mówi, gdy obcięła listę. */
export const EXPORT_LIST_LIMIT = 200;

/**
 * Trzy źródła w jednej odpowiedzi. `enabled` rozstrzyga rama: pyta się WYŁĄCZNIE sesja
 * klubu z „Podglądem klubu" - dla członka bez niej odpowiedź byłaby 403, czyli baner
 * błędu w ramie, w której nic złego się nie stało.
 */
export function useAttention(enabled = true) {
  return useQuery<AttentionDto>({
    queryKey: keys.attention,
    queryFn: loadAttention,
    enabled,
    // Plakietka w kolumnie ma mówić o TERAZ, ale nie kosztem żądania przy każdej
    // zmianie ekranu: minuta świeżości i odświeżenie w tle, gdy karta jest widoczna.
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useFlags(query: FlagListQuery) {
  return useQuery<FlagPageDto>({
    queryKey: keys.flags.list(query),
    queryFn: () => listFlags(query),
  });
}

export function useResolveFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => resolveFlag(id, note),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.flags.all }),
        qc.invalidateQueries({ queryKey: keys.attention }),
        qc.invalidateQueries({ queryKey: keys.exports.all }),
        qc.invalidateQueries({ queryKey: keys.log.all }),
      ]),
  });
}

export function useExports(query: ExportListQuery) {
  return useQuery<ExportPageDto>({
    queryKey: keys.exports.list(query),
    queryFn: () => listExports(query),
  });
}

export function useExportHistory(sessionUuid: string | undefined) {
  return useQuery<ExportHistoryDto>({
    queryKey: keys.exports.history(sessionUuid ?? ''),
    queryFn: () => loadExportHistory(sessionUuid as string),
    enabled: sessionUuid != null && sessionUuid !== '',
  });
}

/**
 * Treść karty pyta się WYŁĄCZNIE, gdy karta jest (`hasSheet`): trasa odpowiada 404 dla
 * doby bez karty, a 404 w szufladzie wyglądałoby jak awaria, nie jak stan.
 */
export function useSheetPreview(sessionUuid: string | undefined, hasSheet: boolean) {
  return useQuery<SheetPreviewDto>({
    queryKey: keys.exports.sheet(sessionUuid ?? ''),
    queryFn: () => loadSheetPreview(sessionUuid as string),
    enabled: hasSheet && sessionUuid != null && sessionUuid !== '',
  });
}

export function useRetryExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionUuid: string) => retryExport(sessionUuid),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.exports.all }),
        qc.invalidateQueries({ queryKey: keys.attention }),
        qc.invalidateQueries({ queryKey: keys.log.all }),
      ]),
  });
}
