/**
 * Ninerdeck - panel 3.2: STATYSTYKI - raport z serwera na fakty, słupki i wiersze tabel
 * (`docs/panel-3.2.md` §8, §17 pkt 10; makieta `statystyki`).
 *
 * Moduł CZYSTY (bez Reacta): każda decyzja o treści jest tutaj, pod testem, a `.tsx`
 * odpowiada wyłącznie za układ.
 *
 * ══ FORMATUJEMY, NIGDY NIE LICZYMY ══
 * Sumy, ilorazy („Śr. L/h", udział, wykorzystanie, średnia floty) i suma prawego fotela
 * przychodzą POLICZONE. Jedyna arytmetyka tego pliku to GEOMETRIA słupków - procent
 * wysokości względem najwyższego dnia - czyli to samo, co `trackChart.ts` robi ze
 * stopniami i pikselami: układanie gotowych liczb na powierzchni, nie fakt o locie.
 *
 * ══ KRESKA, NIE ZERO ══
 * `null` z serwera znaczy „nie wiemy" (bilans bez odczytu, wiersze nieprzeliczone) i jedzie
 * jako półpauza; zero znaczy zero. Podpis pod kreską mówi, ILE operacji nie ma bilansu.
 */

import { dateUtcDayMonth, dateUtcLong, dateUtcShort, duration, hhmm, plural } from '@ninerdeck/format';

import type {
  StatsAircraftDto,
  StatsDailyPointDto,
  StatsOperationDto,
  StatsPilotDto,
  StatsReportDto,
  StatsTotalsDto,
} from '../../api/dto';
import { litres, motoHours, NONE } from '../common/values';
import { operationLabel } from '../logbook/sessionRows';

/** Jedno miejsce po przecinku, po polsku („38,3"). */
const oneDecimal = (value: number): string => value.toFixed(1).replace('.', ',');

/** Δ MH w godzinach DZIESIĘTNYCH z jednostką - flota miesza formaty licznika, więc suma floty nie ma formatu. */
const mhHours = (value: number | null): string => (value == null ? NONE : `${oneDecimal(value)} h`);

const percent = (value: number | null): string => (value == null ? NONE : `${Math.round(value)} %`);

const operationsCount = (n: number): string => `${n} ${plural(n, 'operacja', 'operacje', 'operacji')}`;

/** Dzień `YYYY-MM-DD` jako chwila UTC - jedyne miejsce, w którym napis daty staje się liczbą. */
const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);

/* ══ NAGŁÓWEK ══ */

/**
 * Zakres słowami: „1–7 września 2026", „25 sierpnia – 7 września 2026",
 * „1 grudnia 2025 – 7 stycznia 2026", „7 września 2026" dla jednego dnia.
 * Miesiące z tego samego słownika, co reszta panelu - małymi literami, bo to zdanie
 * podtytułu, nie kolumna tabeli.
 */
export function rangeLabel(fromDay: string, toDay: string): string {
  const from = new Date(dayMs(fromDay));
  const to = new Date(dayMs(toDay));
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const sameMonth = sameYear && from.getUTCMonth() === to.getUTCMonth();

  if (fromDay === toDay) return dateUtcLong(to.getTime()).toLowerCase();
  if (sameMonth) {
    return `${from.getUTCDate()}–${dateUtcShort(to.getTime()).toLowerCase()} ${to.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${dateUtcShort(from.getTime()).toLowerCase()} – ${dateUtcShort(to.getTime()).toLowerCase()} ${to.getUTCFullYear()}`;
  }
  return `${dateUtcLong(from.getTime()).toLowerCase()} – ${dateUtcLong(to.getTime()).toLowerCase()}`;
}

/**
 * Podtytuł NAZYWA podstawę liczenia (§4.5, E3): statystyki liczą wyłącznie operacje
 * zamknięte, dziennik pokazuje także trwające - różnica ma stać w zdaniu, nie zostać
 * niewyjaśnionym rozjazdem dwóch liczb. Operacje w toku są policzone i podane obok;
 * bez nich zdanie kończy się na podstawie (zero nie dostaje członu).
 */
export function statsSubtitle(report: StatsReportDto): string {
  const parts = [rangeLabel(report.range.fromDay, report.range.toDay), 'operacje zamknięte w zakresie'];
  const open = report.totals.openSessionsInRange;
  if (open > 0) parts.push(`${open} w toku poza sumami`);
  const undated = report.totals.openSessionsUndated;
  if (undated > 0) parts.push(`${undated} bez daty przejęcia`);
  return parts.join(' · ');
}

/* ══ RAZEM - PASEK FAKTÓW ══ */

export interface StatsFact {
  label: string;
  value: string;
  /** Mianownik przy liczbie („z 7" przy dniach lotnych) - drobnym, jak `small` w `.kv-v`. */
  small: string | null;
}

/**
 * Kolejność jest kolejnością kafelka operacji z telefonu (Operacje · Loty · Blok · Lot),
 * z dniami lotnymi po operacjach i tym, co tylko panel umie zsumować, na końcu.
 * Δ MH w godzinach dziesiętnych, bo flota miesza formaty licznika.
 */
export function statsFacts(totals: StatsTotalsDto, calendarDays: number): StatsFact[] {
  return [
    { label: 'Operacje', value: String(totals.sessions), small: null },
    { label: 'Dni lotne', value: String(totals.activeDays), small: `z ${calendarDays}` },
    { label: 'Loty', value: String(totals.flights), small: null },
    { label: 'Blok', value: hhmm(totals.blockMs), small: null },
    { label: 'Lot', value: hhmm(totals.flightMs), small: null },
    { label: 'Paliwo', value: litres(totals.fuelConsumedL), small: null },
    { label: 'Δ MH', value: mhHours(totals.mhDeltaH), small: null },
    { label: 'Piloci', value: String(totals.pilots), small: null },
  ];
}

/* ══ NALOT DZIEŃ PO DNIU ══ */

export interface StatsBar {
  key: string;
  /** Wysokość względem NAJWYŻSZEGO dnia zakresu (0–100) - geometria, nie fakt. */
  heightPct: number;
  /** Dzień bez lotów: kreska u podstawy zamiast pustej kolumny. */
  zero: boolean;
  /** Podpowiedź „1 wrz: 5:26". */
  title: string;
  /** Podpis pod słupkiem - co dzień przy tygodniu, co siódmy przy dłuższym zakresie; `null` = bez podpisu. */
  label: string | null;
}

export interface StatsBars {
  bars: StatsBar[];
  /** Opis dla czytnika ekranu - cały wykres jest jednym obrazem. */
  aria: string;
  /** Lewy podpis osi: który dzień był najwyższy; prawy: ostatni dzień zakresu („· dziś", gdy to dziś). */
  axisLeft: string;
  axisRight: string;
}

/** Przy zakresie do dwóch tygodni każdy słupek ma podpis; dłużej - co siódmy, żeby mono nie zlało się w napis. */
const LABEL_EVERY_LONG = 7;
const LABELLED_DAYS = 14;

/** „1 wrz" - dzień bez zera wiodącego i trzyliterowy miesiąc małymi literami. */
const dayShort = (day: string): string => {
  const t = dayMs(day);
  return `${new Date(t).getUTCDate()} ${dateUtcDayMonth(t).slice(3).toLowerCase()}`;
};

export function statsBars(daily: StatsDailyPointDto[], fromDay: string, toDay: string, today: string): StatsBars {
  const max = daily.reduce((acc, point) => Math.max(acc, point.blockMs), 0);
  const every = daily.length <= LABELLED_DAYS ? 1 : LABEL_EVERY_LONG;

  const bars = daily.map((point, index) => ({
    key: point.day,
    heightPct: max > 0 ? Math.round((point.blockMs / max) * 100) : 0,
    zero: point.blockMs === 0,
    title: `${dayShort(point.day)}: ${duration(point.blockMs)}`,
    label: index % every === 0 ? dayShort(point.day) : null,
  }));

  const best = max > 0 ? daily.find((point) => point.blockMs === max) : undefined;
  const last = daily[daily.length - 1];

  return {
    bars,
    aria: `Nalot blokowy dzień po dniu, ${rangeLabel(fromDay, toDay)}`,
    axisLeft:
      best == null
        ? 'bez lotów w tym zakresie'
        : `najwyższy dzień: ${dateUtcShort(dayMs(best.day)).toLowerCase()} · ${duration(best.blockMs)}`,
    axisRight: last == null ? '' : last.day === today ? `${dayShort(last.day)} · dziś` : dayShort(last.day),
  };
}

/* ══ SAMOLOTY ══ */

export interface StatsAircraftRow {
  aircraftId: string;
  reg: string;
  aircraftType: string;
  operations: string;
  days: string;
  flights: string;
  block: string;
  flight: string;
  fuel: string;
  /** „2 operacje bez odczytu" pod kreską albo liczbą - ile nie weszło do sumy; `null` = komplet. */
  fuelNote: string | null;
  avg: string;
  moto: string;
  utilization: string;
}

export function aircraftRow(a: StatsAircraftDto): StatsAircraftRow {
  return {
    aircraftId: a.aircraftId,
    reg: a.reg ?? NONE,
    aircraftType: a.aircraftType ?? NONE,
    operations: String(a.sessions),
    days: String(a.activeDays),
    flights: String(a.flights),
    // Sumy czasu w „HH:MM", jak w dzienniku - dziesiątki godzin nie mieszczą się w „H:MM".
    block: hhmm(a.blockMs),
    flight: hhmm(a.flightMs),
    fuel: litres(a.fuelConsumedL),
    fuelNote: a.fuelUnknownSessions > 0 ? `${operationsCount(a.fuelUnknownSessions)} bez odczytu` : null,
    avg: a.avgLitresPerBlockHour == null ? NONE : oneDecimal(a.avgLitresPerBlockHour),
    // Δ MH w formacie TEJ maszyny (suma delt per operacja, nie „koniec − początek").
    moto: motoHours(a.mhDeltaH, a.mhFormat),
    utilization: percent(a.utilizationPct),
  };
}

/** Wiersz „Razem" tabeli samolotów - dziesięć komórek w kolejności kolumn; wykorzystanie floty nie ma sumy. */
export function aircraftFoot(totals: StatsTotalsDto): string[] {
  return [
    'Razem',
    String(totals.sessions),
    String(totals.activeDays),
    String(totals.flights),
    hhmm(totals.blockMs),
    hhmm(totals.flightMs),
    litres(totals.fuelConsumedL),
    totals.avgLitresPerBlockHour == null ? NONE : oneDecimal(totals.avgLitresPerBlockHour),
    mhHours(totals.mhDeltaH),
    NONE,
  ];
}

/* ══ PILOCI ══ */

export interface StatsPilotRow {
  pilotId: string;
  name: string;
  code: string;
  /** „tylko jako drugi pilot" - dlaczego zera w nalocie nie są brakiem; `null` = bez podpisu. */
  note: string | null;
  operations: string;
  flights: string;
  block: string;
  flight: string;
  /** Prawy fotel - OSOBNA liczba, nigdy dodawana do bloku; kreska bez takiej operacji. */
  dual: string;
  regs: string[];
}

export function pilotRow(p: StatsPilotDto): StatsPilotRow {
  return {
    pilotId: p.pilotId,
    name: p.name ?? NONE,
    code: p.code ?? NONE,
    note: p.sessions === 0 && p.dual != null ? 'tylko jako drugi pilot' : null,
    operations: String(p.sessions),
    flights: String(p.flights),
    block: hhmm(p.blockMs),
    flight: hhmm(p.flightMs),
    dual: p.dual == null ? NONE : hhmm(p.dual.blockMs),
    regs: p.regs,
  };
}

/** Wiersz „Razem" tabeli pilotów: nalot dowódców i OSOBNO suma prawego fotela (§17.1 pkt 1). */
export function pilotFoot(totals: StatsTotalsDto): string[] {
  return [
    'Razem',
    String(totals.sessions),
    String(totals.flights),
    hhmm(totals.blockMs),
    hhmm(totals.flightMs),
    totals.dual == null ? NONE : hhmm(totals.dual.blockMs),
    '',
  ];
}

/* ══ ZADANIA ══ */

export interface StatsOperationRow {
  key: string;
  label: string;
  operations: string;
  flights: string;
  block: string;
  flight: string;
  /** Udział bloku zadania w nalocie zakresu - liczy serwer. */
  share: string;
  regs: string[];
}

export function operationRow(o: StatsOperationDto): StatsOperationRow {
  return {
    key: o.operation ?? 'bez-zadania',
    label: operationLabel(o.operation),
    operations: String(o.sessions),
    flights: String(o.flights),
    block: hhmm(o.blockMs),
    flight: hhmm(o.flightMs),
    share: percent(o.blockSharePct),
    regs: o.regs,
  };
}

/** Wiersz „Razem" tabeli zadań: udziały sumują się do całości, o ile jest jakikolwiek nalot. */
export function operationFoot(totals: StatsTotalsDto): string[] {
  return [
    'Razem',
    String(totals.sessions),
    String(totals.flights),
    hhmm(totals.blockMs),
    hhmm(totals.flightMs),
    totals.blockMs > 0 ? '100 %' : NONE,
    '',
  ];
}
