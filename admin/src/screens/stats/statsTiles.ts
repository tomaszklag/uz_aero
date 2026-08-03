/**
 * UZ Aero — panel: KAFLE STATYSTYK (moduł CZYSTY) — sześć kafli mockupu `A10`.
 *
 * Każda liczba jest PRZEPISANA z odpowiedzi serwera (`StatsTotalsDto`) — także
 * procenty i rozjazd Δ MH vs blok, które policzył serwer. Moduł składa wyłącznie
 * NAPISY: formatuje, odmienia i dobiera przypis do stanu danych.
 *
 * `null` z serwera zostaje kreską z przypisem mówiącym DLACZEGO — dwa różne powody
 * („wiersze sprzed migracji 18" vs „dni bez bilansu") dostają dwa różne zdania,
 * bo pierwsze naprawia przebudowa, a drugiego nie naprawi nic.
 */

import { duration, plural } from '@uzaero/format';

import type { StatsReportDto } from '../../api/dto';
import type { TileTone } from '../../ui/components';
import { comma1, DASH, dot1, dot2, thousands } from './statsFormat';

export interface StatsTile {
  key: string;
  label: string;
  value: string;
  unit?: string;
  tone?: TileTone;
  note: string;
}

const UNKNOWN_NOTE = 'Nie wiadomo — raport się nie pobrał.';

/** Przypis kafli unieważnionych wierszami sprzed migracji 18 — kieruje na `A11`. */
const staleNote = (rows: number): string =>
  `${rows} ${plural(rows, 'wiersz projekcji jest', 'wiersze projekcji są', 'wierszy projekcji jest')} sprzed migracji 18 — uruchom przebudowę na ekranie Konserwacja.`;

/** Sześć kafli mockupu, w tej samej kolejności. `data === null` = wszystkie „—". */
export function statsTiles(data: StatsReportDto | null): StatsTile[] {
  if (data == null) {
    return [
      { key: 'block', label: 'Nalot blokowy', value: DASH, note: UNKNOWN_NOTE },
      { key: 'flight', label: 'Czas lotu', value: DASH, note: UNKNOWN_NOTE },
      { key: 'takeoffs', label: 'Starty / lądowania', value: DASH, note: UNKNOWN_NOTE },
      { key: 'fuel', label: 'Paliwo zużyte', value: DASH, note: UNKNOWN_NOTE },
      { key: 'mh', label: 'Przyrost motogodzin', value: DASH, note: UNKNOWN_NOTE },
      { key: 'days', label: 'Dni lotne', value: DASH, note: UNKNOWN_NOTE },
    ];
  }

  const t = data.totals;
  return [
    {
      key: 'block',
      label: 'Nalot blokowy',
      value: duration(t.blockMs),
      tone: 'green',
      note: `Suma \`engine_start\` → \`engine_stop\` z ${t.sessions} ${plural(t.sessions, 'dnia lotnego', 'dni lotnych', 'dni lotnych')}.`,
    },
    {
      key: 'flight',
      label: 'Czas lotu',
      value: duration(t.flightMs),
      note:
        t.flightVsBlockPct == null
          ? 'Zakres bez nalotu blokowego — nie ma czego porównywać.'
          : `${comma1(t.flightVsBlockPct)} % nalotu blokowego — reszta to kołowanie i postoje z pracującym silnikiem.`,
    },
    takeoffsTile(t.takeoffs, t.landings, t.staleRows),
    {
      key: 'fuel',
      label: 'Paliwo zużyte',
      value: t.fuelConsumedL == null ? DASH : thousands(t.fuelConsumedL),
      ...(t.fuelConsumedL == null ? {} : { unit: 'L', tone: 'amber' as const }),
      note: fuelNote(t.fuelConsumedL, t.fuelUnknownSessions, t.staleRows),
    },
    {
      key: 'mh',
      label: 'Przyrost motogodzin',
      value: t.mhDeltaH == null ? DASH : dot1(t.mhDeltaH),
      ...(t.mhDeltaH == null ? {} : { unit: 'h' }),
      note: mhNote(t),
    },
    {
      key: 'days',
      label: 'Dni lotne',
      value: String(t.sessions),
      tone: 'blue',
      note: `${t.aircraft} ${plural(t.aircraft, 'samolot', 'samoloty', 'samolotów')} · ${t.pilots} ${plural(t.pilots, 'pilot', 'pilotów', 'pilotów')} · ${data.range.calendarDays} ${plural(data.range.calendarDays, 'dzień kalendarzowy', 'dni kalendarzowe', 'dni kalendarzowych')}.`,
    },
  ];
}

function takeoffsTile(
  takeoffs: number | null,
  landings: number | null,
  staleRows: number,
): StatsTile {
  if (takeoffs == null || landings == null) {
    return {
      key: 'takeoffs',
      label: 'Starty / lądowania',
      value: DASH,
      note: staleNote(staleRows),
    };
  }
  return {
    key: 'takeoffs',
    label: 'Starty / lądowania',
    value: String(takeoffs),
    unit: `/ ${landings}`,
    // Rozjazd startów z lądowaniami to nie kosmetyka: samolot, który wystartował
    // i „nie wylądował" w rejestrze, to dziura w danych — kafel ma ją nazwać.
    ...(takeoffs === landings ? {} : { tone: 'amber' as const }),
    note:
      takeoffs === landings
        ? 'Bilans domknięty na wszystkich samolotach.'
        : `Bilans NIEDOMKNIĘTY: ${takeoffs} ${plural(takeoffs, 'start', 'starty', 'startów')} i ${landings} ${plural(landings, 'lądowanie', 'lądowania', 'lądowań')} w rejestrze.`,
  };
}

/**
 * Przypis kafla MH. Blok w zdaniu to blok dni ZE ZNANYM Δ (`mhBlockHours`) — ten sam
 * zbiór dni co suma Δ, inaczej „rozjazd" mierzyłby brakujące odczyty, nie liczniki.
 * Dni bez pary odczytów są POLICZONE w adnotacji, jak przy paliwie.
 */
function mhNote(t: StatsReportDto['totals']): string {
  if (t.mhDeltaH == null || t.mhVsBlockH == null) {
    return t.staleRows > 0
      ? staleNote(t.staleRows)
      : 'Żaden dzień zakresu nie ma pary odczytów licznika.';
  }
  const base = `Δ liczników fizycznych · blok ${dot2(t.mhBlockHours)} h — rozjazd ${dot2(Math.abs(t.mhVsBlockH))} h`;
  if (t.mhUnknownSessions === 0) return `${base}.`;
  return `${base} · ${t.mhUnknownSessions} ${plural(t.mhUnknownSessions, 'dzień', 'dni', 'dni')} bez pary odczytów nie ${plural(t.mhUnknownSessions, 'wchodzi', 'wchodzą', 'wchodzi')} do porównania.`;
}

function fuelNote(fuel: number | null, unknown: number, staleRows: number): string {
  if (fuel == null) {
    return staleRows > 0 ? staleNote(staleRows) : 'Żaden dzień zakresu nie ma bilansu paliwa.';
  }
  if (unknown > 0) {
    return `Start + dolane − koniec, sesja po sesji · ${unknown} ${plural(unknown, 'dzień', 'dni', 'dni')} bez bilansu nie ${plural(unknown, 'wchodzi', 'wchodzą', 'wchodzi')} do sumy.`;
  }
  return 'Start + dolane − koniec, sesja po sesji.';
}
