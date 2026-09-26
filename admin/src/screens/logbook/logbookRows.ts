/**
 * Ninerdeck - panel 2.0: DZIENNIK, poziom 1 - maszyna z serwera na WIERSZ TABELI.
 *
 * Moduł CZYSTY (bez Reacta): decyzje o treści komórek są tu, pod testem, a nie w JSX-ie.
 *
 * ══ FORMATUJEMY, NIGDY NIE LICZYMY ══
 * Wszystkie liczby przyszły policzone z serwera; tutaj dobieramy im wyłącznie postać
 * (`@ninerdeck/format`, wspólny z aplikacją pilota). Ani jednego dodawania, dzielenia
 * ani „średnio na godzinę" - taka liczba rozjechałaby się z analityką zużycia,
 * która liczy to samo inaczej i na innych danych.
 */

import { dateUtcDayMonth, hhmm, plural } from '@ninerdeck/format';

import type { LogAircraftDto, LogIdleMemberDto, LogPilotDto } from '../../api/dto';
// Kreska braku i formatery, które ją stawiają - półpauza panelu, nie dywiz telefonu.
import { litres, motoHours, NONE, timeUtc } from '../common/values';

export interface LogbookRow {
  aircraftId: string;
  /** Znaki na kadłubie; kreska tylko dla jednostki spoza rejestru floty. */
  reg: string;
  aircraftType: string;
  /**
   * Jedyny sygnał wyjątkowy tego ekranu: maszyna ma teraz otwartą sesję. Stoi
   * w JEJ wierszu, nie w banerze nad tabelą - i tylko wtedy, gdy jest prawdziwy.
   */
  flyingNow: string | null;

  days: string;
  takeoffs: string;
  engine: string;
  airborne: string;
  fuel: string;
  moto: string;

  /** Maszyna, na której w zakresie nic się nie działo - wiersz przygaszony, ale obecny. */
  idle: boolean;
}

export function logbookRow(a: LogAircraftDto): LogbookRow {
  // Sumy liczą operacje ZDANE, ale maszyna z operacją w toku nie „stała": zera
  // w sumach niesie razem z sygnałem „leci teraz", nie przygaszona.
  const idle = a.sessions === 0 && a.openSessions === 0;
  return {
    aircraftId: a.aircraftId,
    reg: a.reg ?? NONE,
    aircraftType: a.aircraftType ?? NONE,
    flyingNow: a.openSessions > 0 ? 'leci teraz' : null,

    // Zero jest tu PRAWDĄ, nie brakiem: maszyna stała i to jest odpowiedź.
    days: String(a.activeDays),
    // `null` znaczy „wiersze sprzed kolumn statystyk" - i wtedy kreska, nie zero.
    takeoffs: a.takeoffs == null ? NONE : String(a.takeoffs),
    // Sumy czasu w „HH:MM" - dziesiątki godzin w miesiącu nie mieszczą się w „H:MM".
    engine: hhmm(a.blockMs),
    airborne: hhmm(a.flightMs),
    // `litres(null)` sam oddaje półpauzę: bilans z dziurą nie jest bilansem.
    fuel: litres(a.fuelConsumedL),
    moto: motoHours(a.mhDeltaH, a.mhFormat),

    idle,
  };
}

/* ══ OŚ PILOTÓW (3.2.0, `docs/panel-3.2.md` §4.1, §17.1) ══ */

export interface LogbookPilotRow {
  pilotId: string;
  code: string;
  name: string;
  /**
   * Sygnał „TERAZ" w bursztynie: osoba trzyma maszynę albo właśnie leci. Stoi w JEJ
   * wierszu i tylko wtedy, gdy jest prawdziwy - jak „leci teraz" na osi maszyn.
   */
  now: string | null;
  /** Druga linia bez ostrzeżenia: „tylko jako drugi pilot", „członkostwo wyłączone". */
  note: string | null;

  days: string;
  operations: string;
  flights: string;
  block: string;
  flight: string;
  /** Prawy fotel - OSOBNA liczba, nigdy dodawana do bloku; `null` = ani jednej operacji. */
  dual: { block: string; note: string } | null;
  regs: string[];
}

/** „trzyma SP-KLM od 06 WRZ 08:15" / „leci teraz · SP-AXA" - bez formy czasownika z płcią. */
function nowLabel(open: LogPilotDto['open']): string | null {
  if (open == null) return null;
  const reg = open.reg ?? NONE;
  if (open.engineRunning) return `leci teraz · ${reg}`;
  if (open.claimedAt == null) return `trzyma ${reg}`;
  return `trzyma ${reg} od ${dateUtcDayMonth(open.claimedAt)} ${timeUtc(open.claimedAt)}`;
}

const operationsCount = (n: number): string => `${n} ${plural(n, 'operacja', 'operacje', 'operacji')}`;

export function logbookPilotRow(p: LogPilotDto): LogbookPilotRow {
  return {
    pilotId: p.pilotId,
    code: p.code ?? NONE,
    name: p.name ?? NONE,
    now: nowLabel(p.open),
    // Wyłączony, który latał, ZOSTAJE na liście - z podpisem, nie w ukryciu. Uczeń bez
    // ani jednej operacji jako dowódca ma zera w nalocie i liczbę w kolumnie obok;
    // podpis mówi, dlaczego zera nie są brakiem. Zera przy operacji dowódcy W TOKU
    // tłumaczy sygnał „teraz", więc podpis wtedy milczy - „tylko jako drugi pilot"
    // przy „leci teraz" byłoby nieprawdą.
    note: !p.active
      ? 'członkostwo wyłączone'
      : p.sessions === 0 && p.openSessions === 0 && p.dual != null
        ? 'tylko jako drugi pilot'
        : null,
    days: String(p.activeDays),
    operations: String(p.sessions),
    flights: String(p.flights),
    // Sumy czasu w „HH:MM", jak na osi maszyn.
    block: hhmm(p.blockMs),
    flight: hhmm(p.flightMs),
    dual: p.dual == null ? null : { block: hhmm(p.dual.blockMs), note: operationsCount(p.dual.operations) },
    regs: p.regs,
  };
}

/** Członek bez lotów po rozwinięciu - zwykły wiersz zer, przygaszony przez tabelę. */
export function idlePilotRow(m: LogIdleMemberDto): LogbookPilotRow {
  return {
    pilotId: m.pilotId,
    code: m.code,
    name: m.name,
    now: null,
    note: null,
    days: '0',
    operations: '0',
    flights: '0',
    block: hhmm(0),
    flight: hhmm(0),
    dual: null,
    regs: [],
  };
}

/** Napisy wiersza zwinięcia: „+3 członków bez lotów w tym zakresie" / „Zwiń · 3 członków…". */
export function idleFoldLabels(count: number): { closed: string; open: string } {
  const members = `${count} ${plural(count, 'członek', 'członków', 'członków')} bez lotów w tym zakresie`;
  return { closed: `+${members}`, open: `Zwiń · ${members}` };
}

/**
 * Podtytuł poziomu 2 osi pilota: „w zakresie 4 operacje · 07:40 blok · 1 w toku · jako
 * drugi pilot 02:12". Liczby przychodzą z wiersza osi pilotów TEGO SAMEGO zakresu - panel
 * ich nie sumuje z nagłówków dób. Sumy to operacje ZDANE; operacja w toku stoi po
 * separatorze tak samo, jak w nagłówku doby pod spodem („· 1 w toku") - inaczej pilot
 * w pierwszym locie miesiąca miałby „0 operacji" nad tabelą, która pokazuje jedną.
 */
export function pilotRangeSummary(p: LogPilotDto): string {
  const parts = [`w zakresie ${operationsCount(p.sessions)} · ${hhmm(p.blockMs)} blok`];
  if (p.openSessions > 0) parts.push(`${p.openSessions} w toku`);
  if (p.dual != null) parts.push(`jako drugi pilot ${hhmm(p.dual.blockMs)}`);
  return parts.join(' · ');
}
