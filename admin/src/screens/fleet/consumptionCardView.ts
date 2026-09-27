/**
 * Ninerdeck - panel 3.2: karta „ZUŻYCIE Z LOTÓW" w szufladzie samolotu - raport analityki
 * na treść karty (`docs/panel-3.2.md` §8, §17 pkt 11; makieta `samoloty-karta`, S2c).
 *
 * Moduł CZYSTY. Trzy reguły, wszystkie rozstrzygnięte gdzie indziej i tu tylko stosowane:
 *
 *  1. **brak danych = milczenie** (issue #69): model paliwa poniżej progu publikacji
 *     znaczy, że nie ma czego pokazać - i wtedy karty NIE MA WCALE (`null`). Ani zer
 *     w miejscu pomiaru, ani zdania „nie ma jeszcze danych". Wiersz „Motogodziny" gaśnie
 *     OSOBNO: inne wejście, inny próg publikacji;
 *  2. **norma z lotów i norma z dokumentacji to dwie różne liczby** (issue #66): pasmo
 *     ZMIERZONE jest wypełnieniem, norma ZADEKLAROWANA markerem - a wiersz mówi, którą
 *     pokazuje, i podaje odchyłkę jednej od drugiej, bo o to prosiło tamto zgłoszenie;
 *  3. **panel nie liczy po swojemu**: pasmo, stawki fazowe i odchyłka przychodzą
 *     policzone. Jedyna arytmetyka tutaj to GEOMETRIA paska - gdzie na osi 20–40 L/h
 *     stoi 28,4 - czyli to, co arkusz stylów robi z jednostkami.
 */

import { dateUtcShort, plural } from '@ninerdeck/format';

import type { ConsumptionReportDto } from '../../api/dto';

export interface ConsumptionKv {
  label: string;
  value: string;
  /** Jednostka i przypis drobnym za liczbą. */
  small: string;
  tone: 'green' | 'amber' | null;
}

export interface ConsumptionBand {
  /** Lewa krawędź i szerokość wypełnienia w % osi. */
  leftPct: number;
  widthPct: number;
  /** Położenie markera normy z dokumentacji w % osi; `null` = normy nie wpisano. */
  markPct: number | null;
  markTitle: string | null;
  /** Granice osi pod paskiem - żeby procenty coś znaczyły. */
  scaleLow: string;
  scaleHigh: string;
  /** Opis dla czytnika ekranu. */
  aria: string;
}

export interface ConsumptionCardView {
  /** Plakietka w tytule: „42 operacje · od 3 MAJA". */
  badge: string;
  /** Wiersz pasma - pierwszy, w zieleni: liczba ZMIERZONA. */
  band: ConsumptionKv;
  gauge: ConsumptionBand;
  rows: ConsumptionKv[];
}

/** Jedno miejsce po przecinku, po polsku („28,4"). */
const oneDecimal = (value: number): string => value.toFixed(1).replace('.', ',');
/** Dwa miejsca - przeliczniki licznika („0,98"). */
const twoDecimals = (value: number): string => value.toFixed(2).replace('.', ',');

/** Podziałka osi pasma: pełne dziesiątki L/h, jak na makiecie (20–40). */
const SCALE_STEP = 10;
/** Oś nie węższa niż dwie działki - pasmo na całą szerokość nic by nie mówiło o rozrzucie. */
const SCALE_MIN_SPAN = 2 * SCALE_STEP;

/**
 * Granice osi: dziesiątki obejmujące pasmo I marker normy; jedna działka poszerza się
 * do dwóch od strony dołu, żeby 15–17 L/h nie stało na osi 10–20 przyklejone do brzegu.
 */
function scaleOf(low: number, high: number, mark: number | null): { lo: number; hi: number } {
  const min = mark == null ? low : Math.min(low, mark);
  const max = mark == null ? high : Math.max(high, mark);
  let lo = Math.floor(min / SCALE_STEP) * SCALE_STEP;
  let hi = Math.ceil(max / SCALE_STEP) * SCALE_STEP;
  if (hi === lo) hi = lo + SCALE_STEP;
  if (hi - lo < SCALE_MIN_SPAN) {
    if (lo >= SCALE_STEP) lo -= SCALE_STEP;
    else hi += SCALE_STEP;
  }
  return { lo, hi };
}

/** Procent osi zaokrąglony do jednej dziesiątej - wystarczy pikselom, a testom daje stałą liczbę. */
const pctOf = (value: number, lo: number, hi: number): number =>
  Math.round(((value - lo) / (hi - lo)) * 1000) / 10;

/** „+3 %" / „−4 %" z minusem typograficznym, jak reszta odczytów. */
function signedPercent(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0 %';
  return rounded > 0 ? `+${rounded} %` : `−${Math.abs(rounded)} %`;
}

/** Rodzaj licznika słowami; `unknown` = dane nie rozstrzygają, więc nic nie dopisujemy. */
function counterKind(kind: 'hobbs' | 'tach' | 'unknown'): string {
  if (kind === 'tach') return ' · obrotomierz';
  if (kind === 'hobbs') return ' · licznik godzinowy';
  return '';
}

/**
 * Treść karty - albo `null`, gdy karty nie ma.
 *
 * `norm` przychodzi razem z opublikowanym modelem (serwer składa ją tym samym kodem,
 * który zasila telefon), więc brak normy przy opublikowanym modelu znaczy brak pasma -
 * i wtedy też nie ma czego rysować.
 */
export function consumptionCardView(report: ConsumptionReportDto): ConsumptionCardView | null {
  const { fuel, norm, summary, headline, basis, aircraft } = report;
  if (!fuel.published || norm == null) return null;

  const documentation = aircraft.fuelNormLPerH != null && aircraft.fuelNormLPerH > 0 ? aircraft.fuelNormLPerH : null;
  const { lo, hi } = scaleOf(norm.blockLPerHLow, norm.blockLPerHHigh, documentation);

  const rows: ConsumptionKv[] = [];

  if (documentation != null) {
    const deviation =
      headline.vsDocumentationPct == null ? '' : ` · z lotów ${signedPercent(headline.vsDocumentationPct)}`;
    rows.push({
      label: 'Z dokumentacji',
      value: oneDecimal(documentation),
      small: `L/h · zadeklarowane, nie zmierzone${deviation}`,
      tone: 'amber',
    });
  }

  if (norm.airLPerH != null && norm.groundLPerH != null) {
    rows.push({
      label: 'W locie / na ziemi',
      value: `${oneDecimal(norm.airLPerH)} / ${oneDecimal(norm.groundLPerH)}`,
      small: 'L/h',
      tone: null,
    });
  }

  if (headline.litersPerFlightHour != null) {
    rows.push({ label: 'Na godzinę lotu', value: oneDecimal(headline.litersPerFlightHour), small: 'L/h', tone: null });
  }

  // Przeliczniki licznika gasną OSOBNO od paliwa: inne wejście, inny próg publikacji.
  if (norm.mh != null) {
    rows.push({
      label: 'Motogodziny',
      value: `${twoDecimals(norm.mh.perFlightHour)} / ${twoDecimals(norm.mh.perGroundHour)}`,
      small: `MH na h · w locie / na ziemi${counterKind(norm.mh.kind)}`,
      tone: null,
    });
  }

  const intervals = fuel.gate.intervals;
  const outliers = fuel.outliers.length;
  rows.push({
    label: 'Obserwacje',
    value: String(basis.sessions),
    small:
      `${plural(basis.sessions, 'operacja', 'operacje', 'operacji')} · ` +
      `${intervals} ${plural(intervals, 'pomiar', 'pomiary', 'pomiarów')}, ${fuel.tracedIntervals} ze śladem GPS` +
      (outliers > 0
        ? ` · ${outliers} ${plural(outliers, 'odstający pominięty', 'odstające pominięte', 'odstających pominiętych')}`
        : ''),
    tone: null,
  });

  const lastMonth = summary.months[summary.months.length - 1];
  if (lastMonth != null && lastMonth.litersPerBlockHour != null) {
    rows.push({
      label: 'Ostatni miesiąc',
      value: oneDecimal(lastMonth.litersPerBlockHour),
      small: `L/h · ${lastMonth.intervals} ${plural(lastMonth.intervals, 'pomiar', 'pomiary', 'pomiarów')}`,
      tone: null,
    });
  }

  const bandLabel = `${oneDecimal(norm.blockLPerHLow)}–${oneDecimal(norm.blockLPerHHigh)}`;

  return {
    badge:
      `${basis.sessions} ${plural(basis.sessions, 'operacja', 'operacje', 'operacji')}` +
      (basis.firstDay == null ? '' : ` · od ${dateUtcShort(basis.firstDay)}`),
    band: { label: 'Pasmo zużycia · 10.–90. centyl', value: bandLabel, small: 'L/h', tone: 'green' },
    gauge: {
      leftPct: pctOf(norm.blockLPerHLow, lo, hi),
      widthPct: pctOf(norm.blockLPerHHigh, lo, hi) - pctOf(norm.blockLPerHLow, lo, hi),
      markPct: documentation == null ? null : pctOf(documentation, lo, hi),
      markTitle: documentation == null ? null : `Z dokumentacji: ${oneDecimal(documentation)} L/h`,
      scaleLow: `${lo} L/h`,
      scaleHigh: `${hi} L/h`,
      aria:
        `Pasmo ${bandLabel} L/h na skali ${lo}–${hi}` +
        (documentation == null ? '' : `; norma z dokumentacji ${oneDecimal(documentation)}`),
    },
    rows,
  };
}
