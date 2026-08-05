/**
 * UZ Aero — norma zużycia dla APLIKACJI PILOTA (ekrany 04, 06, 10).
 *
 * ══ DLACZEGO OSOBNY WIDOK, A NIE CAŁY MODEL ══
 * Panel dostaje wszystko: stawki per faza, przedziały, reszty, interwały ze źródłami.
 * Telefon dostaje cztery liczby i nic więcej — bo tyle mieści się w pytaniu, które
 * zadaje pilot: „czy dzisiejsze 16 L/h to normalne" i „na ile mi jeszcze starczy".
 * Wysyłanie do telefonu pełnego modelu byłoby przenoszeniem ciężaru analizy tam, gdzie
 * nie ma jej kto wykonać — a przy okazji rozdmuchaniem odpowiedzi, którą każdy telefon
 * pobiera co kwadrans.
 *
 * ══ PRÓG PUBLIKACJI OBOWIĄZUJE TU TAK SAMO ══
 * `null` znaczy „nie ma czego pokazać" i ekran ma wtedy MILCZEĆ o normie, a nie
 * pokazywać zera. Pilot, który zobaczy „norma 0 L/h", straci zaufanie do wszystkich
 * pozostałych liczb na tym ekranie — i słusznie.
 */

import type { EpochMillis } from '../time';
import type { ConsumptionNorm } from '../reference';
import type { ConsumptionModel } from './model';
import type { ConsumptionSummary } from './summary';

/**
 * Składa normę z metryk zbiorczych i modelu fazowego.
 *
 * `null`, gdy model nie przeszedł bramki publikacji albo pasma nie da się policzyć —
 * czyli dokładnie wtedy, gdy panel pokazuje ekran `A10b`.
 *
 * @param windowDays szerokość okna, z którego liczono — podpis „· 90 dni" na ekranie.
 */
export function buildConsumptionNorm(
  summary: ConsumptionSummary,
  model: ConsumptionModel,
  windowDays: number,
  computedAt: EpochMillis,
): ConsumptionNorm | null {
  if (!model.published) return null;
  if (summary.blockLPerHP10 == null || summary.blockLPerHP90 == null) return null;
  if (summary.litersPerBlockHour == null) return null;

  return {
    windowDays,
    blockLPerHLow: summary.blockLPerHP10,
    blockLPerHHigh: summary.blockLPerHP90,
    blockLPerH: summary.litersPerBlockHour,
    airLPerH: airRate(model),
    litersPerFlight: summary.litersPerFlight,
    intervals: summary.intervals,
    engineMs: summary.engineMs,
    computedAt,
  };
}

/**
 * Stawka W POWIETRZU — potrzebna kokpitowi do rezerwy i szacunku wystarczalności.
 *
 * Bierzemy ją z modelu dwufazowego (`air`), a przy czterofazowym z przelotu (`cruise`),
 * bo to on opisuje większość czasu w powietrzu. Model zdegradowany do jednej fazy jej
 * NIE MA — i wtedy `null`, bo stawka „silnika" miesza kołowanie z lotem, a rezerwa
 * liczona z niej byłaby zaniżona. Zaniżona rezerwa to gorszy błąd niż jej brak.
 */
function airRate(model: ConsumptionModel): number | null {
  const air = model.rates.find((rate) => rate.phase === 'air');
  if (air != null) return air.lPerH;

  const cruise = model.rates.find((rate) => rate.phase === 'cruise');
  return cruise?.lPerH ?? null;
}
