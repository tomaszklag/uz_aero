/**
 * UZ Aero — panel: treść ekranu analityki zużycia (moduł CZYSTY).
 *
 * Kafle, karty stawek, wstęga podziału czasu, wiersze tabel i komunikat bramki. Panel
 * NIE LICZY tu żadnej metryki — wszystkie liczby przychodzą policzone przez domenę
 * (`GET /admin/api/fleet/:id/consumption`). Ten moduł zamienia je na NAPISY i GEOMETRIĘ,
 * dokładnie jak `statsTiles.ts` / `statsAircraftRows.ts` przy statystykach.
 *
 * Jeden wyjątek jest nazwany i celowy: **szerokości segmentów wstęgi** to udziały
 * czasu, więc dzielenie odbywa się tutaj. To geometria wykresu, nie metryka — ta sama
 * decyzja, co przy paskach `duoRows` w statystykach.
 */

import { motoHours } from '@uzaero/format';

import type { ConsumptionReportDto } from '../../api/dto';
import { dot1, litresThousands, thousands } from '../stats/statsFormat';
import {
  DASH,
  boundLabel,
  dayOf,
  hoursMinutes,
  mhRate,
  monthShort,
  phaseLabel,
  phaseTone,
  rateUncertainty,
  rateValue,
  rejectionLabel,
  timeOf,
} from './consumptionFormat';

// ── kafle nagłówkowe ────────────────────────────────────────────────────────────

export interface TileView {
  key: string;
  label: string;
  value: string;
  unit?: string;
  note: string;
  tone?: 'green' | 'amber' | 'blue';
}

export function consumptionTiles(report: ConsumptionReportDto): TileView[] {
  const { headline, basis, summary } = report;

  return [
    {
      key: 'flight-hour',
      label: 'Na godzinę lotu',
      value: dot1(headline.litersPerFlightHour),
      unit: ' L/h',
      tone: 'green',
      note: `Σ ${litresThousands(summary.litersTotal)} / ${hoursMinutes(summary.flightMs)} czasu lotu. Zawiera też paliwo spalone na ziemi.`,
    },
    {
      key: 'block-hour',
      label: 'Na godzinę bloku',
      value: dot1(headline.litersPerBlockHour),
      unit: ' L/h',
      note: `Σ ${litresThousands(summary.litersTotal)} / ${hoursMinutes(summary.engineMs)} pracy silnika — ta sama definicja, co „Śr. L/h" w statystykach.`,
    },
    {
      key: 'per-flight',
      label: 'Paliwo na lot',
      value: headline.litersPerFlight == null ? DASH : `≈${Math.round(headline.litersPerFlight)}`,
      unit: ' L',
      note: `${thousands(summary.flights)} wzlotów w oknie. Dla dni skokowych czytaj: na wyniesienie.`,
    },
    {
      key: 'mh',
      label: 'ΔMH na godz. bloku',
      value: mhRate(headline.mhPerBlockHour),
      tone: 'amber',
      note: mhNote(report),
    },
    {
      key: 'basis',
      label: 'Podstawa',
      value: String(basis.sessions),
      unit: ' dni',
      tone: 'blue',
      note: `${summary.intervals} interwałów paliwowych · ${dayOf(basis.firstDay)} → ${dayOf(basis.lastDay)}.`,
    },
  ];
}

function mhNote(report: ConsumptionReportDto): string {
  switch (report.mh.kind) {
    case 'tach':
      return 'Licznik obrotomierzowy — na ziemi przyrasta wolniej niż zegar. Rozkład per faza niżej.';
    case 'hobbs':
      return 'Licznik godzinowy (Hobbs) — chodzi 1:1 z zegarem, gdy silnik pracuje.';
    default:
      return 'Charakteru licznika jeszcze nie rozstrzygnięto — za mało zamkniętych dni.';
  }
}

// ── karty stawek i wstęga podziału czasu ───────────────────────────────────────

export interface RateView {
  key: string;
  phase: string;
  tone: 'green' | 'blue' | 'amber' | 'dim';
  value: string;
  unit: string;
  uncertainty: string;
  /** Stawka nieoznaczona — karta zostaje na ekranie wygaszona, z powodem. */
  muted: boolean;
}

export function rateCards(report: ConsumptionReportDto): RateView[] {
  return report.fuel.rates.map((rate) => ({
    key: rate.phase,
    phase: phaseLabel(rate.phase),
    tone: phaseTone(rate.phase),
    value: rateValue(rate.lPerH),
    unit: ' L/h',
    uncertainty: rateUncertainty(rate.ciHalfWidth, rate.pinned),
    muted: rate.pinned,
  }));
}

export interface RibbonSegmentView {
  key: string;
  label: string;
  tone: 'green' | 'blue' | 'amber' | 'dim';
  /** Gotowa szerokość CSS („41.0%") — geometrię liczy moduł, nie widok. */
  width: string;
}

/** Wstęga podziału czasu okna na fazy. Pusta lista, gdy model nieopublikowany. */
export function ribbonSegments(report: ConsumptionReportDto): RibbonSegmentView[] {
  const total = report.fuel.rates.reduce((sum, rate) => sum + rate.hoursInWindowMs, 0);
  if (total <= 0) return [];

  return report.fuel.rates
    .filter((rate) => rate.hoursInWindowMs > 0)
    .map((rate) => ({
      key: rate.phase,
      label: `${phaseLabel(rate.phase).toUpperCase()} ${hoursMinutes(rate.hoursInWindowMs)}`,
      tone: phaseTone(rate.phase),
      width: `${((rate.hoursInWindowMs / total) * 100).toFixed(1)}%`,
    }));
}

/** Karty przeliczników motogodzin — ten sam kształt, co karty stawek paliwa. */
export function mhCards(report: ConsumptionReportDto): RateView[] {
  return [
    {
      key: 'flight',
      phase: 'W locie',
      tone: 'green',
      value: mhRate(report.mh.perFlightHour),
      unit: ' MH/h',
      uncertainty: mhUncertainty(report.mh.perFlightCi),
      muted: report.mh.perFlightHour == null,
    },
    {
      key: 'ground',
      phase: 'Na ziemi',
      tone: 'dim',
      value: mhRate(report.mh.perGroundHour),
      unit: ' MH/h',
      uncertainty: mhUncertainty(report.mh.perGroundCi),
      muted: report.mh.perGroundHour == null,
    },
  ];
}

function mhUncertainty(ci: number | null): string {
  return ci == null ? 'bez przedziału' : `±${ci.toFixed(2)} · 95%`;
}

/** Podpis jakości dopasowania — „2.6 L · 0.94" (σ reszt i R² niecentrowane). */
export function fitQualityLabel(report: ConsumptionReportDto): string {
  const sigma = report.fuel.residualSigmaL;
  const r2 = report.fuel.rSquaredUncentered;
  return `${sigma == null ? DASH : `${sigma.toFixed(1)} L`} · ${r2 == null ? DASH : r2.toFixed(2)}`;
}

/** Podpis odstających — zdanie, nie liczba bez kontekstu. */
export function outliersLabel(report: ConsumptionReportDto): string {
  const count = report.fuel.outliers.length;
  return count === 0 ? 'brak' : `${count} — wykluczone z modelu, wylistowane niżej`;
}

/** Punkt osi trendu — „JUL · 36.5". */
export function trendAxis(report: ConsumptionReportDto): { key: string; label: string }[] {
  return report.summary.months.map((month) => ({
    key: month.month,
    label: `${monthShort(month.month)} · ${
      month.litersPerBlockHour == null ? DASH : month.litersPerBlockHour.toFixed(1)
    }`,
  }));
}

// ── bramka publikacji (A10b) ───────────────────────────────────────────────────

export interface GateView {
  published: boolean;
  /** Zdanie banera — mówi, czego brakuje, a nie że „coś poszło nie tak". */
  message: string;
  intervalsPercent: number;
  enginePercent: number;
  intervalsLabel: string;
  engineLabel: string;
}

const MIN_INTERVALS = 5;
const MIN_ENGINE_MS = 10 * 3_600_000;

export function gateView(report: ConsumptionReportDto): GateView {
  const { gate } = report.fuel;
  const published = report.fuel.published;

  return {
    published,
    message: published
      ? `Model policzony z ${gate.intervals} interwałów (${hoursMinutes(gate.engineMs)} pracy silnika).`
      : `Model publikujemy od ${MIN_INTERVALS} interwałów paliwowych i 10 godzin pracy silnika w oknie — ten samolot ma ${gate.intervals} i ${hoursMinutes(gate.engineMs)}. Stawka z tylu odczytów byłaby liczbą wyglądającą na wynik pomiaru; zamiast niej pokazujemy postęp i surowe interwały.`,
    intervalsPercent: Math.min(100, (gate.intervals / MIN_INTERVALS) * 100),
    enginePercent: Math.min(100, (gate.engineMs / MIN_ENGINE_MS) * 100),
    intervalsLabel: `${gate.intervals} / ${MIN_INTERVALS}`,
    engineLabel: `${hoursMinutes(gate.engineMs)} / 10 h`,
  };
}

/** Zdanie o zejściu po drabinie faz — `null`, gdy model stoi na najbogatszym zestawie. */
export function degradationNote(report: ConsumptionReportDto): string | null {
  if (!report.fuel.published) return null;

  switch (report.fuel.degradedBecause) {
    case 'no-trace':
      return `Rozbicie lotu na wznoszenie, przelot i zniżanie wymaga śladu GPS — mają go ${report.fuel.tracedIntervals} z ${report.fuel.gate.intervals} interwałów. Model liczy fazy ziemia / powietrze.`;
    case 'collinear':
      return 'Faz lotu nie dało się od siebie odróżnić: interwały mają zbyt podobne proporcje, więc każdy podział zużycia pasowałby tak samo dobrze. Model zszedł o szczebel niżej i mówi o tym wprost, zamiast pokazywać podział przypadkowy.';
    case 'singular':
      return 'Układ okazał się nierozwiązywalny — faz nie da się rozdzielić w ogóle.';
    default:
      return null;
  }
}

// ── tabela interwałów ──────────────────────────────────────────────────────────

export interface IntervalRowView {
  key: string;
  day: string;
  span: string;
  consumed: string;
  reading: string;
  engine: string;
  phases: string;
  state: 'ok' | 'outlier' | 'rejected';
  stateLabel: string;
  stateNote: string | null;
  sessionUuid: string;
}

export function intervalRows(report: ConsumptionReportDto): IntervalRowView[] {
  return report.intervals.map((interval, index) => {
    const rejected = interval.rejected;
    const state: IntervalRowView['state'] =
      rejected == null ? 'ok' : rejected === 'outlier' ? 'outlier' : 'rejected';

    return {
      key: `${interval.sessionUuid}-${index}`,
      day: dayOf(interval.dayStart ?? interval.startAt),
      span: `${boundLabel(interval.startKind)} ${timeOf(interval.startAt)} → ${boundLabel(interval.endKind)} ${timeOf(interval.endAt)}`,
      consumed: `${Math.round(interval.consumedL)} L`,
      reading: `odczyt ${Math.round(interval.startReadingL)} → ${Math.round(interval.endReadingL)} L`,
      engine: hoursMinutes(interval.engineMs),
      phases: phaseBreakdown(interval),
      state,
      stateLabel: state === 'ok' ? 'OK' : state === 'outlier' ? 'Odstaje' : 'Odrzucony',
      stateNote: rejectionLabel(rejected),
      sessionUuid: interval.sessionUuid,
    };
  });
}

/** „0:14 / 0:16 / 0:22 / 0:10" — kreska tam, gdzie fazy pionowej nie znamy. */
function phaseBreakdown(interval: ConsumptionReportDto['intervals'][number]): string {
  const vertical = [interval.climbMs, interval.cruiseMs, interval.descentMs];
  const parts = [hoursMinutes(interval.groundMs)];
  for (const value of vertical) parts.push(value == null ? DASH : hoursMinutes(value));
  return parts.join(' / ');
}

// ── tabela motogodzin ──────────────────────────────────────────────────────────

export interface MhRowView {
  key: string;
  day: string;
  flight: string;
  ground: string;
  actual: string;
  modelled: string;
  residual: string;
}

export function mhRows(report: ConsumptionReportDto): MhRowView[] {
  const format = report.aircraft.mhFormat;

  return report.mh.rows.map((row) => ({
    key: row.sessionUuid,
    day: dayOf(row.dayStart),
    flight: hoursMinutes(row.flightMs),
    ground: hoursMinutes(row.groundMs),
    actual: motoHours(row.actualMh, format),
    modelled: row.modelledMh.toFixed(2),
    residual: `${row.residualMh >= 0 ? '+' : '−'}${Math.abs(row.residualMh).toFixed(2)}`,
  }));
}

/** Podpis typu licznika — zdanie, nie kod. */
export function counterLabel(kind: string): string {
  switch (kind) {
    case 'tach':
      return 'obrotomierzowy';
    case 'hobbs':
      return 'godzinowy (Hobbs)';
    default:
      return 'nierozstrzygnięty';
  }
}
