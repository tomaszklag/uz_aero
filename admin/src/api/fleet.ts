/**
 * UZ Aero — panel: flota (`/admin/api/fleet*`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u — zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * ══ DLACZEGO PRÓG FLAGI JEST TU ŻĄDANIEM, A NIE FUNKCJĄ ══
 * Tolerancja `FUEL_MISMATCH` to `max(10 L, 5% pojemności)` — a panelowi wolno
 * importować z `@uzaero/domain` wyłącznie typy (`docs/architektura-panelu-frontend.md`
 * §5.1). Nie ma tu więc czym pomnożyć: liczba przychodzi z serwera, także dla
 * pojemności, która jeszcze nie została zapisana. To wygląda na okrężną drogę i nią
 * jest — ale krótsza droga zaczyna się od `capacityL * 0.05` w formularzu, czyli od
 * drugiej kopii reguły §4.5.
 */

import type { MhFormat } from '@uzaero/domain';

import type { AircraftChangeDto, AircraftToleranceDto, FleetPageDto } from './dto';
import { apiGet, apiPatch, apiPost } from './httpClient';

/** Filtr listy tak, jak przyjmuje go trasa. Brak filtra = cała flota. */
export interface FleetListQuery {
  /** `active` / `disabled`; brak = obie grupy. */
  status?: 'active' | 'disabled';
  /**
   * `'true'`/`'false'` jako NAPIS: query string nie ma typu logicznego, a trasa czyta
   * to enumem — `?claimed=false` znaczy „tylko wolne", nie „bez filtra".
   */
  claimed?: 'true' | 'false';
  /** Fragment rejestracji albo typu — dopasowanie zawierające, nie dokładne. */
  q?: string;
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

export function listFleet(query: FleetListQuery): Promise<FleetPageDto> {
  return apiGet<FleetPageDto>(`/fleet?${queryString(query)}`);
}

/**
 * Próg flagi dla POJEMNOŚCI — pytanie formularza `A07a` („co się stanie, jeśli wpiszę
 * 1100"). Wariant po `aircraftId` obsługuje ta sama trasa; dokładamy go, gdy pojawi się
 * ekran, który zna samolot, a nie zna pojemności (`A02a`, `A02b`).
 */
export function getFuelTolerance(capacityL: number): Promise<AircraftToleranceDto> {
  return apiGet<AircraftToleranceDto>(`/fleet/tolerance?${queryString({ capacityL })}`);
}

/** Nowa jednostka. `year` pomijamy, gdy nieznany — kolumna jest `NULL`-owalna. */
export interface CreateAircraftBody {
  reg: string;
  type: string;
  year?: number | '';
  capacityL: number;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: 'active' | 'disabled';
}

export function createAircraft(body: CreateAircraftBody): Promise<AircraftChangeDto> {
  return apiPost<AircraftChangeDto>('/fleet', body);
}

/** `PATCH` opisuje ZMIANĘ, nie stan docelowy — pola nieustawione zostają bez zmian. */
export interface UpdateAircraftBody {
  reg?: string;
  type?: string;
  year?: number | '';
  capacityL?: number;
  mhFormat?: MhFormat;
  dualRequired?: boolean;
  serviceStatus?: 'active' | 'disabled';
}

export function updateAircraft(id: string, body: UpdateAircraftBody): Promise<AircraftChangeDto> {
  return apiPatch<AircraftChangeDto>(`/fleet/${encodeURIComponent(id)}`, body);
}
