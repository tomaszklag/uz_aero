/**
 * UZ Aero - panel 2.0: DZIENNIK (`/admin/api/log`, `/admin/api/sessions*`).
 *
 * Jeden plik = jeden moduł, mimo dwóch prefiksów tras - bo to jest jedna droga
 * czytelnika: flota w zakresie → sesje jednej maszyny → jedna sesja. Rozbicie tego
 * na trzy pliki po prefiksie serwera opisywałoby układ SERWERA, a nie sposób, w jaki
 * korzysta się z modułu.
 *
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice.
 */

import type { LogReportDto, SessionDetailDto, SessionPageDto } from './dto';
import { apiGet } from './httpClient';

/** Zakres dat jak w całym panelu: dzień UTC `YYYY-MM-DD`, obustronnie domknięty. */
export interface LogRangeQuery {
  from?: string;
  to?: string;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

/** Poziom 1: cała flota w zakresie, także maszyny, które nie latały. */
export function loadLog(query: LogRangeQuery): Promise<LogReportDto> {
  return apiGet<LogReportDto>(`/log?${queryString(query)}`);
}

/**
 * Poziom 2: sesje JEDNEJ maszyny w zakresie.
 *
 * `limit` jest bezpiecznikiem, nie stronicowaniem: zakres wybiera człowiek, a klub
 * nie robi setek sesji w miesiącu. Gdy odpowiedź ma `nextCursor`, ekran mówi wprost,
 * że lista jest przycięta - lista ucięta po cichu wygląda jak komplet.
 */
export interface SessionListQuery extends LogRangeQuery {
  aircraftId: string;
  limit: number;
}

export function listSessions(query: SessionListQuery): Promise<SessionPageDto> {
  return apiGet<SessionPageDto>(`/sessions?${queryString(query)}`);
}

/** Poziom 3: jedna sesja - stan policzony projekcją, surowa oś zdarzeń i flagi. */
export function loadSession(uuid: string): Promise<SessionDetailDto> {
  return apiGet<SessionDetailDto>(`/sessions/${encodeURIComponent(uuid)}`);
}
