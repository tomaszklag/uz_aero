/**
 * UZ Aero - SZLAK ODCZYTU PRZY ZDANIU SAMOLOTU (issue #84, ekran 09B).
 *
 * Zgłoszenie z urządzenia: „kliknięcie w przycisk powinno otwierać popup, który już
 * gdzieś mamy - taki co pokazuje, ile było przy przejęciu, ile dolano i ile latano"
 * oraz „analogicznie popup do wpisania motogodzin".
 *
 * ══ CZEGO BRAKOWAŁO ══
 * Arkusz odczytu końcowego miał szlak, ale WYŁĄCZNIE z szacunku normy
 * (`fuelEstimateTrail`), więc maszyna bez policzonego modelu nie pokazywała ani jednego
 * ogniwa - zostawały dwa suche wiersze „Przy przejęciu" i „Dolane w tej operacji".
 * A dokładnie ta operacja jest jedynym miejscem, gdzie pilot ma komplet: zna odczyt
 * początkowy, każdą dolewkę i czas pracy silnika, bo wszystko wydarzyło się w JEGO
 * strumieniu. Norma jest tu dodatkiem, nie warunkiem.
 *
 * ══ SKĄD DANE ══
 * Wyłącznie z lokalnej projekcji i lokalnego strumienia - szlak wychodzi więc offline,
 * jak reszta danych operacji (§6 pkt 1). Zielone ogniwo oczekiwania dokłada się TYLKO
 * z normą i jest jedynym miejscem, w którym cokolwiek jest szacowane; reszta ogniw to
 * fakty z rejestru.
 */

import {
  eventTime,
  expectedFuelL,
  expectedMhH,
  type ConsumptionNorm,
  type Event,
  type MhFormat,
  type SessionState,
} from '../../../domain';
import { duration, litres, motoHours, timeUtc } from '../../format';
import { hoursMinutes } from './refuelMath';

/** Ogniwo szlaku - strukturalnie zgodne z `TrailRow` (logika nie importuje z UI). */
export interface ReleaseTrailRow {
  id: string;
  title: string;
  meta: string;
  tone?: 'green';
}

/** Czasy faz operacji - jedyne, czego potrzebują oba rachunki oczekiwania. */
function times(state: SessionState) {
  return { blockMs: state.blockTimeMs, flightMs: state.flightTimeMs };
}

/**
 * Szlak pod polem „Paliwo na pokładzie": przejęcie → tankowania → ile latano →
 * ile powinno zostać.
 *
 * @param nominalLPerH spalanie z dokumentacji jednostki (issue #66) - wchodzi, gdy
 *   maszyna nie ma jeszcze własnego modelu. Bez niego i bez normy ostatnie ogniwo
 *   po prostu nie powstaje, a trzy pierwsze zostają: to fakty, nie szacunki.
 */
export function fuelReleaseTrail(
  state: SessionState,
  events: readonly Event[],
  norm: ConsumptionNorm | null,
  nominalLPerH: number | null = null,
): ReleaseTrailRow[] {
  const rows: ReleaseTrailRow[] = [];

  if (state.fuel.startL != null && state.claimedAt != null) {
    rows.push({
      id: 'claim',
      title: `Przejęcie · ${timeUtc(state.claimedAt)}`,
      meta: `zastane ${litres(state.fuel.startL)}`,
    });
  }

  /* Każde tankowanie osobnym ogniwem, w porządku CZASU - nie zapisu. Korekta czasu
     i wpis dopisany po fakcie wstawiają zdarzenia „wstecz", a szlak ma opowiadać
     przebieg operacji, nie kolejność, w jakiej trafiał do rejestru. */
  for (const event of [...events].sort((a, b) => eventTime(a) - eventTime(b))) {
    if (event.type !== 'refuel') continue;
    rows.push({
      id: `refuel-${event.uuid}`,
      title: `Tankowanie · ${timeUtc(eventTime(event))}`,
      meta: `dolano +${litres(event.payload.addedL)} · w zbiorniku ${litres(event.payload.afterL)}`,
    });
  }

  const expectation = expectedFuelL(norm, times(state), nominalLPerH);

  if (state.blockTimeMs > 0) {
    rows.push({
      id: 'flown',
      title: `Latano · ${hoursMinutes(state.blockTimeMs)}`,
      /* Z normą mówimy, ile z tego wychodzi litrów; bez niej - ile z tego czasu
         maszyna była w powietrzu. Jedno i drugie jest odpowiedzią na „ile latano",
         tylko z inną dokładnością; pustego ogniwa nie zostawiamy. */
      meta:
        expectation != null
          ? `zużycie z normy ~${Math.round(expectation.value)} L`
          : `w powietrzu ${duration(state.flightTimeMs)}`,
    });
  }

  if (expectation != null && state.fuel.startL != null) {
    const left = Math.max(
      0,
      Math.round(state.fuel.startL + state.fuel.addedL - expectation.value),
    );
    rows.push({
      id: 'expect',
      tone: 'green',
      title: `Szacunkowo zostało ~${left} L`,
      meta: 'z normy samolotu - zweryfikuj ze zbiorników',
    });
  }

  return rows;
}

/**
 * Szlak pod polem „Motogodziny" - ten sam kształt, co przy paliwie.
 *
 * Ogniwa tankowania go nie dotyczą (licznik chodzi z silnikiem, nie z paliwem), więc
 * historia jest krótsza: skąd startował licznik, ile maszyna pracowała i ile powinien
 * pokazać. Ostatnie ogniwo wymaga PRZELICZNIKÓW MH, których maszyna dorabia się później
 * niż normy paliwa - i wtedy go po prostu nie ma.
 */
export function mhReleaseTrail(
  state: SessionState,
  norm: ConsumptionNorm | null,
  format: MhFormat,
): ReleaseTrailRow[] {
  const rows: ReleaseTrailRow[] = [];

  if (state.mh.start != null && state.claimedAt != null) {
    rows.push({
      id: 'claim',
      title: `Przejęcie · ${timeUtc(state.claimedAt)}`,
      meta: `licznik ${motoHours(state.mh.start, format)} MH`,
    });
  }

  if (state.blockTimeMs > 0) {
    rows.push({
      id: 'flown',
      title: `Latano · ${hoursMinutes(state.blockTimeMs)}`,
      meta: `w powietrzu ${duration(state.flightTimeMs)}`,
    });
  }

  const expectation = expectedMhH(norm, times(state));
  if (expectation != null && state.mh.start != null) {
    rows.push({
      id: 'expect',
      tone: 'green',
      title: `Szacunkowo licznik pokaże ~${motoHours(state.mh.start + expectation.value, format)}`,
      meta: 'z przeliczników samolotu - zweryfikuj z licznika',
    });
  }

  return rows;
}
