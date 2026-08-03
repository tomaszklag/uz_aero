/**
 * UZ Aero — panel: KAFLE PULPITU (moduł CZYSTY).
 *
 * ══ KAFEL JEST PRZEJŚCIEM, WIĘC JEGO LICZBA JEST OBIETNICĄ ══
 * Każdy kafel prowadzi do listy zawężonej dokładnie tak, jak policzona jest jego
 * liczba — i każda z tych liczb pochodzi z zapytania EKRANU DOCELOWEGO, nie z drugiej
 * definicji na pulpicie (`server/src/application/admin/queries/dashboard.ts`). Pulpit
 * bez przejść jest tablicą ogłoszeń.
 *
 * ══ `null` TO „NIE WIEMY", NIGDY `0` ══
 * Przy braku odpowiedzi z serwera kafel pokazuje „—". Zero jest twierdzeniem o świecie
 * i na pulpicie kosztuje najwięcej: „0 otwartych flag" przy awarii pobrania to
 * najgorszy możliwy komunikat w narzędziu nadzoru, bo wygląda jak dobra wiadomość.
 */

import { plural } from '@uzaero/format';

import type { DashboardDto } from '../../api/dto';
import type { TileTone } from '../../ui/components';
import {
  openDaysHref,
  missingExportsHref,
  allExportsHref,
  flagsHref,
  busyFleetHref,
} from './dashboardLinks';

export interface DashboardTile {
  /** Klucz Reacta i identyfikator w teście — nie etykieta. */
  key: string;
  label: string;
  value: string;
  unit?: string;
  tone?: TileTone;
  note: string;
  /** Dokąd prowadzi kafel. Każdy kafel ma cel — to jest reguła, nie ozdoba. */
  to: string;
}

/** Wartość kafla przy braku odpowiedzi serwera. */
const UNKNOWN = '—';

/**
 * Przypis kafla, którego nie udało się policzyć.
 *
 * Jeden napis dla wszystkich czterech i to jest świadome: przy braku odpowiedzi
 * NIE PODAJEMY nawet definicji („aktywny claim z niezamkniętą sesją"). Definicja pod
 * kreską czyta się jak opis stanu, który znamy — a nie znamy żadnego.
 */
const UNKNOWN_NOTE = 'Nie wiadomo — pulpit się nie pobrał.';

/**
 * Cztery kafle mockupu `A01`, w tej samej kolejności.
 *
 * `data === null` znaczy „pulpit się nie pobrał" — wtedy WSZYSTKIE cztery mówią „—",
 * bez jednostki i BEZ TONU: zielone „—" sugerowałoby, że jest dobrze, a czerwone, że
 * jest źle. Przejścia zostają czynne, bo lista docelowa może się pobrać, nawet gdy
 * pulpit nie.
 */
export function dashboardTiles(data: DashboardDto | null): DashboardTile[] {
  const counts = data?.counts ?? null;

  return [
    {
      key: 'ruch',
      label: 'Samoloty w ruchu',
      value: counts == null ? UNKNOWN : String(counts.aircraftClaimed),
      ...(counts == null ? {} : { unit: `/ ${counts.aircraftTotal}`, tone: 'green' as const }),
      note: counts == null ? UNKNOWN_NOTE : 'Aktywny claim z niezamkniętą sesją.',
      to: busyFleetHref(),
    },
    {
      key: 'dni',
      label: 'Dni otwarte',
      value: counts == null ? UNKNOWN : String(counts.openDays),
      note: openDaysNote(data),
      to: openDaysHref(),
    },
    {
      key: 'flagi',
      label: 'Flagi otwarte',
      value: counts == null ? UNKNOWN : String(counts.openFlags),
      // Zero flag NIE jest awarią, więc nie ma prawa świecić na bursztyn — kolor
      // zmienia się dopiero wtedy, gdy jest co rozstrzygać (mockup `A03b`).
      ...(counts == null
        ? {}
        : { tone: counts.openFlags > 0 ? ('amber' as const) : ('green' as const) }),
      note: flagsNote(data),
      to: flagsHref(),
    },
    exportTile(data),
  ];
}

/**
 * Kafel eksportu ma DWIE postaci i to jest treść, nie kosmetyka: „1 błąd" prowadzi do
 * kart, których brakuje, a „wszystko aktualne" (mockup `A01a`) do pełnego monitora.
 * Liczba w czerwieni przy zerowej awarii byłaby fałszywym alarmem na ekranie, który
 * ma alarmować.
 */
function exportTile(data: DashboardDto | null): DashboardTile {
  const exports = data?.counts.exports ?? null;
  if (exports == null) {
    return {
      key: 'eksport',
      label: 'Eksport arkuszy',
      value: UNKNOWN,
      note: UNKNOWN_NOTE,
      to: allExportsHref(),
    };
  }

  if (exports.missing > 0) {
    return {
      key: 'eksport',
      label: 'Eksport arkuszy',
      value: String(exports.missing),
      unit: plural(exports.missing, 'błąd', 'błędy', 'błędów'),
      tone: 'red',
      note: 'Dzień zamknięty, a karty nie ma w arkuszu — eksport odbił się awarią.',
      to: missingExportsHref(),
    };
  }

  if (exports.blocked > 0) {
    return {
      key: 'eksport',
      label: 'Eksport arkuszy',
      value: String(exports.blocked),
      unit: plural(exports.blocked, 'zablokowana', 'zablokowane', 'zablokowanych'),
      tone: 'amber',
      note: 'Otwarta flaga trzyma kartę poza arkuszem. Rozstrzygnięcie ją odblokuje.',
      to: allExportsHref(),
    };
  }

  return {
    key: 'eksport',
    label: 'Eksport arkuszy',
    value: 'wszystko aktualne',
    tone: 'green',
    note: `${exports.current} z ${exports.total} ${plural(exports.total, 'dnia', 'dni', 'dni')} ma kartę w arkuszu · 0 awarii.`,
    to: allExportsHref(),
  };
}

/**
 * Przypis kafla „Dni otwarte" mówi o tym, co WYMAGA UWAGI, a nie powtarza liczby.
 * Dzień otwarty od rana to normalna praca; dzień otwarty dłużej niż okno korekty
 * pilota to zadanie dla administratora.
 */
function openDaysNote(data: DashboardDto | null): string {
  if (data == null) return UNKNOWN_NOTE;
  const stale = data.attention.staleOpenDays.length;
  if (data.counts.openDays === 0) return 'Każdy dzień lotny ma `day_close`.';
  if (stale === 0) return 'Wszystkie z dzisiaj — to normalna praca, nie zaległość.';
  return `W tym ${stale} bez \`day_close\` dłużej niż doba.`;
}

function flagsNote(data: DashboardDto | null): string {
  if (data == null) return UNKNOWN_NOTE;
  if (data.counts.openFlags === 0) return 'Skrzynka pusta. Historia rozwiązanych zostaje.';

  const blocking = data.attention.flags.filter((flag) => flag.blocksExport).length;
  if (blocking > 0) {
    return `${blocking} ${plural(blocking, 'trzyma', 'trzymają', 'trzyma')} kartę dnia poza arkuszem.`;
  }
  return 'Żadna nie blokuje arkusza — ale każda czeka na rozstrzygnięcie.';
}
