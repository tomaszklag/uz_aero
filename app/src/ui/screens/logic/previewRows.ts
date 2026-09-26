/**
 * Ninerdeck - PODGLĄD PILOTA (26A) I SAMOLOTU (26B) przy decyzji (3.1.0, issue #206).
 *
 * Czysta logika obu ekranów: z odpowiedzi serwera (TEN SAM komplet, który dostaje
 * szuflada w panelu) składa tytuł, podtytuł, grupy wierszy „etykieta → wartość",
 * tabelę ostatnich lotów i listę najbliższych terminów. Liczb NIE liczy - to robi
 * serwer, raz, dla obu powierzchni; tu są wyłącznie napisy.
 *
 * ══ DWA ZEGARY NA JEDNYM EKRANIE, ŚWIADOMIE ══
 * Chwile OPERACJI (ostatnie loty, ostatni lot, odczyt) idą datą rejestru - UTC, jak
 * historia i log operacji. TERMINY idą dobą klubu, jak reszta kalendarza (§6.1):
 * godziny liczą się odejmowaniem od granic doby, którą serwer przysyła przy każdym
 * terminie - `Intl` w aplikacji nie pada ani razu.
 *
 * ══ CZEGO TU NIE MA ══
 * Licencji, badań ani uprawnień na typ - system ich nie zna (decyzja właściciela
 * 2026-09-23). Pusty wiersz „Badania -" na ekranie decyzji czytałby się jak
 * stwierdzenie o dokumentach, a byłby stwierdzeniem o brakującym module.
 */

import {
  dateTimeUtcShort,
  dateUtcDayMonth,
  duration,
  litres,
  motoHours,
  oilLitres,
  plural,
  shortName,
} from '@ninerdeck/format';

import type {
  RemoteAircraftPreview,
  RemotePilotPreview,
  RemotePreviewRecent,
  RemotePreviewUpcoming,
} from '../../../application';

import { clubInstant } from './clubClock';
import { dayBounds, termLabel } from './inbox';
import { operationLabelOf } from './operations';

const DAY_MS = 86_400_000;
const NONE = '—';

export interface PreviewRow {
  label: string;
  value: string;
  sub: string | null;
  tone?: 'amber';
}

export interface PreviewGroup {
  label: string;
  rows: PreviewRow[];
}

export interface PreviewTableRow {
  id: string;
  /** Kiedy · kto/czym · zadanie · blok - w tej kolejności. */
  cells: string[];
}

export interface PreviewTable {
  label: string;
  /** Nagłówek drugiej kolumny: „Samolot" (podgląd pilota) albo „Pilot" (samolotu). */
  columns: string[];
  rows: PreviewTableRow[];
  /** Zdanie zamiast pustej tabeli. */
  empty: string;
}

export interface PreviewVm {
  title: string;
  sub: string;
  groups: PreviewGroup[];
  recent: PreviewTable;
  upcoming: PreviewGroup;
}

export interface PreviewOptions {
  now: number;
  /** Znak maszyny z cache floty; `null` = poza cache - na ekran idzie kreska, nie id. */
  regOf: (aircraftId: string) => string | null;
  personOf: (pilotId: string) => { name: string; code: string } | null;
}

const SOURCE_LABEL: Readonly<Record<NonNullable<RemoteAircraftPreview['counters']>['source'], string>> = {
  handover: 'zdanie samolotu',
  open_session: 'operacja w toku',
  initial: 'stan początkowy z panelu',
  admin: 'wpis administratora',
};

const BLOCK_LABEL: Readonly<Record<string, string>> = {
  maintenance: 'przegląd',
  defect: 'usterka',
  other: 'wyłączona',
};

/** „dziś", „wczoraj", „6 dni temu" - po dobach UTC, jak reszta dat rejestru. */
export function daysAgoLabel(at: number, now: number): string {
  const diff = Math.floor(now / DAY_MS) - Math.floor(at / DAY_MS);
  if (diff <= 0) return 'dziś';
  if (diff === 1) return 'wczoraj';
  return `${diff} ${plural(diff, 'dzień', 'dni', 'dni')} temu`;
}

const flightsLabel = (n: number): string => `${n} ${plural(n, 'lot', 'loty', 'lotów')}`;

/** „12 MAR 2024" - data przyjęcia do klubu; rok, bo to bywa kilka lat temu. */
export function memberSinceLabel(iso: string): string | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return `${dateUtcDayMonth(at)} ${new Date(at).getUTCFullYear()}`;
}

/**
 * Termin z listy „najbliższych": w jednej dobie klubu „sob 26 WRZ 09:00-12:00" (jak
 * w skrzynce), przez kilka dób „29 WRZ - 02 PAŹ" - dzień końca liczy się przesunięciem
 * doby początku, bo serwer przysyła jedną dobę na termin.
 */
export function upcomingTermLabel(row: RemotePreviewUpcoming): string {
  const day = dayBounds(row.day);
  const startsAt = Date.parse(row.startsAt);
  const endsAt = Date.parse(row.endsAt);
  if (day == null || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return NONE;
  if (endsAt <= day.endsAt) return termLabel(day, startsAt, endsAt) ?? NONE;
  return `${dateUtcDayMonth(clubInstant(startsAt, day))} - ${dateUtcDayMonth(clubInstant(endsAt, day))}`;
}

function recentRows(
  rows: readonly RemotePreviewRecent[],
  who: (row: RemotePreviewRecent) => string,
): PreviewTableRow[] {
  return rows.map((row) => {
    const at = row.at == null ? NaN : Date.parse(row.at);
    return {
      id: row.sessionUuid,
      cells: [
        Number.isFinite(at) ? dateUtcDayMonth(at) : NONE,
        who(row),
        operationLabelOf(row.operation) ?? NONE,
        duration(row.blockMs),
      ],
    };
  });
}

function upcomingRows(
  rows: readonly RemotePreviewUpcoming[],
  value: (row: RemotePreviewUpcoming) => string,
): PreviewRow[] {
  return rows.map((row) => {
    const label = upcomingTermLabel(row);
    if (row.kind === 'block') {
      return {
        label,
        value: 'Wyłączona z użytku',
        sub: BLOCK_LABEL[row.blockReason ?? 'other'] ?? BLOCK_LABEL.other!,
        tone: 'amber',
      };
    }
    if (row.thisCase) return { label, value: value(row), sub: '· ta sprawa' };
    if (row.overlaps) {
      return { label, value: value(row), sub: 'nachodzi na rozpatrywany termin', tone: 'amber' };
    }
    return { label, value: value(row), sub: null };
  });
}

export function pilotPreviewVm(wire: RemotePilotPreview, opts: PreviewOptions): PreviewVm {
  const person = opts.personOf(wire.pilot.id);
  const name = wire.pilot.name ?? person?.name ?? null;
  const code = wire.pilot.code ?? person?.code ?? null;
  const reg = opts.regOf(wire.onAircraft.aircraftId) ?? NONE;

  const since = wire.pilot.memberSince == null ? null : memberSinceLabel(wire.pilot.memberSince);
  const lastAt = wire.lastFlightAt == null ? NaN : Date.parse(wire.lastFlightAt);
  const sub = [
    code ?? NONE,
    since == null ? null : `w klubie od ${since}`,
    Number.isFinite(lastAt) ? `ostatni lot ${daysAgoLabel(lastAt, opts.now)}` : 'jeszcze bez lotu',
  ]
    .filter((x): x is string => x != null)
    .join(' · ');

  const on = wire.onAircraft;
  const onLast = on.lastAt == null ? NaN : Date.parse(on.lastAt);
  const onRows: PreviewRow[] =
    on.operations === 0
      ? [{ label: 'Operacji', value: '0', sub: 'pierwszy raz na tej maszynie' }]
      : [
          {
            label: 'Operacji',
            value: String(on.operations),
            sub: Number.isFinite(onLast) ? `· ostatnia ${daysAgoLabel(onLast, opts.now)}` : null,
          },
          { label: 'Nalot', value: duration(on.blockMs), sub: `· ${flightsLabel(on.flights)}` },
        ];

  const f = wire.flying;
  const window = (label: string, w: RemotePilotPreview['flying']['last30']): PreviewRow => ({
    label,
    value: flightsLabel(w.flights),
    sub: `· ${duration(w.blockMs)} blok · ${duration(w.flightMs)} w powietrzu`,
  });

  return {
    title: (name ?? code ?? NONE).toUpperCase(),
    sub,
    groups: [
      { label: `Na ${reg}`, rows: onRows },
      {
        label: 'Nalot',
        rows: [
          window('30 dni', f.last30),
          window('90 dni', f.last90),
          {
            label: 'W klubie',
            value: flightsLabel(f.total.flights),
            sub: `· ${duration(f.total.blockMs)} blok`,
          },
        ],
      },
    ],
    recent: {
      label: 'Ostatnie loty',
      columns: ['Kiedy', 'Samolot', 'Zadanie', 'Blok'],
      rows: recentRows(wire.recent, (row) => opts.regOf(row.aircraftId) ?? NONE),
      empty: 'W dzienniku klubu nie ma jeszcze ani jednego lotu tej osoby.',
    },
    upcoming: {
      label: 'Najbliższe rezerwacje',
      rows: upcomingRows(wire.upcoming, (row) => opts.regOf(row.aircraftId) ?? NONE),
    },
  };
}

export function aircraftPreviewVm(wire: RemoteAircraftPreview, opts: PreviewOptions): PreviewVm {
  const a = wire.aircraft;
  const c = wire.counters;

  const sub = [
    a.type,
    a.serviceStatus === 'active' ? 'w użytku' : 'wyłączona z użytku',
    `zbiornik ${litres(a.capacityL)}`,
  ].join(' · ');

  const signer = c == null ? null : (c.byPilotId ?? c.enteredBy);
  const signerName = signer == null ? null : opts.personOf(signer)?.name;
  const readAt = c == null ? NaN : Date.parse(c.at);
  const counters: PreviewRow[] = [
    { label: 'Motogodziny', value: c == null ? NONE : motoHours(c.mh, a.mhFormat), sub: null },
    { label: 'Paliwo', value: c == null ? NONE : litres(c.fuelL), sub: `· zbiornik ${litres(a.capacityL)}` },
    {
      label: 'Olej',
      value: c?.oilL == null ? NONE : oilLitres(c.oilL),
      sub: a.oilMinL == null ? null : `· minimum ${oilLitres(a.oilMinL)}`,
    },
    {
      label: 'Odczyt z',
      value: Number.isFinite(readAt) ? dateTimeUtcShort(readAt) : NONE,
      sub:
        c == null
          ? null
          : [SOURCE_LABEL[c.source], signerName == null ? null : shortName(signerName)]
              .filter((x): x is string => x != null)
              .join(', '),
    },
  ];

  const l = wire.last30;
  return {
    title: a.reg,
    sub,
    groups: [
      { label: 'Liczniki', rows: counters },
      {
        label: 'Ostatnie 30 dni',
        rows: [
          { label: 'Dni z lotami', value: String(l.daysWithFlights), sub: null },
          { label: 'Starty', value: String(l.takeoffs), sub: null },
          { label: 'Silnik', value: duration(l.blockMs), sub: `· w powietrzu ${duration(l.flightMs)}` },
        ],
      },
    ],
    recent: {
      label: 'Ostatnie loty',
      columns: ['Kiedy', 'Pilot', 'Zadanie', 'Blok'],
      rows: recentRows(wire.recent, (row) => {
        const p = opts.personOf(row.pilotId);
        return p == null ? NONE : shortName(p.name);
      }),
      empty: 'Ta maszyna nie ma jeszcze ani jednego lotu w dzienniku.',
    },
    upcoming: {
      label: 'Najbliższe terminy',
      rows: upcomingRows(wire.upcoming, (row) => {
        const p = row.pilotId == null ? null : opts.personOf(row.pilotId);
        return p == null ? NONE : p.name;
      }),
    },
  };
}
