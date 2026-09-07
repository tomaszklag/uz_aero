/**
 * UZ Aero - NIESPÓJNOŚCI LOGU SESJI (issue #43, baner trybu edycji `design/10d`).
 *
 * ══ CZYM TO SIĘ RÓŻNI OD `checkAppend` ══
 * `checkAppend` pyta o KANDYDATA do zapisu: „czy wolno dopisać to zdarzenie?". Odpowiada
 * przed zapisem i potrafi odmówić. Ten moduł pyta o CAŁY strumień: „czy to, co już leży
 * w rejestrze, trzyma się kupy?". Nie odmawia niczego - sesja z lotem bez lądowania jest
 * faktem, który się WYDARZYŁ (GPS zgubił lądowanie) i którego nie wolno schować.
 *
 * Dlatego wszystkie naruszenia są tu MIĘKKIE (`warning`), a ekran zamienia je w listę
 * „co jest nie tak i czym to naprawić". Twarde odrzucenie w tym miejscu znaczyłoby, że
 * aplikacja odmawia pokazania danych, które sama zapisała.
 *
 * ══ DLACZEGO ZE STRUMIENIA EFEKTYWNEGO ══
 * Bo pilot poprawia log i musi natychmiast widzieć, czy poprawka pomogła. Sprawdzanie
 * surowego strumienia pokazywałoby niespójności, których już nie ma - a te, które
 * korekta dopiero wprowadziła, przemilczałoby.
 *
 * Każde naruszenie niesie w `details.uuid` adres zdarzenia, którego dotyczy (o ile
 * takie jest) - dzięki temu oś sesji potrafi oznaczyć konkretny wiersz, zamiast zostawiać
 * pilota z listą zarzutów bez wskazania miejsca.
 */

import type { Event, EventOf } from '../events';
import { applyCorrections, type SessionState } from '../projections';
import type { EpochMillis } from '../time';
import type { AircraftLimits } from './sessionRules';
import { FUEL_EPSILON_L, MH_TOLERANCE_H } from './tolerances';
import { warning, type RuleViolation } from './violations';

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): EpochMillis => e.gpsTime ?? e.deviceTime;

const hhmm = (ms: EpochMillis): string => {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/**
 * Niespójności logu sesji - lista dla banera w trybie edycji.
 *
 * @param state  projekcja sesji (loty, biegi, odczyty) - policzona z tych samych zdarzeń.
 * @param events surowy strumień sesji; korekty nakładamy tutaj.
 * @param limits limity samolotu z cache'u referencyjnego (pojemność zbiorników).
 */
export function sessionInconsistencies(
  state: SessionState,
  events: readonly Event[],
  limits: AircraftLimits,
): RuleViolation[] {
  const effective = applyCorrections(events);
  const v: RuleViolation[] = [];

  v.push(...checkFlights(state));
  v.push(...checkRunBracket(state, effective));
  v.push(...checkDrops(state, effective));
  v.push(...checkReadings(state, limits));

  return v;
}

/**
 * Lot bez lądowania i lot o zerowej długości.
 *
 * O braku lądowania mówimy dopiero wtedy, gdy silnik już nie pracuje: dopóki bieg trwa,
 * „lot bez lądowania" znaczy po prostu „samolot jest w powietrzu" i baner alarmowałby
 * w połowie każdego lotu.
 */
function checkFlights(state: SessionState): RuleViolation[] {
  const v: RuleViolation[] = [];
  for (const flight of state.flights) {
    if (flight.landingAt == null) {
      if (state.engineRunning) continue;
      v.push(
        warning(
          'FLIGHT_WITHOUT_LANDING',
          `Lot ${flight.index} nie ma lądowania - start o ${hhmm(flight.takeoffAt)}, a silnik już nie pracuje.`,
          { uuid: flight.takeoffUuid, flight: flight.index, takeoffAt: flight.takeoffAt },
        ),
      );
      continue;
    }
    if (flight.landingAt <= flight.takeoffAt) {
      v.push(
        warning(
          'ZERO_LENGTH_FLIGHT',
          `Lot ${flight.index} kończy się przed startem albo w tej samej minucie (${hhmm(flight.takeoffAt)} → ${hhmm(flight.landingAt)}).`,
          { uuid: flight.landingUuid, flight: flight.index },
        ),
      );
    }
  }
  return v;
}

/** Typy, które muszą wypaść WEWNĄTRZ pracy silnika - samolot nie startuje na postoju. */
const IN_RUN_TYPES: readonly Event['type'][] = ['taxi', 'takeoff', 'landing', 'drop'];

/** Nazwy dla komunikatu; identyfikator zostaje w `details.type`. */
const TYPE_LABEL: Partial<Record<Event['type'], string>> = {
  taxi: 'Kołowanie',
  takeoff: 'Start',
  landing: 'Lądowanie',
  drop: 'Zrzut',
};

/**
 * Zdarzenie poza klamrą biegu silnika.
 *
 * Sesja z otwartym biegiem (silnik pracuje) nie ma jeszcze górnej granicy, więc
 * sprawdzamy wtedy wyłącznie dolną. Sesja bez żadnego biegu nie ma czego naruszyć -
 * milczymy, bo zdarzenia bez klamry opisuje już „lot bez lądowania" albo nic.
 */
function checkRunBracket(state: SessionState, effective: readonly Event[]): RuleViolation[] {
  if (state.legs.length === 0) return [];

  const v: RuleViolation[] = [];
  for (const event of effective) {
    if (!IN_RUN_TYPES.includes(event.type)) continue;
    const time = at(event);
    const inside = state.legs.some(
      (leg) => time >= leg.startedAt && (leg.stoppedAt == null || time <= leg.stoppedAt),
    );
    if (inside) continue;

    const first = state.legs[0]!;
    const last = state.legs[state.legs.length - 1]!;
    const bracket =
      last.stoppedAt == null
        ? `od ${hhmm(first.startedAt)}`
        : `${hhmm(first.startedAt)} – ${hhmm(last.stoppedAt)}`;
    v.push(
      warning(
        'EVENT_OUTSIDE_RUN',
        `${TYPE_LABEL[event.type] ?? 'Zdarzenie'} o ${hhmm(time)} wypada poza pracą silnika (${bracket}).`,
        { uuid: event.uuid, type: event.type, at: time },
      ),
    );
  }
  return v;
}

/**
 * Zrzut zapisany na ziemi.
 *
 * Ta sama reguła istnieje w `checkAppend` (`DROP_ON_GROUND`, pytanie o kandydata) -
 * tutaj patrzymy na zapisany strumień, więc łapiemy także zrzut, który wypadł poza lot
 * DOPIERO po korekcie czasu startu albo lądowania.
 */
function checkDrops(state: SessionState, effective: readonly Event[]): RuleViolation[] {
  const drops = effective.filter((e): e is EventOf<'drop'> => e.type === 'drop');
  if (drops.length === 0) return [];

  const v: RuleViolation[] = [];
  for (const drop of drops) {
    const time = at(drop);
    const inFlight = state.flights.some(
      (f) => time >= f.takeoffAt && (f.landingAt == null || time <= f.landingAt),
    );
    if (inFlight) continue;
    v.push(
      warning(
        'DROP_ON_GROUND',
        `Zrzut ${drop.payload.dropNumber} o ${hhmm(time)} wypada poza lotem - na ziemi nikt nie wyskakuje.`,
        { uuid: drop.uuid, dropNumber: drop.payload.dropNumber, at: time },
      ),
    );
  }
  return v;
}

/**
 * Odczyty: cofnięty licznik, paliwo ponad pojemność, paliwo, które przybyło samo.
 *
 * `MH_REGRESSION` i `FUEL_OVER_CAPACITY` mają tu te same nazwy, co przy zapisie -
 * to ten sam fenomen widziany z drugiej strony (raz jako odmowa zapisu, raz jako opis
 * tego, co już leży w rejestrze, np. po korekcie odczytu startowego).
 */
function checkReadings(state: SessionState, limits: AircraftLimits): RuleViolation[] {
  const v: RuleViolation[] = [];
  const { fuel, mh } = state;

  if (mh.start != null && mh.end != null && mh.end < mh.start) {
    v.push(
      warning(
        'MH_REGRESSION',
        `Licznik przy zdaniu (${mh.end}) jest niższy niż przy przejęciu (${mh.start}).`,
        { start: mh.start, end: mh.end },
      ),
    );
  }

  // Δ MH wyraźnie większa niż czas blokowy - obrotomierz nie potrafi wyprzedzić zegara.
  if (mh.deltaH != null && state.blockTimeMs > 0) {
    const blockH = state.blockTimeMs / 3_600_000;
    if (mh.deltaH > blockH + MH_TOLERANCE_H) {
      v.push(
        warning(
          'MH_DELTA_MISMATCH',
          `Przyrost licznika (${mh.deltaH.toFixed(2)} h) przekracza czas pracy silnika (${blockH.toFixed(2)} h).`,
          { deltaH: mh.deltaH, blockH },
        ),
      );
    }
  }

  if (limits.capacityL != null) {
    for (const [label, value] of [
      ['przy przejęciu', fuel.startL],
      ['przy zdaniu', fuel.endL],
    ] as const) {
      if (value != null && value > limits.capacityL + FUEL_EPSILON_L) {
        v.push(
          warning(
            'FUEL_OVER_CAPACITY',
            `Odczyt paliwa ${label} (${value} L) przekracza pojemność zbiorników (${limits.capacityL} L).`,
            { value, capacityL: limits.capacityL },
          ),
        );
      }
    }
  }

  if (fuel.startL != null && fuel.endL != null) {
    const maxEnd = fuel.startL + fuel.addedL;
    if (fuel.endL > maxEnd + FUEL_EPSILON_L) {
      v.push(
        warning(
          'FUEL_INCREASE_WITHOUT_REFUEL',
          `Przy zdaniu jest więcej paliwa (${fuel.endL} L) niż mogło zostać (${maxEnd} L) - brakuje tankowania.`,
          { endL: fuel.endL, maxEnd },
        ),
      );
    }
  }

  return v;
}
