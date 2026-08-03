/**
 * UZ Aero (serwer) — kształt wiersza tabeli `sessions` i jego mapowanie na `SessionRow`.
 *
 * Wydzielone z `sessionsProjection.ts`, bo od przekroju 2 panelu czyta tę tabelę DRUGI
 * adapter (`admin/sessionsRepo.ts` — lista dni ze złączeniami). Dwie kopie mapowania
 * kolumn to dokładnie ta klasa błędu, przed którą broni `test/schema.test.ts`: literówka
 * w nazwie kolumny nie jest błędem typów, tylko `undefined` w runtime — a rozjazd dwóch
 * kopii byłby widoczny dopiero jako różnica między listą a szczegółem dnia.
 *
 * Model persystencji zostaje PRYWATNY dla `infrastructure/` (`docs/architektura-panelu-serwer.md`
 * §1.1): panel widzi wyłącznie DTO, warstwa aplikacji — `SessionRow`.
 */

import { isOperationType } from '@uzaero/domain';

import type { SessionRow } from '../../application/common/ports.ts';

export interface SessionDbRow {
  session_uuid: string;
  aircraft_id: string;
  pic_id: string;
  dual_id: string | null;
  status: string;
  claim_time: string | null;
  close_time: string | null;
  operation: string | null;
  client: string | null;
  mh_start: number | null;
  mh_end: number | null;
  fuel_start_l: number | null;
  fuel_end_l: number | null;
  fuel_last_l: number | null;
  mh_last: number | null;
  block_ms: string;
  flight_ms: string;
  flights_count: number;
  takeoff_count: number | null;
  landing_count: number | null;
  mh_delta_h: number | null;
  fuel_consumed_l: number | null;
  drop_count: number | null;
  jumpers_tandem: number | null;
  jumpers_aff: number | null;
  jumpers_solo: number | null;
  drop_alt_sum_ft: number | null;
  drop_alt_count: number | null;
}

/**
 * Lista kolumn projekcji z aliasem tabeli — żeby zapytanie ze złączeniami nie musiało
 * jej przepisywać, a `SELECT *` nie wciągał kolumn dołączonych tabel o tych samych
 * nazwach (`updated_at` jest w `sessions`, `aircraft` i `pilots`).
 */
export const sessionColumns = (alias: string): string =>
  [
    'session_uuid',
    'aircraft_id',
    'pic_id',
    'dual_id',
    'status',
    'claim_time',
    'close_time',
    'operation',
    'client',
    'mh_start',
    'mh_end',
    'fuel_start_l',
    'fuel_end_l',
    'fuel_last_l',
    'mh_last',
    'block_ms',
    'flight_ms',
    'flights_count',
    'takeoff_count',
    'landing_count',
    'mh_delta_h',
    'fuel_consumed_l',
    'drop_count',
    'jumpers_tandem',
    'jumpers_aff',
    'jumpers_solo',
    'drop_alt_sum_ft',
    'drop_alt_count',
  ]
    .map((column) => `${alias}.${column}`)
    .join(', ');

/**
 * `BIGINT` wraca z `pg` jako string (nie mieści się w `number` bez straty) — konwersja
 * jest tu jawna i w jednym miejscu.
 *
 * Wartość `operation` spoza katalogu rzuca, a nie jest po cichu zerowana: od migracji 11
 * pilnuje jej `CHECK` w bazie, więc obecność innej wartości znaczy, że ktoś zdjął
 * ograniczenie albo grzebał ręcznie — a wtedy cisza byłaby najgorszą z opcji (ten sam
 * argument, co przy `flags.type` w `flagsRepo.ts`).
 */
export function toSessionRow(r: SessionDbRow): SessionRow {
  if (r.operation != null && !isOperationType(r.operation)) {
    throw new Error(`Nieznany rodzaj operacji w bazie: ${r.operation} (sesja ${r.session_uuid})`);
  }
  return {
    sessionUuid: r.session_uuid,
    aircraftId: r.aircraft_id,
    picId: r.pic_id,
    dualId: r.dual_id,
    status: r.status === 'closed' ? 'closed' : 'active',
    claimTime: r.claim_time != null ? Number(r.claim_time) : null,
    closeTime: r.close_time != null ? Number(r.close_time) : null,
    operation: r.operation,
    client: r.client,
    mhStart: r.mh_start,
    mhEnd: r.mh_end,
    fuelStartL: r.fuel_start_l,
    fuelEndL: r.fuel_end_l,
    fuelLastL: r.fuel_last_l,
    mhLast: r.mh_last,
    blockMs: Number(r.block_ms),
    flightMs: Number(r.flight_ms),
    flightsCount: r.flights_count,
    // `NULL` w kolumnach migracji 18 zostaje `null` — to „wiersz sprzed migracji,
    // nieprzeliczony", a nie zero. Zamiana na 0 zafałszowałaby agregaty `A10`.
    takeoffCount: r.takeoff_count,
    landingCount: r.landing_count,
    mhDeltaH: r.mh_delta_h,
    fuelConsumedL: r.fuel_consumed_l,
    dropCount: r.drop_count,
    jumpersTandem: r.jumpers_tandem,
    jumpersAff: r.jumpers_aff,
    jumpersSolo: r.jumpers_solo,
    dropAltSumFt: r.drop_alt_sum_ft,
    dropAltCount: r.drop_alt_count,
  };
}
