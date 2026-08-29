/**
 * UZ Aero - panel: monitor eksportu kart dziennych (`/admin/api/exports*`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * ══ DLACZEGO PODGLĄD KARTY IDZIE POD PREFIKS PANELU ══
 * Karta ma już swoją trasę: `GET /sheets/:tab`, cel linków z ekranu 11 telefonu. Panel
 * jej NIE użyje i nie jest to kwestia wygody - sesja panelu jedzie ciasteczkiem
 * `uzaero_admin` o `Path=/admin`, więc do `/sheets/*` przeglądarka jej po prostu nie
 * wyśle. Poszerzenie ścieżki ciasteczka posłałoby poświadczenie panelu razem z KAŻDYM
 * żądaniem telefonu, czyli byłoby odwrotnością tego, co ma osiągnąć. Stąd
 * `/exports/:sessionUuid/sheet`, czytające tę samą treść tym samym portem.
 */

import type {
  ExportHistoryDto,
  ExportPageDto,
  ExportRetryResultDto,
  ExportStateDto,
  SheetPreviewDto,
} from './dto';
import { apiGet, apiPost } from './httpClient';

/** Filtr monitora tak, jak przyjmuje go trasa. Brak filtra = cały rejestr do `limit`. */
export interface ExportListQuery {
  /** Dzień UTC `YYYY-MM-DD` włącznie - trasa filtruje po DNIACH, nie po stemplach. */
  from?: string;
  to?: string;
  aircraftId?: string;
  /** Fragment rejestracji, identyfikatora samolotu albo uuid-a sesji. */
  q?: string;
  /**
   * Zawężenie do jednego stanu karty. Zawęża SERWER, nie panel: skład listy jest
   * własnością serwera, a chip z liczbą jest obietnicą „tyle wierszy zobaczysz" -
   * dwie definicje stanu (jedna w liczniku, druga w `.filter()`) to dokładnie ten
   * rozjazd, który panel ma wykrywać, a nie produkować.
   */
  state?: ExportStateDto;
  /**
   * Twardy limit wierszy. BEZPIECZNIK, nie strona: liczniki opisują cały zakres
   * niezależnie od niego, a `ExportPageDto.truncated` mówi, czy coś zostało obcięte.
   */
  limit?: number;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Pola nieustawione POMIJAMY zamiast wysyłać puste: `?q=` to dla zoda po drugiej
    // stronie napis pusty, czyli 400, a nie „bez filtra".
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function listExports(query: ExportListQuery): Promise<ExportPageDto> {
  return apiGet<ExportPageDto>(`/exports?${queryString(query)}`);
}

/** Historia rewizji jednej karty - rozwinięcie wiersza. */
export function getExportHistory(sessionUuid: string): Promise<ExportHistoryDto> {
  return apiGet<ExportHistoryDto>(`/exports/${encodeURIComponent(sessionUuid)}`);
}

/** Treść BIEŻĄCEJ karty - patrz nagłówek pliku. */
export function getSheetPreview(sessionUuid: string): Promise<SheetPreviewDto> {
  return apiGet<SheetPreviewDto>(`/exports/${encodeURIComponent(sessionUuid)}/sheet`);
}

/**
 * Ponowienie eksportu. Bramek §4.7 NIE omija - odmowa wraca w ciele 200, więc ta
 * funkcja rozwiązuje obietnicę także wtedy, gdy nic nie poszło do arkusza. Rozstrzyga
 * o tym `retry.outcome`, nie wyjątek.
 */
export function retryExport(sessionUuid: string): Promise<ExportRetryResultDto> {
  return apiPost<ExportRetryResultDto>(`/exports/${encodeURIComponent(sessionUuid)}/retry`);
}
