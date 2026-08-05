/**
 * UZ Aero — panel: statystyki floty i pilotów (`GET /admin/api/stats`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Jedno żądanie oddaje WSZYSTKIE trzy ujęcia (samolot / pilot / operacja) naraz —
 * to ten sam zbiór dni policzony w trzech przekrojach i sumy muszą się zgadzać
 * między ujęciami, więc przełącznik ujęcia jest sprawą EKRANU, nie zapytania.
 */

import type { StatsReportDto } from './dto';
import { apiGet } from './httpClient';

/**
 * Zakres jako dni UTC `YYYY-MM-DD`, obustronnie domknięty. OBA pola opcjonalne:
 * bez nich serwer stosuje zakres domyślny (ostatnie 30 dni od DZIŚ swojego zegara)
 * i mówi o tym w `range.defaulted` — panel nie rozstrzyga, co znaczy „dziś".
 */
export interface StatsQuery {
  from?: string;
  to?: string;
}

export function getStats(query: StatsQuery): Promise<StatsReportDto> {
  const params = new URLSearchParams();
  if (query.from != null) params.set('from', query.from);
  if (query.to != null) params.set('to', query.to);
  const suffix = params.toString();
  return apiGet<StatsReportDto>(suffix === '' ? '/stats' : `/stats?${suffix}`);
}
