/**
 * UZ Aero — panel: STRONA PRZYCHODOWA · ZRZUTY (moduł CZYSTY) — sekcja mockupu `A10`.
 *
 * Wszystkie liczby — także średnie i „na godzinę lotu" — przychodzą z serwera;
 * moduł składa napisy, geometrię wstęgi typów i wiersze tabeli klientów.
 *
 * ══ TRZY STANY SEKCJI ══
 *  `stale` — w zakresie są wiersze, których nie da się uczciwie doliczyć do zrzutów:
 *            dni skokowe sprzed migracji 18 ORAZ dni bez rodzaju operacji (każdy MÓGŁ
 *            być skokowy). Kafle mówią „—" i sekcja kieruje na przebudowę (`A11`).
 *            Zero byłoby twierdzeniem, że nikt nie skakał.
 *  `empty` — zakres nie ma zamkniętych dni operacji SKOKI: to fakt, nie awaria —
 *            zdanie o fakcie pokazuje się WYŁĄCZNIE przy zerowym liczniku stale.
 *  `ok`    — liczby z sum kolumn projekcji.
 */

import { duration, plural } from '@uzaero/format';

import type { StatsDropsDto, StatsOperationItemDto } from '../../api/dto';
import { comma1, DASH, dot1, feetThousands, thousands } from './statsFormat';

export interface DropsTile {
  key: string;
  label: string;
  value: string;
  unit?: string;
  tone?: 'blue';
  note: string;
}

export interface RibbonSegment {
  key: string;
  width: string;
  tone: 'blue' | 'green' | 'amber';
  label: string;
}

export interface ClientRowView {
  key: string;
  total: boolean;
  client: string;
  lifts: string;
  jumpers: string;
  tandem: string;
  aff: string;
  solo: string;
  avgAltitude: string;
  perLift: string;
  jumpersClass?: string;
}

export interface DropsView {
  state: 'ok' | 'stale' | 'empty';
  /** Plakietki nagłówka karty: zakres operacji i jednostki z liczbą dni. */
  pills: { key: string; label: string; tone: 'blue' | 'dim' }[];
  tiles: DropsTile[];
  ribbon: RibbonSegment[];
  clients: ClientRowView[];
  /** Zdanie stanu `stale`/`empty`; `null` przy danych kompletnych. */
  note: string | null;
}

export function dropsView(
  drops: StatsDropsDto,
  operations: StatsOperationItemDto[],
): DropsView {
  const pills: DropsView['pills'] = [{ key: 'scope', label: 'operacja SKOKI', tone: 'blue' }];
  const skoki = operations.find((row) => row.operation === 'skoki');
  if (skoki != null && skoki.regs.length > 0) {
    pills.push({
      key: 'units',
      label: `${skoki.regs.join(' · ')} · ${drops.sessions} ${plural(drops.sessions, 'dzień', 'dni', 'dni')}`,
      tone: 'dim',
    });
  }

  if (drops.staleRows > 0) {
    return {
      state: 'stale',
      pills,
      tiles: dashTiles(),
      ribbon: [],
      clients: [],
      note: `${drops.staleRows} ${plural(drops.staleRows, 'wiersza projekcji w zakresie nie da się', 'wierszy projekcji w zakresie nie da się', 'wierszy projekcji w zakresie nie da się')} uczciwie doliczyć do zrzutów: brak rodzaju operacji (dzień MÓGŁ być skokowy) albo brak agregatów sprzed migracji 18. Uruchom przebudowę projekcji na ekranie Konserwacja; zera w tym miejscu twierdziłyby, że nikt nie skakał.`,
    };
  }

  if (drops.sessions === 0) {
    return {
      state: 'empty',
      pills,
      tiles: dashTiles(),
      ribbon: [],
      clients: [],
      note: 'W zakresie nie ma zamkniętych dni operacji SKOKI — strona przychodowa nie ma czego rozliczać. To fakt o zakresie, nie awaria danych.',
    };
  }

  return {
    state: 'ok',
    pills,
    tiles: [
      {
        key: 'lifts',
        label: 'Wyniesienia',
        value: String(drops.lifts ?? 0),
        tone: 'blue',
        note: `Zdarzeń \`drop\` · ${comma1(drops.liftsPerSession)} na dzień lotny.`,
      },
      {
        key: 'jumpers',
        label: 'Skoczkowie',
        value: String(drops.jumpers ?? 0),
        tone: 'blue',
        note: `Średnio ${comma1(drops.jumpersPerLift)} na wyniesienie.`,
      },
      {
        key: 'altitude',
        label: 'Śr. wysokość zrzutu',
        value: drops.avgAltitudeFt == null ? DASH : thousands(drops.avgAltitudeFt),
        ...(drops.avgAltitudeFt == null ? {} : { unit: 'ft' }),
        note: altitudeNote(drops),
      },
      {
        key: 'per-hour',
        label: 'Skoczków na godzinę lotu',
        value: dot1(drops.jumpersPerFlightHour),
        note: `${drops.jumpers ?? 0} skoczków / ${duration(drops.flightMs)} czasu lotu.`,
      },
    ],
    ribbon: ribbonSegments(drops),
    clients: clientRows(drops),
    note: null,
  };
}

const dashTiles = (): DropsTile[] => [
  { key: 'lifts', label: 'Wyniesienia', value: DASH, note: 'Nie wiemy — patrz baner niżej.' },
  { key: 'jumpers', label: 'Skoczkowie', value: DASH, note: 'Nie wiemy — patrz baner niżej.' },
  { key: 'altitude', label: 'Śr. wysokość zrzutu', value: DASH, note: 'Nie wiemy — patrz baner niżej.' },
  { key: 'per-hour', label: 'Skoczków na godzinę lotu', value: DASH, note: 'Nie wiemy — patrz baner niżej.' },
];

function altitudeNote(drops: StatsDropsDto): string {
  if (drops.avgAltitudeFt == null) {
    return 'Żaden zrzut zakresu nie miał fixa wysokości — średniej nie ma z czego policzyć.';
  }
  // Licznik zrzutów Z fixem przychodzi z serwera (`drop_alt_count`) — odtwarzanie go
  // odejmowaniem `lifts − without` byłoby arytmetyką panelu na liczbie, którą serwer MA.
  const withFix = drops.dropsWithAltitude ?? 0;
  const without = drops.dropsWithoutAltitude ?? 0;
  if (without === 0) return `Z ${withFix} ${plural(withFix, 'zrzutu', 'zrzutów', 'zrzutów')} — każdy miał fix GPS.`;
  return `Z ${withFix} ${plural(withFix, 'zrzutu', 'zrzutów', 'zrzutów')}, które miały fix GPS — ${without} bez wysokości nie ${plural(without, 'wchodzi', 'wchodzą', 'wchodzi')} do średniej.`;
}

/** Wstęga typów: szerokość = udział w skoczkach; segment zerowy znika, nie zwęża się do 0. */
function ribbonSegments(drops: StatsDropsDto): RibbonSegment[] {
  const jumpers = drops.jumpers ?? 0;
  if (jumpers <= 0) return [];
  const seg = (
    key: string,
    tone: RibbonSegment['tone'],
    label: string,
    value: number,
  ): RibbonSegment | null =>
    value <= 0
      ? null
      : { key, tone, width: `${((value / jumpers) * 100).toFixed(1)}%`, label: `${label} ${value}` };

  return [
    seg('tandem', 'blue', 'TANDEM', drops.tandem ?? 0),
    seg('aff', 'green', 'AFF', drops.aff ?? 0),
    seg('solo', 'amber', 'SOLO', drops.solo ?? 0),
  ].filter((segment): segment is RibbonSegment => segment != null);
}

function clientRows(drops: StatsDropsDto): ClientRowView[] {
  if (drops.clients.length === 0) return [];

  const rows = drops.clients.map(
    (row): ClientRowView => ({
      key: row.client ?? 'none',
      total: false,
      client: row.client ?? 'bez wskazania klienta',
      lifts: String(row.lifts),
      jumpers: String(row.jumpers),
      tandem: String(row.tandem),
      aff: String(row.aff),
      solo: String(row.solo),
      avgAltitude: feetThousands(row.avgAltitudeFt),
      perLift: dot1(row.jumpersPerLift),
    }),
  );

  rows.push({
    key: 'total',
    total: true,
    client: 'RAZEM',
    lifts: String(drops.lifts ?? 0),
    jumpers: String(drops.jumpers ?? 0),
    tandem: String(drops.tandem ?? 0),
    aff: String(drops.aff ?? 0),
    solo: String(drops.solo ?? 0),
    avgAltitude: feetThousands(drops.avgAltitudeFt),
    perLift: dot1(drops.jumpersPerLift),
    jumpersClass: 'cell-blue',
  });

  return rows;
}
