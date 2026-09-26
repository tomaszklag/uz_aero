/**
 * Ninerdeck - panel 3.2: STATYSTYKI zakresu (`/admin/api/stats`).
 *
 * Jeden plik = jeden moduł panelu. Trasa oddaje TRZY przekroje jednego zbioru operacji
 * w jednej odpowiedzi (per maszyna / pilot / zadanie) plus szereg dzienny - celowo, bo
 * sumy MUSZĄ się zgadzać między tabelami, a trzy osobne żądania dałyby trzy chwile bazy.
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice.
 */

import type { StatsReportDto } from './dto';
import { apiGet } from './httpClient';

/** Zakres dat jak w dzienniku: dzień UTC `YYYY-MM-DD`, obustronnie domknięty; brak = domyślny serwera. */
export interface StatsQuery {
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

export function loadStats(query: StatsQuery): Promise<StatsReportDto> {
  return apiGet<StatsReportDto>(`/stats?${queryString(query)}`);
}
