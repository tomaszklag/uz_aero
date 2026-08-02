/**
 * UZ Aero — panel: operacje serwisowe (`/admin/api/maintenance/*`, mockup `A11`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u — zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * ══ CZEGO TU NIE MA I DLACZEGO ══
 * **Ponowienia eksportu.** Ekran `A11` ma kolejkę kart do ponowienia, ale jej wierszem
 * jest ten sam `ExportListItemDto`, co na `A05`, a jej akcją — `retryExport` z `api/exports.ts`.
 * Druga funkcja robiąca to samo byłaby początkiem rozjazdu między „ponów" na monitorze
 * eksportu a „ponów" w konserwacji; jedyne, co panel dokłada, to zawężenie listy do
 * stanów wymagających uwagi — po stronie SERWERA (`?state=`).
 *
 * **Uruchamiania migracji.** Schemat wprowadza `migrate()` przy starcie serwera —
 * wdrożenie schematu jest wydaniem, nie akcją administratora, więc nie ma takiej trasy.
 */

import type {
  RebuildReportDto,
  RefreshTokenScanDto,
  SchemaStateDto,
  TokenPurgeReportDto,
} from './dto';
import { apiGet, apiPost } from './httpClient';

/**
 * Krok pierwszy z mockupu: „Przelicz i porównaj — bez zapisu".
 *
 * `GET`, bo to naprawdę odczyt: serwer nie zapisuje ani wiersza projekcji, ani wpisu
 * w dzienniku audytu. `POST` sugerowałby, że coś się wydarzyło.
 */
export function compareProjections(): Promise<RebuildReportDto> {
  return apiGet<RebuildReportDto>('/maintenance/projections/compare');
}

/**
 * Krok drugi: „Przelicz i nadpisz projekcję". `reason` jest WYMAGANY przez serwer —
 * bez niego trasa odpowiada 400 `reason_required`, a nie „zapisano zero".
 */
export function rebuildProjections(reason: string): Promise<RebuildReportDto> {
  return apiPost<RebuildReportDto>('/maintenance/projections/rebuild', { reason });
}

/** Stan tabeli refresh tokenów: ile martwych, ile żywych, z jakiego zakresu dat. */
export function getRefreshTokens(): Promise<RefreshTokenScanDto> {
  return apiGet<RefreshTokenScanDto>('/maintenance/refresh-tokens');
}

/**
 * Jawne wyrażenie intencji, którego serwer WYMAGA przy jedynej operacji kasującej dane
 * (`server/src/application/admin/commands/maintenance.ts`).
 *
 * Wartość jest maszynowa, nie polska: serwer nie zna języka interfejsu. Wpisane przez
 * człowieka „USUŃ" jest bramką dla CZŁOWIEKA i mieszka w module czystym ekranu; ten
 * napis jest bramką dla MASZYNY i jedzie w ciele żądania.
 */
export const PURGE_TOKENS_CONFIRMATION = 'prune_expired_tokens';

export function purgeRefreshTokens(): Promise<TokenPurgeReportDto> {
  return apiPost<TokenPurgeReportDto>('/maintenance/refresh-tokens/purge', {
    confirm: PURGE_TOKENS_CONFIRMATION,
  });
}

/** Stan schematu — wyłącznie odczyt; ekran nie uruchamia migracji. */
export function getSchemaState(): Promise<SchemaStateDto> {
  return apiGet<SchemaStateDto>('/maintenance/schema');
}
