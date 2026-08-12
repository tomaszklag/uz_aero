/**
 * UZ Aero — norma zużycia dla APLIKACJI PILOTA (ekrany 04, 06, 10).
 *
 * ══ DLACZEGO OSOBNY WIDOK, A NIE CAŁY MODEL ══
 * Panel dostaje wszystko: stawki per faza, przedziały, reszty, interwały ze źródłami.
 * Telefon dostaje kilkanaście liczb i nic więcej — bo tyle mieści się w pytaniach, które
 * zadaje pilot: „czy dzisiejsze 16 L/h to normalne", „na ile mi jeszcze starczy" i (od
 * issue #38) „czy licznik pokazał tyle, ile powinien". Wysyłanie do telefonu pełnego
 * modelu byłoby przenoszeniem ciężaru analizy tam, gdzie nie ma jej kto wykonać —
 * a przy okazji rozdmuchaniem odpowiedzi, którą każdy telefon pobiera co kwadrans.
 *
 * ══ PRÓG PUBLIKACJI OBOWIĄZUJE TU TAK SAMO ══
 * `null` znaczy „nie ma czego pokazać" i ekran ma wtedy MILCZEĆ o normie, a nie
 * pokazywać zera. Pilot, który zobaczy „norma 0 L/h", straci zaufanie do wszystkich
 * pozostałych liczb na tym ekranie — i słusznie. Dotyczy to osobno paliwa i osobno
 * motogodzin: samolot potrafi mieć opublikowane stawki paliwa i jeszcze nie mieć
 * przeliczników licznika (inne wejście, inny próg — `MIN_PUBLISH_MH_DAYS`).
 */

import type { EpochMillis } from '../time';
import type { ConsumptionNorm, MhNorm } from '../reference';
import type { FuelInterval } from './interval';
import type { ConsumptionModel } from './model';
import type { MhModel } from './mhModel';
import type { ConsumptionSummary } from './summary';
import { fuelRatioBand, mhRatioBand } from './ratio';

/** Wejście składania normy — cztery rzeczy policzone nad tym samym oknem. */
export interface ConsumptionNormInput {
  summary: ConsumptionSummary;
  model: ConsumptionModel;
  /**
   * Interwały okna **po dopasowaniu modelu**: `fitConsumptionModel` oznacza odstające
   * wprost na nich, więc kolejność wywołań decyduje o tym, co wejdzie do pasma rozrzutu.
   */
  intervals: readonly FuelInterval[];
  /** Model przeliczników licznika; niedopasowany daje po prostu `mh: null` w normie. */
  mh: MhModel;
}

/**
 * Składa normę z metryk zbiorczych, modelu fazowego i modelu motogodzin.
 *
 * `null`, gdy model paliwa nie przeszedł bramki publikacji albo pasma nie da się
 * policzyć — czyli dokładnie wtedy, gdy panel pokazuje ekran `A10b`. Model MH jest
 * dokładany niezależnie: jego brak nie unieważnia normy paliwa i odwrotnie.
 *
 * @param windowDays szerokość okna, z którego liczono — podpis „· 90 dni" na ekranie.
 */
export function buildConsumptionNorm(
  input: ConsumptionNormInput,
  windowDays: number,
  computedAt: EpochMillis,
): ConsumptionNorm | null {
  const { summary, model, intervals, mh } = input;

  if (!model.published) return null;
  if (summary.blockLPerHP10 == null || summary.blockLPerHP90 == null) return null;
  if (summary.litersPerBlockHour == null) return null;

  const rates = twoRates(model);
  const spread = rates == null ? null : fuelRatioBand(intervals, rates.groundLPerH, rates.airLPerH);

  return {
    windowDays,
    blockLPerHLow: summary.blockLPerHP10,
    blockLPerHHigh: summary.blockLPerHP90,
    blockLPerH: summary.litersPerBlockHour,
    airLPerH: rates?.airLPerH ?? null,
    groundLPerH: rates?.groundLPerH ?? null,
    litersPerFlight: summary.litersPerFlight,
    fuelRatioLow: spread?.low ?? null,
    fuelRatioHigh: spread?.high ?? null,
    mh: mhNorm(mh),
    intervals: summary.intervals,
    engineMs: summary.engineMs,
    computedAt,
  };
}

/**
 * Para stawek (ziemia, powietrze) — jedyny podział, który telefon umie zastosować.
 *
 * ══ DLACZEGO MODEL CZTEROFAZOWY SIĘ TU SKLEJA ══
 * Telefon nie ma faz pionowych: zna czas lotu i czas blokowy z własnej projekcji, a
 * rozbicie na wznoszenie/przelot/zniżanie wymagałoby przeliczenia śladu GPS przy każdym
 * otwarciu ekranu. Model czterofazowy sklejamy więc do jednej stawki „w powietrzu",
 * ważąc fazy ich udziałem w oknie.
 *
 * ══ DLACZEGO ŚREDNIA WAŻONA, A NIE SAM PRZELOT ══
 * Do issue #38 stawką lotu był `cruise` — „bo to on opisuje większość czasu w powietrzu".
 * Dla dnia skokowego to nieprawda: wyniesienie to prawie samo wznoszenie i zniżanie,
 * a `cruise` jest najniższą ze stawek. Błąd szedł w najgorszą możliwą stronę, bo tej
 * samej liczby używa szacunek rezerwy paliwa (`liftsRemaining`) — zaniżona stawka
 * zawyża pozostały czas lotu. Średnia ważona proporcjami okna opisuje maszynę tak,
 * jak ona faktycznie lata.
 */
function twoRates(model: ConsumptionModel): { groundLPerH: number; airLPerH: number } | null {
  const ground = model.rates.find((rate) => rate.phase === 'ground');
  if (ground == null) return null;

  const air = model.rates.find((rate) => rate.phase === 'air');
  if (air != null) return { groundLPerH: ground.lPerH, airLPerH: air.lPerH };

  const vertical = model.rates.filter(
    (rate) => rate.phase === 'climb' || rate.phase === 'cruise' || rate.phase === 'descent',
  );
  const hours = vertical.reduce((sum, rate) => sum + rate.hoursInWindowMs, 0);
  if (vertical.length === 0 || hours <= 0) return null;

  const blended =
    vertical.reduce((sum, rate) => sum + rate.lPerH * rate.hoursInWindowMs, 0) / hours;
  return { groundLPerH: ground.lPerH, airLPerH: blended };
}

/** Przeliczniki licznika dla telefonu; `null` = model nieopublikowany (patrz nagłówek). */
function mhNorm(model: MhModel): MhNorm | null {
  if (!model.published) return null;
  if (model.perFlightHour == null || model.perGroundHour == null) return null;

  const spread = mhRatioBand(model.rows);

  return {
    kind: model.kind,
    perFlightHour: model.perFlightHour,
    perGroundHour: model.perGroundHour,
    ratioLow: spread?.low ?? null,
    ratioHigh: spread?.high ?? null,
    sessions: model.equations,
  };
}
