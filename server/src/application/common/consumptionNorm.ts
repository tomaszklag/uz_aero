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
  fitMhModel,
  type ConsumptionNorm,
  type Event,
  type FuelInterval,
  type MhEquation,
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
  // Równania licznika — jedno na ZDANĄ sesję (`MhEquation`). Do issue #38 były tu
  // wyrzucane: `buildFuelIntervals` zwracało je razem z interwałami, a norma brała same
  // interwały. Telefon nie miał więc czym odpowiedzieć na „czy licznik pokazał tyle,
  // ile powinien" i ekran 10 zastępował odpowiedź twierdzeniem, że ΔMH = czas blokowy.
  const equations: MhEquation[] = [];
  for (const [sessionUuid, stream] of streams) {
    if (stream.length === 0) continue;
    const phaseTimeline = ports.phases == null ? undefined : await ports.phases.read(sessionUuid);
    const session = buildFuelIntervals(stream as Event[], { phaseTimeline });
    intervals.push(...session.intervals);
    if (session.mh != null) equations.push(session.mh);
  }

  // Kolejność ma znaczenie: metryki zbiorcze liczą się na interwałach PRZED oznaczeniem
  // odstających, a pasmo rozrzutu (w `buildConsumptionNorm`) — już po nim.
  const summary = consumptionSummary(intervals);
  const model = fitConsumptionModel(intervals);

  const norm = buildConsumptionNorm(
    { summary, model, intervals, mh: fitMhModel(equations) },
    NORM_WINDOW_DAYS,
    now.getTime(),
  );

  await ports.norms.save(db, aircraftId, NORM_WINDOW_DAYS, norm, now);
  return norm;
}
