/**
 * Ninerdeck - panel 3.2: DZIENNIK, poziom 2 - operacje POD NAGŁÓWKAMI DÓB.
 *
 * Moduł CZYSTY. Układa wiersze gridu w grupy po dobie przejęcia i dokleja do każdej
 * grupy SUMY Z SERWERA (`docs/panel-3.2.md` §4.4): strona kursorowa potrafi rozciąć
 * dobę, więc suma policzona z wierszy strony byłaby sumą połowy doby - a taka liczba
 * wygląda poprawnie. Tu nie ma ani jednego dodawania: serwer liczy, ten moduł nazywa.
 *
 * ══ CO STOI W NAGŁÓWKU ══
 * Data z dniem tygodnia (pisownia zdaniowa - styl lekki panelu) i cztery sumy nalotu
 * (Operacje · Loty · Blok · Lot) w STAŁEJ kolejności, więc etykiety są krótkie.
 * Po separatorze dochodzą rzeczy POZA sumami: operacje w toku (bez wartości mocnej,
 * to liczba do przeczytania) i czas w prawym fotelu (wartość mocna - to nalot, tylko
 * liczony osobno; decyzja właściciela 2026-09-26, wariant B). Doba bez ani jednej
 * zamkniętej operacji nie dostaje czwórki zer - zostaje sama data i to, co poza sumami.
 */

import { dateUtcShort, duration, plural, weekdayUtc } from '@ninerdeck/format';

import type { SessionDayDto } from '../../api/dto';
import type { SessionRow } from './sessionRows';

/** Jedna suma nagłówka doby: wartość + etykieta; `aside` = po separatorze, poza nalotem. */
export interface DaySum {
  value: string;
  label: string;
  aside: boolean;
  /** Wartość pogrubiona - liczba nalotu; „1 w toku" jej nie dostaje. */
  strong: boolean;
}

export interface DayGroup {
  key: string;
  /** „6 września" - albo „Bez daty" dla zapisu bez przejęcia (rejestr niekompletny). */
  date: string;
  /** „sobota"; pusty przy „Bez daty". */
  weekday: string;
  sums: DaySum[];
  rows: SessionRow[];
}

const NO_DATE = '';

/** Sumy jednej doby - w kolejności, w jakiej stoją w nagłówku. */
export function daySums(day: SessionDayDto | undefined): DaySum[] {
  if (day == null) return [];
  const out: DaySum[] = [];
  if (day.operations > 0) {
    out.push(
      { value: String(day.operations), label: plural(day.operations, 'operacja', 'operacje', 'operacji'), aside: false, strong: true },
      { value: String(day.flights), label: plural(day.flights, 'lot', 'loty', 'lotów'), aside: false, strong: true },
      { value: duration(day.blockMs), label: 'blok', aside: false, strong: true },
      { value: duration(day.flightMs), label: 'lot', aside: false, strong: true },
    );
  }
  if (day.inProgress > 0) {
    out.push({ value: String(day.inProgress), label: 'w toku', aside: true, strong: false });
  }
  if (day.dual != null) {
    out.push({ value: duration(day.dual.blockMs), label: 'drugi pilot', aside: true, strong: true });
  }
  return out;
}

/**
 * Wiersze -> grupy w KOLEJNOŚCI pierwszego wystąpienia (lista przychodzi posortowana
 * po chwili przejęcia, więc doby wychodzą we właściwym porządku same). Nagłówek doby
 * bierze sumy po kluczu; doba bez wpisu w `days` (nie powinna się zdarzyć) dostaje
 * samą datę - zmyślanie zer byłoby gorsze niż ich brak.
 */
export function dayGroups(rows: SessionRow[], days: SessionDayDto[]): DayGroup[] {
  const sumsByDay = new Map(days.map((day) => [day.day, daySums(day)]));
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();

  for (const row of rows) {
    const key = row.dayKey ?? NO_DATE;
    let group = byKey.get(key);
    if (group == null) {
      group =
        row.dayKey == null || row.claimedAt == null
          ? { key, date: 'Bez daty', weekday: '', sums: [], rows: [] }
          : {
              key,
              // Pisownia zdaniowa („6 września", „sobota") - styl lekki panelu; formatery
              // wspólne z telefonem piszą wersalikami dla nagłówków display.
              date: dateUtcShort(row.claimedAt).toLowerCase(),
              weekday: weekdayUtc(row.claimedAt).toLowerCase(),
              sums: sumsByDay.get(key) ?? [],
              rows: [],
            };
      byKey.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}
