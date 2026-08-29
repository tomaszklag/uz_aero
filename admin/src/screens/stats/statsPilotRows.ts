/**
 * UZ Aero - panel: UJĘCIE „PER PILOT" → wiersze tabeli (moduł CZYSTY).
 *
 * ══ KOLUMNY „BLOK JAKO DUAL" TU NIE MA - I EKRAN MÓWI TO WPROST ══
 * Mockup ją pokazuje, ale backend nie ma jej z czego uczciwie policzyć: projekcja
 * `sessions` niesie OSTATNIEGO duala dnia, a zmiana załogi w środku dnia (ekran 07
 * telefonu) przypisałaby mu cudze godziny. Atrybucja bloku per członek załogi wymaga
 * projekcji DOMENOWEJ (wspólnej z aplikacją - `docs/architektura-panelu-serwer.md`
 * §10 poz. 8) i jest decyzją poza tym przekrojem. Reguła brzmi: nie wdrażamy treści,
 * której backend nie dostarcza - pomijamy i mówimy dlaczego, zamiast pokazać liczbę,
 * która bywa fałszywa.
 */

import { duration, plural } from '@uzaero/format';

import type { StatsPilotItemDto, StatsTotalsDto } from '../../api/dto';
import { DASH } from './statsFormat';

export interface PilotRowView {
  key: string;
  total: boolean;
  name: string;
  code: string;
  days: string;
  /** Blok sesji, w których pilot był PIC-em - sumuje się do nalotu floty. */
  blockPic: string;
  flight: string;
  takeoffsLandings: string;
  /** `SP-KLM · SP-ABC` - jednostki, na których latał jako PIC. */
  regs: string;
  blockClass?: string;
  flightClass?: string;
}

/**
 * Zdanie pod tabelą - dlaczego Duala nie ma i komu przypisujemy starty. Ostatnie
 * zdanie mówi PRAWDĘ o kaflu „piloci": liczy on PIC-ów i OSTATNIEGO duala każdego
 * dnia (tylko jego niesie `dual_id`), więc nie wolno obiecać, że „pilot latający
 * wyłącznie jako Dual" zawsze się w nim znajdzie - dual zastąpiony w środku dnia
 * może wypaść. Ta sama granica projekcji, co brak kolumny.
 */
export const PILOTS_HINT =
  'Blok jako PIC sumuje się do nalotu floty; starty i lądowania też przypisujemy PIC-owi. Kolumny „Blok jako Dual" z mockupu tu NIE MA: projekcja niesie ostatniego duala dnia, więc przy zmianie załogi w środku dnia liczba przypisywałaby mu cudze godziny - atrybucja per członek załogi czeka na projekcję domenową. Z tego samego powodu kafel „piloci" liczy PIC-ów i OSTATNIEGO duala każdego dnia - dual zastąpiony w środku dnia może nie być policzony i nie ma tu wiersza.';

export function pilotRows(pilots: StatsPilotItemDto[], totals: StatsTotalsDto): PilotRowView[] {
  const rows = pilots.map(
    (row): PilotRowView => ({
      key: row.pilotId,
      total: false,
      name: row.name ?? row.pilotId,
      code: row.code ?? DASH,
      days: String(row.sessions),
      blockPic: duration(row.blockMs),
      flight: duration(row.flightMs),
      takeoffsLandings:
        row.takeoffs == null || row.landings == null ? DASH : `${row.takeoffs} / ${row.landings}`,
      regs: row.regs.length === 0 ? DASH : row.regs.join(' · '),
    }),
  );

  rows.push({
    key: 'total',
    total: true,
    name: 'RAZEM',
    // Liczba WIERSZY (PIC-ów), nie `totals.pilots`: tamten kafel liczy też dualów,
    // a ta kolumna podsumowuje tabelę, którą widać.
    code: `${pilots.length} ${plural(pilots.length, 'pilot', 'pilotów', 'pilotów')}`,
    days: String(totals.sessions),
    blockPic: duration(totals.blockMs),
    flight: duration(totals.flightMs),
    takeoffsLandings:
      totals.takeoffs == null || totals.landings == null
        ? DASH
        : `${totals.takeoffs} / ${totals.landings}`,
    regs: `${totals.aircraft} ${plural(totals.aircraft, 'samolot', 'samoloty', 'samolotów')}`,
    blockClass: 'cell-green',
    flightClass: 'cell-blue',
  });

  return rows;
}
