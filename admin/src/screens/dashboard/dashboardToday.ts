/**
 * UZ Aero — panel: „DZIŚ W LICZBACH" i „OSTATNI DZIEŃ LOTNY" (moduł CZYSTY).
 *
 * Obie karty pokazują TĘ SAMĄ dobę w tym samym kształcie (`DayTotalsDto`) — różni je
 * wyłącznie to, o którą dobę pytamy. Wariant z ruchem pyta o dziś, wariant „cisza"
 * o ostatni dzień, w którym cokolwiek się działo.
 *
 * ══ CZEGO TU NIE MA I DLACZEGO ══
 * Mockup ma w tej karcie czwartą komórkę: **„Zrzuty · skoczkowie 6 · 41"**. Serwer jej
 * nie dostarcza i nie jest to przeoczenie: `DropSummary` liczy `projectSession`
 * W PAMIĘCI, a projekcja `sessions` takich kolumn NIE MA. Podanie tej liczby wymagałoby
 * albo migracji projekcji (czyli zmiany ścieżki ingestu telefonu), albo wywołania
 * `projectSession` na każdej dzisiejszej sesji — drugiego powodu czytania strumieni na
 * ekranie, który ma się otwierać natychmiast.
 *
 * Komórka zostaje więc na swoim miejscu z wartością „—" i jawnym wyjaśnieniem pod
 * siatką. To jest reguła, nie wymówka: **`null` znaczy „nie wiemy", a zero byłoby
 * twierdzeniem, że nikt dziś nie skakał.**
 */

import { duration, plural } from '@uzaero/format';

import type { DayTotalsDto } from '../../api/dto';
import type { TileTone } from '../../ui/components';
import { daysForDayHref } from './dashboardLinks';

export interface DayCell {
  key: string;
  label: string;
  value: string;
  unit?: string;
  tone?: TileTone;
}

export interface DayView {
  /** `YYYY-MM-DD` UTC — nagłówek karty i cel przejścia. */
  day: string;
  cells: DayCell[];
  /** Lista dni zawężona do TEJ doby — kafel liczy i prowadzi do tego samego. */
  to: string;
  /** Zdanie pod siatką: co dokładnie te liczby obejmują i czego w nich nie ma. */
  note: string;
}

/** Brak danych. Nigdy zero — patrz nagłówek pliku. */
const DASH = '—';

export function dayView(totals: DayTotalsDto): DayView {
  return {
    day: totals.day,
    to: daysForDayHref(totals.day),
    cells: [
      {
        key: 'zdarzenia',
        label: 'Zdarzenia',
        value: String(totals.eventsAccepted),
      },
      { key: 'loty', label: 'Loty', value: String(totals.flights) },
      {
        key: 'blok',
        label: 'Blok łącznie',
        value: duration(totals.blockMs),
        tone: 'blue',
      },
      {
        key: 'zrzuty',
        label: 'Zrzuty · skoczkowie',
        // Świadomie „—", nie „0" — projekcja dni nie niesie zrzutów (patrz nagłówek).
        value: DASH,
      },
    ],
    note: noteOf(totals),
  };
}

function noteOf(totals: DayTotalsDto): string {
  const flew =
    totals.sessions === 0
      ? 'Żaden dzień lotny nie ma w tej dobie duty startu.'
      : `${totals.sessions} ${plural(totals.sessions, 'dzień lotny', 'dni lotne', 'dni lotnych')} na ${totals.aircraft} ${plural(totals.aircraft, 'samolocie', 'samolotach', 'samolotach')}.`;

  return `${flew} „Zdarzenia" liczą to, co serwer PRZYJĄŁ w tej dobie (paczka z wczoraj przyjęta dziś liczy się do dziś), a loty i blok pochodzą z projekcji dni. Zrzutów i skoczków nie ma: projekcja \`sessions\` nie niesie takich kolumn, więc zamiast zera stoi kreska.`;
}
