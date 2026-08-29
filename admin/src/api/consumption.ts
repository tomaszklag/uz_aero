/**
 * UZ Aero - panel: analityka zużycia jednego samolotu
 * (`GET /admin/api/fleet/:id/consumption`, mockupy `A10a` / `A10b`).
 *
 * Zasób należy do FLOTY, nie do statystyk - stąd prefiks `/fleet`, mimo że wejście na
 * ekran prowadzi z tabeli statystyk. Analityka opisuje jednostkę, a nie zakres raportu;
 * zakres jest jej parametrem.
 */

import type { ConsumptionReportDto } from './dto';
import { apiGet } from './httpClient';

/** Zakres jako dni UTC `YYYY-MM-DD`, obustronnie domknięty; bez nich serwer bierze 90 dni. */
export interface ConsumptionQuery {
  aircraftId: string;
  from?: string;
  to?: string;
}

export function getConsumption(query: ConsumptionQuery): Promise<ConsumptionReportDto> {
  const params = new URLSearchParams();
  if (query.from != null) params.set('from', query.from);
  if (query.to != null) params.set('to', query.to);

  const suffix = params.toString();
  const path = `/fleet/${encodeURIComponent(query.aircraftId)}/consumption`;
  return apiGet<ConsumptionReportDto>(suffix === '' ? path : `${path}?${suffix}`);
}
