/**
 * UZ Aero (serwer) — liczenie i zapis NORMY ZUŻYCIA samolotu.
 *
 * ══ DLACZEGO W `common/`, A NIE W `admin/` ══
 * Normę produkuje analityka panelu, ale konsumuje ją aplikacja pilota (`GET /reference`,
 * ekrany 04/06/10). Oś powierzchni z `architecture.test.ts` mówi wprost: `mobile/` nie
 * może importować z `admin/`, a `common/` nie może z żadnej z nich. Kod wspólny dla obu
 * końców musi więc wylądować tutaj — dokładnie jak `aircraftStateView.ts`, przeniesiony
 * z `mobile/` do `common/` przy pierwszym konsumencie po stronie panelu.
 *
 * ══ KIEDY TO SIĘ LICZY ══
 * Po przyjęciu paczki zdarzeń, dla samolotów, których dzień właśnie się zamknął —
 * i to POZA transakcją ingestu. Telefon dostaje 200 za PRZYJĘCIE zdarzeń; przeliczenie
 * modelu jest skutkiem, nie warunkiem. Awaria regresji nie ma prawa zamienić dostarczonej
 * paczki w wieczny retry outboxa (ten sam argument, co przy eksporcie karty dnia).
 */

import {
  buildConsumptionNorm,
  buildFuelIntervals,
  consumptionSummary,
  fitConsumptionModel,
  type ConsumptionNorm,
  type Event,
  type FuelInterval,
} from '@uzaero/domain';

import type {
  ConsumptionNormPort,
  EventsStorePort,
  PhaseTimelinePort,
  Queryable,
} from './ports.ts';

/**
 * Okno, z którego liczy się norma dla telefonu (90 dni).
 *
 * Ta sama szerokość, co domyślny zakres ekranu `A10a` — żeby liczba w kokpicie i liczba
 * w panelu opisywały ten sam okres. Rozjazd między nimi byłby pytaniem, na które nikt
 * nie umiałby odpowiedzieć przy telefonie w ręku.
 */
export const NORM_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

export interface ConsumptionNormPorts {
  events: EventsStorePort;
  norms: ConsumptionNormPort;
  /**
   * Oś faz pionowych ze śladu GPS; pominięta = model liczy się na dwóch fazach
   * (ziemia / powietrze). Norma dla telefonu potrzebuje stawki LOTU, a tę daje już
   * model dwufazowy — rozbicie na fazy pionowe zwiększa jej dokładność, ale nie jest
   * warunkiem jej istnienia.
   */
  phases?: PhaseTimelinePort;
}

/**
 * Przelicza i zapisuje normę dla jednego samolotu.
 *
 * `null` w wyniku znaczy „model poniżej progu publikacji" — wtedy wiersz jest KASOWANY,
 * a nie zostawiany. Norma, która przestała się publikować (wyzerowana po remoncie, zbyt
 * mało świeżych dni), nie ma prawa dalej podpowiadać pilotowi starej liczby.
 */
export async function recomputeConsumptionNorm(
  db: Queryable,
  aircraftId: string,
  ports: ConsumptionNormPorts,
  now: Date,
): Promise<ConsumptionNorm | null> {
  const range = { fromMs: now.getTime() - NORM_WINDOW_DAYS * DAY_MS, toMs: now.getTime() };

  const sessionUuids = await ports.norms.closedSessionUuids(db, aircraftId, range);
  const streams = await ports.events.sessionStreams(db, sessionUuids);

  const intervals: FuelInterval[] = [];
  for (const [sessionUuid, stream] of streams) {
    if (stream.length === 0) continue;
    const phaseTimeline = ports.phases == null ? undefined : await ports.phases.read(sessionUuid);
    intervals.push(...buildFuelIntervals(stream as Event[], { phaseTimeline }).intervals);
  }

  const norm = buildConsumptionNorm(
    consumptionSummary(intervals),
    fitConsumptionModel(intervals),
    NORM_WINDOW_DAYS,
    now.getTime(),
  );

  await ports.norms.save(db, aircraftId, NORM_WINDOW_DAYS, norm, now);
  return norm;
}
