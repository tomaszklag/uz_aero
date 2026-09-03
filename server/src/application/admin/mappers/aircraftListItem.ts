/**
 * UZ Aero (serwer) - `AdminAircraftJoin` + stan z telefonów → kontrakt floty (`A07`).
 *
 * Czysta funkcja, jak `pilotListItem.ts` i `sessionListItem.ts`: port oddaje model
 * warstwy aplikacji, a kształt „na drucie" powstaje tutaj i testuje się bez bazy.
 *
 * ══ TO JEST MIEJSCE, W KTÓRYM TOLERANCJA STAJE SIĘ LICZBĄ ══
 * `fuelToleranceL(capacityL)` woła się DOKŁADNIE tu i tylko tu po stronie floty.
 * Panelowi wolno importować z `@uzaero/domain` wyłącznie typy, więc gdyby ta liczba
 * nie wyszła z serwera, ekran musiałby albo ją pominąć (tak było przez cztery
 * przekroje), albo policzyć własnym `Math.max` - czyli zacząć trzymać drugą kopię
 * reguły §4.5. Jedno wywołanie w mapperze zamyka obie te drogi.
 */

import { fuelToleranceL } from '@uzaero/domain';

import type { Handover } from '@uzaero/domain';

import type { HandoverSource } from '../../common/aircraftStateView.ts';

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
 * `claim` i `handover` przychodzą z `application/common/aircraftStateView.ts` - tych
 * samych funkcji, którymi liczy je `GET /reference` dla telefonu. Dublowanie tej
 * reguły w panelu dałoby drugi wybór przekazania (po `closeTime` zamiast po łańcuchu
 * MH) i dwie różne odpowiedzi na to samo pytanie na dwóch ekranach jednego produktu.
 */
export interface AircraftStateInput {
  claim: { picId: string; since: number | null; sessionUuid: string } | null;
  handover: Handover | null;
  /**
   * Skąd wzięty jest odczyt - `pickHandover().source`. Rozróżnienie jest treścią
   * podpisu w tabeli i nie da się go odczytać z samego `Handover`: ten niesie
   * wartości, nie ich pochodzenie. `null` = przekazania nie ma w ogóle.
   *
   * Do issue #66 był tu boolean `readingFromOpenSession`, bo warianty były DWA.
   * Trzeci (`initial` - stan początkowy z panelu) nie mieści się w tak/nie, a dopisanie
   * drugiego boolean-a obok pierwszego pozwoliłoby wyrazić stan „i to, i to".
   */
  readingSource: HandoverSource | null;
  /**
   * Konto administratora, które WPISAŁO odczyt, i jego komentarz (issue #81) -
   * wyłącznie przy `readingSource: 'admin'`; `null` poza tym. Podpis pola „Aktualny
   * stan" w karcie samolotu: kto zdecydował i dlaczego.
   */
  enteredBy: string | null;
  note: string | null;
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
    oilMinL: aircraft.oilMinL,
    oilCapacityL: aircraft.oilCapacityL,
    oilNormLPerH: aircraft.oilNormLPerH,
    fuelNormLPerH: aircraft.fuelNormLPerH,
    initialMh: aircraft.initialMh,
    initialFuelL: aircraft.initialFuelL,
    initialOilL: aircraft.initialOilL,
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
  // Suma „pomiar + dolewki po nim" liczy się TUTAJ, nie w panelu - ta sama zasada,
  // co przy `fuelToleranceL` wyżej i `oilAfterL` na liście operacji.
  const oil = handover.oil ?? null;
  // Podpis: pilot, który PRZEKAZAŁ, albo administrator, który WPISAŁ (issue #81) -
  // `byPilotId` zostaje `null` przy wpisie z panelu (nikt maszyny nie przekazał),
  // a nazwisko idzie z konta administratora, żeby karta mówiła, kto zdecydował.
  const signer = handover.byPilotId ?? state.enteredBy;
  return {
    mh: handover.reading.mh,
    fuelL: handover.reading.fuelL,
    at: handover.at,
    byPilotId: handover.byPilotId,
    byPilotName: signer == null ? null : (state.labels.get(signer)?.name ?? null),
    oilL: oil == null ? null : oil.levelL + oil.addedSinceL,
    oilAddedSinceL: oil == null ? null : oil.addedSinceL,
    oilAt: oil?.at ?? null,
    source: state.readingSource ?? 'handover',
    note: state.note,
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
