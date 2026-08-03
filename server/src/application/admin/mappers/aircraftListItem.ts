/**
 * UZ Aero (serwer) — `AdminAircraftJoin` + stan z telefonów → kontrakt floty (`A07`).
 *
 * Czysta funkcja, jak `pilotListItem.ts` i `sessionListItem.ts`: port oddaje model
 * warstwy aplikacji, a kształt „na drucie" powstaje tutaj i testuje się bez bazy.
 *
 * ══ TO JEST MIEJSCE, W KTÓRYM TOLERANCJA STAJE SIĘ LICZBĄ ══
 * `fuelToleranceL(capacityL)` woła się DOKŁADNIE tu i tylko tu po stronie floty.
 * Panelowi wolno importować z `@uzaero/domain` wyłącznie typy, więc gdyby ta liczba
 * nie wyszła z serwera, ekran musiałby albo ją pominąć (tak było przez cztery
 * przekroje), albo policzyć własnym `Math.max` — czyli zacząć trzymać drugą kopię
 * reguły §4.5. Jedno wywołanie w mapperze zamyka obie te drogi.
 */

import { fuelToleranceL } from '@uzaero/domain';

import type { Handover } from '@uzaero/domain';

import type {
  AdminAircraftClaim,
  AdminAircraftListItem,
  AdminAircraftReading,
  AdminFleetCounts,
} from '../contracts/fleet.ts';
import type { AdminAircraftJoin, FleetCounts } from '../ports.ts';

/** Etykieta konta doklejana do claimu i odczytu; `null` = konta nie ma w `pilots`. */
export interface PilotLabel {
  code: string;
  name: string;
}

/**
 * Wejście mappera poza samym wierszem konfiguracji.
 *
 * `claim` i `handover` przychodzą z `application/common/aircraftStateView.ts` — tych
 * samych funkcji, którymi liczy je `GET /reference` dla telefonu. Dublowanie tej
 * reguły w panelu dałoby drugi wybór przekazania (po `closeTime` zamiast po łańcuchu
 * MH) i dwie różne odpowiedzi na to samo pytanie na dwóch ekranach jednego produktu.
 */
export interface AircraftStateInput {
  claim: { picId: string; since: number | null; sessionUuid: string } | null;
  handover: Handover | null;
  /**
   * `true`, gdy `latestHandover` wziął odczyt z sesji NIEZAMKNIĘTEJ (np. po tankowaniu
   * w trwającym dniu). Rozróżnienie jest treścią podpisu w tabeli i nie da się go
   * odczytać z samego `Handover` — ten niesie wartości, nie ich pochodzenie.
   */
  readingFromOpenSession: boolean;
  /** Nazwiska do claimu i odczytu; klucz = `pilotId`. */
  labels: ReadonlyMap<string, PilotLabel>;
}

export function aircraftListItem(
  join: AdminAircraftJoin,
  state: AircraftStateInput,
): AdminAircraftListItem {
  const { aircraft } = join;

  return {
    id: aircraft.id,
    reg: aircraft.reg,
    type: aircraft.type,
    year: aircraft.year,
    capacityL: aircraft.capacityL,
    fuelToleranceL: fuelToleranceL(aircraft.capacityL),
    mhFormat: aircraft.mhFormat,
    dualRequired: aircraft.dualRequired,
    serviceStatus: aircraft.serviceStatus,
    updatedAt: join.updatedAt.toISOString(),
    claim: claimOf(state),
    reading: readingOf(state),
    lastEventAt: join.lastEventAt?.toISOString() ?? null,
    openSessions: join.openSessions,
    openFlags: join.openFlags,
  };
}

function claimOf(state: AircraftStateInput): AdminAircraftClaim | null {
  if (state.claim == null) return null;
  const label = state.labels.get(state.claim.picId);
  return {
    sessionUuid: state.claim.sessionUuid,
    picId: state.claim.picId,
    picCode: label?.code ?? null,
    picName: label?.name ?? null,
    since: state.claim.since,
  };
}

function readingOf(state: AircraftStateInput): AdminAircraftReading | null {
  const handover = state.handover;
  if (handover == null) return null;
  return {
    mh: handover.reading.mh,
    fuelL: handover.reading.fuelL,
    at: handover.at,
    byPilotId: handover.byPilotId,
    byPilotName: state.labels.get(handover.byPilotId)?.name ?? null,
    source: state.readingFromOpenSession ? 'open_session' : 'handover',
  };
}

/**
 * Liczniki portu → liczniki kontraktu. Przepisanie 1:1, a mapper istnieje mimo to
 * z tego samego powodu co przy kontach: kontrakt nie ma być typem PORTU, bo kształt
 * SQL-a i kształt drutu zmieniają się z różnych powodów.
 */
export function fleetCounts(counts: FleetCounts): AdminFleetCounts {
  return {
    total: counts.total,
    active: counts.active,
    disabled: counts.disabled,
    claimed: counts.claimed,
  };
}
