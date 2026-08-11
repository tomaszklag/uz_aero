/**
 * UZ Aero — panel: LICZBY ROZBIEŻNOŚCI z `flags.details` (moduł CZYSTY).
 *
 * `details` jest kolumną `jsonb`, więc na wejściu ma typ `Record<string, unknown>`
 * i tak trzeba go czytać: po nazwie, z przyznaniem się do braku. To nie jest
 * defensywność na zapas — kształt zależy od TYPU flagi
 * (`server/src/domain/mhChain.ts`, `clockDrift.ts`), a flagi zapisane przed zmianą
 * detektora zostają w bazie na zawsze, bo skrzynka pokazuje też sprawy sprzed pół roku.
 *
 * Panel NIE LICZY tu niczego: wszystkie wartości są odczytami, a jedyne działanie
 * to złożenie napisu z gotowych liczb funkcjami `@uzaero/format`.
 */

import { litres, motoHours, plural, timeUtc } from '@uzaero/format';

import type { FlagListItemDto } from '../../api/dto';

/** Brak wartości pokazujemy tak samo jak aplikacja pilota — jedną kreską. */
const NONE = '—';

const num = (details: Record<string, unknown>, key: string): number | null => {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const text = (details: Record<string, unknown>, key: string): string | null => {
  const value = details[key];
  return typeof value === 'string' && value !== '' ? value : null;
};

/** Godziny dziesiętne z `details` — format `decimal`, bo tak są zapisane w bazie. */
const mh = (value: number | null): string => motoHours(value, 'decimal');

/** Znak minus TYPOGRAFICZNY (U+2212), jak w mockupie — nie łącznik. */
const signed = (value: number | null, unit: string): string =>
  value == null ? NONE : `${value < 0 ? '−' : '+'}${Math.abs(value)} ${unit}`;

const negate = (value: number | null): number | null => (value == null ? null : -value);

export interface Discrepancy {
  /** Główna treść komórki „Rozbieżność" w tabeli. */
  main: string;
  /** Druga linia (`.cell-sub`) — skala rozjazdu albo trop do zdarzenia. */
  sub: string | null;
}

/**
 * Wiersz klucz–wartość szuflady (`A03a`, karta „Rozbieżność").
 *
 * `tone` przenosi znaczenie, nie ozdobę: czerwień dostaje wartość, która JEST
 * problemem (sam rozjazd), a nie odczyt, który go tylko opisuje.
 */
export interface DetailRow {
  key: string;
  value: string;
  tone?: 'red' | 'amber' | 'green';
}

/** Krótki opis rozbieżności do wiersza tabeli. */
export function discrepancyOf(flag: FlagListItemDto): Discrepancy {
  const d = flag.details;

  switch (flag.type) {
    case 'aircraft_overlap': {
      const open = num(d, 'openSessions');
      return {
        main:
          open == null
            ? 'sesje bez zdania samolotu'
            : `${open} ${plural(open, 'sesja', 'sesje', 'sesji')} bez day_close`,
        sub: `${flag.sessionUuids.length} ${plural(flag.sessionUuids.length, 'sesja', 'sesje', 'sesji')} na tej maszynie`,
      };
    }
    case 'pilot_overlap': {
      // `details` z `pilotOverlap.ts`: `aircraft` („SP-ABC + SP-KLM"), `from`, a `to`
      // WYŁĄCZNIE gdy obie sesje są zamknięte — przy otwartej nakładka trwa nadal
      // i domyślanie się końca byłoby twierdzeniem o przyszłości.
      const pair = text(d, 'aircraft');
      const from = num(d, 'from');
      const to = num(d, 'to');
      return {
        main: pair == null ? 'dwie maszyny naraz' : `${pair} naraz`,
        sub:
          from == null
            ? null
            : `${timeUtc(from)} → ${to == null ? 'trwa' : timeUtc(to)} UTC`,
      };
    }
    case 'mh_gap':
      return {
        main: `${mh(num(d, 'prevEnd'))} → ${mh(num(d, 'nextStart'))}`,
        sub: `${signed(num(d, 'gapH'), 'h')} w łańcuchu MH`,
      };
    case 'mh_regression': {
      // Serwer zapisuje `regressionH` jako wartość DODATNIĄ (wielkość cofnięcia),
      // a cofnięcie pokazujemy ze znakiem minus — tak samo jak mockup.
      const back = num(d, 'regressionH');
      return {
        main: `${mh(num(d, 'prevEnd'))} → ${mh(num(d, 'nextStart'))}`,
        sub: `${signed(back == null ? null : -back, 'h')} na liczniku`,
      };
    }
    case 'fuel_mismatch':
      return {
        main: `${litres(num(d, 'handoverL'))} → ${litres(num(d, 'readingL'))}`,
        sub: `${signed(num(d, 'diffL'), 'L')} · tol. ${litres(num(d, 'toleranceL'))}`,
      };
    case 'clock_drift': {
      const drift = num(d, 'maxDriftSec');
      return {
        main: drift == null ? NONE : `${drift} s rozjazdu`,
        sub: text(d, 'eventType'),
      };
    }
  }
}

/** Pełny rozkład rozbieżności do szuflady szczegółu. */
export function detailRows(flag: FlagListItemDto): DetailRow[] {
  const d = flag.details;

  switch (flag.type) {
    case 'aircraft_overlap': {
      const open = num(d, 'openSessions');
      return [
        {
          key: 'Sesje bez day_close',
          value: open == null ? NONE : String(open),
          tone: 'red',
        },
        { key: 'Sesje w sprawie', value: String(flag.sessionUuids.length) },
      ];
    }
    case 'pilot_overlap': {
      const from = num(d, 'from');
      const to = num(d, 'to');
      return [
        { key: 'Maszyny', value: text(d, 'aircraft') ?? NONE, tone: 'amber' },
        { key: 'Wspólny odcinek od', value: from == null ? NONE : `${timeUtc(from)} UTC` },
        // „trwa", nie kreska: brak `to` znaczy, że któraś sesja jest nadal otwarta,
        // czyli nakładka NIE SKOŃCZYŁA SIĘ — to fakt, a nie brak danych.
        { key: 'Wspólny odcinek do', value: to == null ? 'trwa' : `${timeUtc(to)} UTC` },
        { key: 'Sesje w sprawie', value: String(flag.sessionUuids.length) },
      ];
    }
    case 'mh_gap':
    case 'mh_regression': {
      const gap = flag.type === 'mh_gap' ? num(d, 'gapH') : negate(num(d, 'regressionH'));
      return [
        { key: 'Koniec poprzednika', value: mh(num(d, 'prevEnd')) },
        { key: 'Odczyt startowy', value: mh(num(d, 'nextStart')) },
        { key: 'Różnica', value: signed(gap, 'h'), tone: 'red' },
      ];
    }
    case 'fuel_mismatch':
      return [
        { key: 'Przekazanie poprzednika', value: litres(num(d, 'handoverL')) },
        { key: 'Odczyt paliwomierza', value: litres(num(d, 'readingL')) },
        { key: 'Różnica', value: signed(num(d, 'diffL'), 'L'), tone: 'amber' },
        { key: 'Tolerancja samolotu', value: litres(num(d, 'toleranceL')) },
      ];
    case 'clock_drift': {
      const drift = num(d, 'maxDriftSec');
      const compared = num(d, 'comparedEvents');
      return [
        { key: 'Największy rozjazd', value: drift == null ? NONE : `${drift} s`, tone: 'amber' },
        { key: 'Zdarzenie', value: text(d, 'eventType') ?? NONE },
        { key: 'UUID zdarzenia', value: text(d, 'eventUuid') ?? NONE },
        {
          key: 'Porównanych zdarzeń',
          value:
            compared == null
              ? NONE
              : `${compared} ${plural(compared, 'zdarzenie', 'zdarzenia', 'zdarzeń')}`,
        },
      ];
    }
  }
}
