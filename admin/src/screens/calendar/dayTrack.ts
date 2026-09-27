/**
 * Ninerdeck - panel: PASEK ZAJĘTOŚCI DOBY w szufladzie własnej rezerwacji (`.daytrack`,
 * makieta K7, issue #233).
 *
 * Oś za szufladą pokazuje tydzień, ale komórka doby nie ma godzin - a godziny są całą
 * treścią rezerwacji. Pasek jest odpowiednikiem paska maszyny na 22 w telefonie: doba
 * lotna klubu od świtu do zmroku, zajętości w tonie osi, wyłączenie z użytku w skos,
 * WŁASNY szkic zielenią - żeby wybór i jego skutek stały w jednym miejscu, zanim
 * ktokolwiek kliknie „Dalej".
 *
 * ══ REZERWACJA WYSTAJĄCA POZA OKNO ROZCIĄGA JE, WYŁĄCZENIE Z UŻYTKU - NIE ══
 * Ta sama reguła, co na osi floty w telefonie (R-F): plan ukryty jest ukrytą kolizją,
 * a maszyna w serwisie jest niedostępna także w widocznym oknie, więc przycięcie niczego
 * nie gubi. Rozciągnięcie kończy się na granicach DOBY klubu.
 *
 * Moduł czysty: to są proporcje i zdania, nie układ - dlatego ma test obok.
 */

import { relativeAge, shortName } from '@ninerdeck/format';

import type { BookingDto } from '../../api/dto';
import { cellLabel, godzina, type PersonLookup } from './bookingLabels';

export interface Span {
  startsAt: number;
  endsAt: number;
}

export type DayTrackTone = 'busy' | 'pending' | 'block' | 'mine';

export interface DayTrackSegment {
  /** Położenie i szerokość w procentach szerokości paska. */
  left: number;
  width: number;
  tone: DayTrackTone;
  title: string;
  /** Własny szkic nachodzi na cudzą zajętość - rysuje się przygaszony, cudza widać pod nim. */
  clash: boolean;
}

export interface DayTrackVm {
  segments: DayTrackSegment[];
  /** Sześć podpisów rozłożonych równo pod paskiem. */
  scale: string[];
  /** „wolne: 06:00 → 13:00 · 16:00 → 21:00"; `null` = serwer jeszcze nie odpowiedział. */
  free: string | null;
  /** Opis paska dla czytnika ekranu - obraz bez niego nie mówi nic. */
  aria: string;
}

export interface DayTrackInput {
  day: Span;
  /** Doba LOTNA z serwera (świt → zmrok albo okno domyślne). */
  window: { from: number; to: number };
  /** Zajętości TEJ maszyny w tej dobie - bez rezerwacji właśnie poprawianej. */
  busy: readonly BookingDto[];
  slot: Span | null;
  /** Wolne pasma liczone przez domenę na serwerze; `null` = jeszcze nie przyszły. */
  free: readonly { startsAt: string; endsAt: string }[] | null;
  tz: string;
  person: PersonLookup;
}

const hhmm = (at: number, tz: string): string => godzina(new Date(at), tz);
const hours = (s: Span, tz: string): string => `${hhmm(s.startsAt, tz)} → ${hhmm(s.endsAt, tz)}`;
const QUARTER = 15 * 60_000;

const overlaps = (a: Span, b: Span): boolean => a.startsAt < b.endsAt && a.endsAt > b.startsAt;

function spanOf(b: BookingDto): Span {
  return { startsAt: Date.parse(b.startsAt), endsAt: Date.parse(b.endsAt) };
}

/** Kto albo co stoi w tym czasie - nazwisko w MIANOWNIKU za separatorem (bez odmiany). */
export function busyLabel(b: BookingDto, person: PersonLookup): string {
  if (b.kind === 'block') return cellLabel(b, person);
  const who = b.pilotId == null ? null : person(b.pilotId);
  return who == null ? 'rezerwacja' : shortName(who.name);
}

export function buildDayTrack(input: DayTrackInput): DayTrackVm {
  const { day, tz } = input;
  let from = input.window.from;
  let to = input.window.to;
  const flights = [
    ...input.busy.filter((b) => b.kind === 'flight').map(spanOf),
    ...(input.slot == null || input.slot.endsAt <= input.slot.startsAt ? [] : [input.slot]),
  ];
  for (const s of flights) {
    from = Math.max(day.startsAt, Math.min(from, s.startsAt));
    to = Math.min(day.endsAt, Math.max(to, s.endsAt));
  }
  const length = Math.max(1, to - from);

  const place = (s: Span): { left: number; width: number } | null => {
    const a = Math.max(from, s.startsAt);
    const b = Math.min(to, s.endsAt);
    if (b <= a) return null;
    return { left: ((a - from) / length) * 100, width: ((b - a) / length) * 100 };
  };

  const segments: DayTrackSegment[] = [];
  const parts: string[] = [];
  for (const b of [...input.busy].sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt))) {
    const at = place(spanOf(b));
    if (at == null) continue;
    const label = busyLabel(b, input.person);
    segments.push({
      ...at,
      tone: b.kind === 'block' ? 'block' : b.status === 'pending' ? 'pending' : 'busy',
      title: `${label} · ${hours(spanOf(b), tz)}`,
      clash: false,
    });
    parts.push(`zajęte ${hours(spanOf(b), tz)} · ${label}`);
  }

  if (input.slot != null && input.slot.endsAt > input.slot.startsAt) {
    const at = place(input.slot);
    if (at != null) {
      const clash = input.busy.some((b) => overlaps(spanOf(b), input.slot!));
      segments.push({ ...at, tone: 'mine', title: `Twój termin · ${hours(input.slot, tz)}`, clash });
      parts.push(`Twój termin ${hours(input.slot, tz)}${clash ? ' koliduje' : ''}`);
    }
  }

  const scale = Array.from({ length: 6 }, (_, i) => {
    const at = from + (length * i) / 5;
    // Skrajne podpisy są dokładne, pośrednie zaokrąglone do kwadransa - „08:29" pod
    // paskiem udawałoby precyzję, której z proporcji i tak nikt nie odczyta.
    return hhmm(i === 0 || i === 5 ? at : Math.round(at / QUARTER) * QUARTER, tz);
  });

  const free =
    input.free == null
      ? null
      : input.free.length === 0
        ? 'w tej dobie nie ma wolnego miejsca'
        : `wolne: ${input.free
            .map((f) => hours({ startsAt: Date.parse(f.startsAt), endsAt: Date.parse(f.endsAt) }, tz))
            .join(' · ')}`;

  return {
    segments,
    scale,
    free,
    aria: parts.length === 0 ? 'Maszyna wolna przez całą dobę lotną' : capital(parts.join('; ')),
  };
}

/**
 * Zdanie pod parą godzin: „2 h · SP-AXA wolna w tych godzinach" albo kolizja z tym, co
 * ekran już ma. Kolizja jest BURSZTYNOWA i nie blokuje „Dalej" - o terminie rozstrzyga
 * serwer, a pilot mógł zobaczyć coś, co ktoś właśnie odwołuje (makieta K7).
 */
export interface SlotNote {
  length: string;
  /** `null` = wolne; inaczej wyróżniony początek i kto/co stoi. */
  clash: { lead: string; who: string } | null;
  reg: string;
}

export function slotNote(
  slot: Span | null,
  busy: readonly BookingDto[],
  reg: string,
  tz: string,
  person: PersonLookup,
): SlotNote | null {
  if (slot == null || slot.endsAt <= slot.startsAt) return null;
  const length = relativeAge(slot.endsAt - slot.startsAt);
  const hit = busy.find((b) => overlaps(spanOf(b), slot));
  if (hit == null) return { length, clash: null, reg };
  return {
    length,
    reg,
    clash: {
      lead:
        hit.kind === 'block'
          ? `w tych godzinach ${reg} jest wyłączona z użytku`
          : `w tych godzinach ${reg} jest już zajęta`,
      who: `${busyLabel(hit, person)} ${hours(spanOf(hit), tz)}`,
    },
  };
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
