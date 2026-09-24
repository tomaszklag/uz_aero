/**
 * Ninerdeck - panel: PODGLĄD PILOTA I SAMOLOTU przy decyzji (3.1.0, issue #206;
 * makieta `design/panel/kalendarz-podglad.html`, K6 i K6a).
 *
 * Czysta logika szuflady: z odpowiedzi serwera (ten sam komplet, który dostaje
 * telefon) składa nagłówek, karty wierszy „etykieta → wartość", tabelę ostatnich lotów
 * i listę najbliższych terminów. Liczb NIE liczy - to robi serwer, raz, dla obu
 * powierzchni. Tu są wyłącznie napisy.
 *
 * ══ NAPISY MÓWIĄ SŁOWNIKIEM KALENDARZA ══
 * Chwile OPERACJI (ostatnie loty, ostatni lot, odczyt) idą datą rejestru - UTC, jak
 * dziennik; TERMINY idą dobą klubu, jak reszta kalendarza (§6). Dwa zegary na jednej
 * szufladzie są świadome: operacja jest pomiarem, rezerwacja umową o godzinie.
 */

import { dateUtcDayMonth, duration, plural } from '@ninerdeck/format';

import type {
  AircraftPreviewDto,
  PilotPreviewDto,
  PreviewRecentDto,
  PreviewUpcomingDto,
} from '../../api/dto';
import { litres, motoHours, NONE, oilLitres } from '../common/values';
import {
  blockReasonLabel,
  clubDayIndex,
  godzina,
  operationLabel,
  stempel,
  type PersonLookup,
} from './bookingLabels';

/** Wiersz „etykieta → wartość" - ten sam kształt, co na karcie kolejki. */
export interface KvRow {
  label: string;
  value: string;
  mono?: boolean;
  sub?: string;
  subMono?: boolean;
  tone?: 'amber';
}

/** Co otwiera szuflada: pilot ze sprawy albo maszyna sprawy. */
export type PreviewTarget =
  | { kind: 'pilot'; bookingId: string; pilotId: string; label: string }
  | { kind: 'aircraft'; bookingId: string; label: string };

export interface PreviewHeading {
  title: string;
  sub: string;
}

export interface PreviewCard {
  title: string;
  rows: KvRow[];
}

export interface RecentTableRow {
  key: string;
  when: string;
  /** Znak maszyny (podgląd pilota) albo nazwisko (podgląd samolotu). */
  who: string;
  whoMono: boolean;
  task: string;
  block: string;
}

export interface RecentTable {
  title: string;
  whoHeader: string;
  rows: RecentTableRow[];
  /** Zdanie zamiast pustej tabeli. */
  empty: string;
}

export interface PreviewView {
  heading: PreviewHeading;
  cards: PreviewCard[];
  recent: RecentTable;
  upcoming: PreviewCard;
}

export interface PreviewOptions {
  person: PersonLookup;
  reg: (aircraftId: string) => string;
  now: number;
}

const fmtDay = (tz: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: tz || undefined });

const fmtDayYear = (tz: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: tz || undefined,
  });

/** „dziś", „wczoraj", „6 dni temu" - po DOBIE klubu, jak „Czeka od" w kolejce. */
export function daysAgoLabel(at: number, now: number, tz: string): string {
  const diff = clubDayIndex(now, tz) - clubDayIndex(at, tz);
  if (diff <= 0) return 'dziś';
  if (diff === 1) return 'wczoraj';
  return `${diff} ${plural(diff, 'dzień', 'dni', 'dni')} temu`;
}

const flightsLabel = (n: number): string => `${n} ${plural(n, 'lot', 'loty', 'lotów')}`;

/** „26 wrz 09:00-12:00" w jednej dobie klubu; przez kilka dób - „29 wrz 08:00 - 2 paź 18:00". */
export function termLabel(startsAt: number, endsAt: number, tz: string): string {
  const od = new Date(startsAt);
  const doo = new Date(endsAt);
  if (clubDayIndex(startsAt, tz) === clubDayIndex(endsAt, tz)) {
    return `${fmtDay(tz).format(od)} ${godzina(od, tz)}-${godzina(doo, tz)}`;
  }
  return `${stempel(od, tz)} - ${stempel(doo, tz)}`;
}

const SOURCE: Readonly<Record<NonNullable<AircraftPreviewDto['counters']>['source'], string>> = {
  handover: 'zdanie samolotu',
  open_session: 'operacja w toku',
  initial: 'stan początkowy z panelu',
  admin: 'wpis administratora',
};

function recentRows(
  rows: readonly PreviewRecentDto[],
  who: (row: PreviewRecentDto) => { value: string; mono: boolean },
): RecentTableRow[] {
  return rows.map((row) => {
    const w = who(row);
    return {
      key: row.sessionUuid,
      when: row.at == null ? NONE : dateUtcDayMonth(Date.parse(row.at)),
      who: w.value,
      whoMono: w.mono,
      task: operationLabel(row.operation),
      block: duration(row.blockMs),
    };
  });
}

function upcomingRows(
  rows: readonly PreviewUpcomingDto[],
  tz: string,
  value: (row: PreviewUpcomingDto) => string,
): KvRow[] {
  return rows.map((row) => {
    const label = termLabel(Date.parse(row.startsAt), Date.parse(row.endsAt), tz);
    if (row.kind === 'block') {
      return {
        label,
        value: 'Wyłączona z użytku',
        sub: `· ${blockReasonLabel(row.blockReason).toLowerCase()}`,
        tone: 'amber',
      };
    }
    if (row.thisCase) return { label, value: value(row), sub: '· ta sprawa' };
    if (row.overlaps) {
      return { label, value: value(row), sub: '· nachodzi na rozpatrywany termin', tone: 'amber' };
    }
    return { label, value: value(row) };
  });
}

export function pilotPreview(dto: PilotPreviewDto, opts: PreviewOptions): PreviewView {
  const tz = dto.timezone;
  const name = dto.pilot.name ?? opts.person(dto.pilot.id)?.name ?? null;
  const code = dto.pilot.code ?? opts.person(dto.pilot.id)?.code ?? null;
  const reg = opts.reg(dto.onAircraft.aircraftId);

  const sub = [
    code ?? NONE,
    dto.pilot.memberSince == null
      ? null
      : `w klubie od ${fmtDayYear(tz).format(new Date(dto.pilot.memberSince))}`,
    dto.lastFlightAt == null
      ? 'jeszcze bez lotu'
      : `ostatni lot ${daysAgoLabel(Date.parse(dto.lastFlightAt), opts.now, tz)}`,
  ]
    .filter((x) => x != null)
    .join(' · ');

  const on = dto.onAircraft;
  const onRows: KvRow[] =
    on.operations === 0
      ? [{ label: 'Operacji', value: '0', sub: '· pierwszy raz na tej maszynie' }]
      : [
          {
            label: 'Operacji',
            value: String(on.operations),
            sub: on.lastAt == null ? undefined : `· ostatnia ${daysAgoLabel(Date.parse(on.lastAt), opts.now, tz)}`,
          },
          {
            label: 'Nalot na tym egzemplarzu',
            value: duration(on.blockMs),
            mono: true,
            sub: `· ${flightsLabel(on.flights)}`,
          },
        ];

  const f = dto.flying;
  const window = (label: string, w: PilotPreviewDto['flying']['last30']): KvRow => ({
    label,
    value: `${flightsLabel(w.flights)} · ${duration(w.blockMs)} blok · ${duration(w.flightMs)} w powietrzu`,
  });

  return {
    heading: { title: name ?? code ?? NONE, sub },
    cards: [
      { title: `Na ${reg}`, rows: onRows },
      {
        title: 'Nalot',
        rows: [
          window('Ostatnie 30 dni', f.last30),
          window('Ostatnie 90 dni', f.last90),
          {
            label: 'W klubie łącznie',
            value: `${flightsLabel(f.total.flights)} · ${duration(f.total.blockMs)} blok`,
          },
        ],
      },
    ],
    recent: {
      title: 'Ostatnie loty',
      whoHeader: 'Samolot',
      rows: recentRows(dto.recent, (row) => ({ value: opts.reg(row.aircraftId), mono: true })),
      empty: 'W dzienniku klubu nie ma jeszcze ani jednego lotu tej osoby.',
    },
    upcoming: {
      title: 'Najbliższe rezerwacje',
      rows: upcomingRows(dto.upcoming, tz, (row) => opts.reg(row.aircraftId)),
    },
  };
}

export function aircraftPreview(dto: AircraftPreviewDto, opts: PreviewOptions): PreviewView {
  const tz = dto.timezone;
  const a = dto.aircraft;
  const c = dto.counters;

  const sub = [
    a.type,
    a.serviceStatus === 'active' ? 'w użytku' : 'wyłączona z użytku',
    dto.lastFlightAt == null ? 'jeszcze bez lotu' : `ostatni lot ${dateUtcDayMonth(Date.parse(dto.lastFlightAt))}`,
  ].join(' · ');

  const signer = c == null ? null : (c.byPilotId ?? c.enteredBy);
  const signerName = signer == null ? null : (opts.person(signer)?.name ?? null);
  const counters: KvRow[] = [
    { label: 'Motogodziny', value: motoHours(c?.mh ?? null, a.mhFormat), mono: true },
    { label: 'Paliwo', value: litres(c?.fuelL ?? null), sub: `· zbiornik ${litres(a.capacityL)}` },
    {
      label: 'Olej',
      value: oilLitres(c?.oilL ?? null),
      sub: a.oilMinL == null ? undefined : `· minimum ${oilLitres(a.oilMinL)}`,
    },
    {
      label: 'Odczyt z',
      value: c == null ? NONE : stempel(new Date(c.at), tz),
      sub: c == null ? undefined : `· ${[SOURCE[c.source], signerName].filter((x) => x != null).join(', ')}`,
    },
  ];

  const l = dto.last30;
  return {
    heading: { title: a.reg, sub },
    cards: [
      { title: 'Liczniki', rows: counters },
      {
        title: 'Ostatnie 30 dni',
        rows: [
          { label: 'Dni z lotami', value: String(l.daysWithFlights) },
          { label: 'Starty', value: String(l.takeoffs) },
          {
            label: 'Silnik',
            value: duration(l.blockMs),
            mono: true,
            sub: `· w powietrzu ${duration(l.flightMs)}`,
          },
        ],
      },
    ],
    recent: {
      title: 'Ostatnie loty',
      whoHeader: 'Pilot',
      rows: recentRows(dto.recent, (row) => {
        const p = opts.person(row.pilotId);
        return { value: p == null ? NONE : p.name, mono: false };
      }),
      empty: 'Ta maszyna nie ma jeszcze ani jednego lotu w dzienniku.',
    },
    upcoming: {
      title: 'Najbliższe terminy',
      rows: upcomingRows(dto.upcoming, tz, (row) => {
        const p = row.pilotId == null ? null : opts.person(row.pilotId);
        return p == null ? NONE : p.name;
      }),
    },
  };
}

