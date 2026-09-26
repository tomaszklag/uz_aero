/**
 * Ninerdeck - panel 3.2: „DO SPRAWDZENIA" (`/admin/api/dashboard`, `/flags*`, `/exports*`).
 *
 * Jeden plik = jeden MODUŁ panelu (jak `log.ts`), mimo trzech prefiksów tras: to jedna
 * droga czytelnika - lista spraw → skrzynka rozjazdów albo karty dnia → decyzja.
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice.
 */

import type { FlagStatus, FlagType } from '@ninerdeck/domain';

import type {
  AttentionDto,
  ExportHistoryDto,
  ExportPageDto,
  ExportRetryResponseDto,
  ExportStateDto,
  FlagPageDto,
  ResolveFlagResultDto,
  SheetPreviewDto,
} from './dto';
import { apiGet, apiPost } from './httpClient';

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

/** Trzy źródła spraw w jednej odpowiedzi - tej samej, którą pulpit 1.0 czytał w całości. */
export function loadAttention(): Promise<AttentionDto> {
  return apiGet<AttentionDto>('/dashboard');
}

/** Filtr skrzynki tak, jak przyjmuje go trasa; brak = wszystkie sprawy, w porządku skrzynki. */
export interface FlagListQuery {
  status?: FlagStatus;
  type?: FlagType;
  aircraftId?: string;
  limit: number;
}

export function listFlags(query: FlagListQuery): Promise<FlagPageDto> {
  return apiGet<FlagPageDto>(`/flags?${queryString(query)}`);
}

/** Zamknięcie sprawy z notatką - komentarz jest WYMAGANY, jak powód korekty. */
export function resolveFlag(id: number, note: string): Promise<ResolveFlagResultDto> {
  return apiPost<ResolveFlagResultDto>(`/flags/${id}/resolve`, { note });
}

/** Zakres dat jak w dzienniku (`YYYY-MM-DD`, domknięty); `state` zawęża do jednej plakietki. */
export interface ExportListQuery {
  from?: string;
  to?: string;
  aircraftId?: string;
  state?: ExportStateDto;
  limit: number;
}

export function listExports(query: ExportListQuery): Promise<ExportPageDto> {
  return apiGet<ExportPageDto>(`/exports?${queryString(query)}`);
}

export function loadExportHistory(sessionUuid: string): Promise<ExportHistoryDto> {
  return apiGet<ExportHistoryDto>(`/exports/${encodeURIComponent(sessionUuid)}`);
}

/** Treść karty POD PREFIKSEM PANELU - ciasteczko sesji nie widzi `/sheets`. */
export function loadSheetPreview(sessionUuid: string): Promise<SheetPreviewDto> {
  return apiGet<SheetPreviewDto>(`/exports/${encodeURIComponent(sessionUuid)}/sheet`);
}

/** Ponowienie eksportu - odmowa i awaria wracają jako ODPOWIEDŹ z powodem, nie jako błąd. */
export function retryExport(sessionUuid: string): Promise<ExportRetryResponseDto> {
  return apiPost<ExportRetryResponseDto>(`/exports/${encodeURIComponent(sessionUuid)}/retry`);
}
