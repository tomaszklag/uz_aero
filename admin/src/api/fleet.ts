/**
 * UZ Aero - panel 2.0: flota (`/admin/api/fleet*`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * == DLACZEGO PROG JEST TU ZADANIEM, A NIE FUNKCJA ==
 * Próg rozjazdu paliwa to `max(10 L, 5% pojemności)` - a panelowi wolno importować
 * z `@uzaero/domain` wyłącznie typy. Nie ma tu więc czym pomnożyć: liczba przychodzi
 * z serwera, także dla pojemności, która jeszcze nie została zapisana. To wygląda na
 * okrężną drogę i nią jest - ale krótsza droga zaczyna się od `capacityL * 0.05`
 * w formularzu, czyli od drugiej kopii reguły, która za tydzień powie co innego.
 */

import type { MhFormat } from '@uzaero/domain';

import type { AircraftChangeDto, AircraftToleranceDto, FleetPageDto } from './dto';
import { apiDelete, apiGet, apiPatch, apiPost } from './httpClient';

/** Filtr listy tak, jak przyjmuje go trasa. Brak filtra = cała flota. */
export interface FleetListQuery {
  /** `active` / `disabled`; brak = obie grupy. */
  status?: 'active' | 'disabled';
  /** Fragment rejestracji albo typu - dopasowanie zawierające, nie dokładne. */
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
 * Próg rozjazdu paliwa dla POJEMNOSCI wpisywanej w formularzu - odpowiedź na pytanie
 * „co się stanie, jeśli wpiszę 1100".
 *
 * Trasa ma też wariant po `aircraftId`; panel 2.0 go nie potrzebuje, bo pyta zawsze
 * o wartość, którą klient ma właśnie pod palcami.
 */
export function getFuelTolerance(capacityL: number): Promise<AircraftToleranceDto> {
  return apiGet<AircraftToleranceDto>(`/fleet/tolerance?${queryString({ capacityL })}`);
}

/**
 * Nowa jednostka.
 *
 * Dwa różne sposoby powiedzenia „nie wiadomo" i to NIE jest niekonsekwencja panelu,
 * tylko kształt schematów po stronie serwera (`routes/admin/fleet.ts`):
 *  - `year` czyści się PUSTYM NAPISEM (`''`), bo schemat to unia liczby i `''`;
 *    `null` odbiłby się o `400 bad_request`;
 *  - trójka oleju czyści się `null`-em, bo jej schemat jest `nullable()`.
 * Zero nie znaczy w żadnym z nich „brak" - w oleju serwer odrzuci je regułą
 * (`oil_not_positive`), a rocznik zerowy nie mieści się w zakresie 1900-2100.
 */
export interface CreateAircraftBody {
  reg: string;
  type: string;
  year: number | '';
  capacityL: number;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: 'active' | 'disabled';
  oilMinL: number | null;
  oilCapacityL: number | null;
  oilNormLPerH: number | null;
  /** Norma nominalna spalania (issue #66) - czyści się `null`-em, jak olej. */
  fuelNormLPerH: number | null;
  /**
   * Stan początkowy (issue #66) - też `null`-em, ale ZERO jest tu WARTOŚCIĄ, nie brakiem:
   * nowy silnik ma 0 na liczniku, a maszyna przyjęta z pustymi zbiornikami - 0 litrów.
   */
  initialMh: number | null;
  initialFuelL: number | null;
  initialOilL: number | null;
}

/** `PATCH` opisuje ZMIANĘ, nie stan docelowy - pola nieustawione zostają bez zmian. */
export type UpdateAircraftBody = Partial<CreateAircraftBody>;

export function createAircraft(body: CreateAircraftBody): Promise<AircraftChangeDto> {
  return apiPost<AircraftChangeDto>('/fleet', body);
}

export function updateAircraft(id: string, body: UpdateAircraftBody): Promise<AircraftChangeDto> {
  return apiPatch<AircraftChangeDto>(`/fleet/${encodeURIComponent(id)}`, body);
}

/**
 * TRWAŁE usunięcie jednostki - przechodzi WYŁĄCZNIE dla maszyny poza służbą i bez
 * historii. Wszystko inne serwer odmawia z powodem (`aircraft_in_service`,
 * `has_history`), więc panel nie zgaduje: lista nie niesie liczby lotów, a zgadywanie
 * „chyba da się usunąć" byłoby obietnicą przy nieodwracalnej akcji.
 */
export function deleteAircraft(id: string): Promise<void> {
  return apiDelete(`/fleet/${encodeURIComponent(id)}`);
}
