/**
 * Ninerdeck - KARTA MASZYNY: napisy i grupy wierszy ekranu 27 (obserwowanie 3.2.0,
 * issue #205; `docs/obserwowanie-samolotu.md` §6, makiety `27`, `27a-c`).
 *
 * ══ EKRAN ODPOWIADA, NIE OFERUJE ══
 * Bohaterem karty jest to, co dzieje się z maszyną W TEJ CHWILI - pytanie mechanika
 * i koordynatora („mogę ją brać?", „kto ją ma?"). Jedno z siedmiu zdań (§6.3) liczy
 * SERWER (`aircraftNow`); tu jest samo brzmienie i ton. Ołówków tu nie ma: karta
 * maszyny niczego nie zmienia (issue #40) poza jednym przełącznikiem obserwowania.
 *
 * ══ STAN Z REJESTRU JEST STANEM WG OSTATNIEGO ZAPISU, KTÓRY DOTARŁ ══ (§2.3)
 * Pilot bez zasięgu dosyła zdarzenia po godzinach, więc pod herosem stoi „wg zapisów,
 * które dotarły do 09:40 UTC", a nie „teraz". Rejestr mówi prawdę o swojej dokładności.
 *
 * ══ DWA ZEGARY ══ (§6.2)
 * Chwile operacji i odczytów piszą się w UTC, jak rejestr; terminy - DOBĄ KLUBU,
 * z granic doby dołączonej do każdego terminu (odejmowanie, `Intl` ani razu).
 *
 * ══ CUDZY TERMIN NIESIE TYLKO TO, CO KALENDARZ ══ (P2)
 * Godziny, właściciel, rodzaj zajętości i powód wyłączenia; własny termin ma szewron
 * i otwiera kartę 23. Cudza operacja w historii nie otwiera niczego - jej szczegóły to
 * dziennik panelu; wiersz bez szewronu NIE jest wyszarzony (brak akcji, nie blokada).
 */

import {
  dateTimeUtcShort,
  dateUtcDayMonth,
  duration,
  litres,
  motoHours,
  plural,
  shortName,
  timeUtc,
} from '@ninerdeck/format';

import type {
  RemoteAircraftCard,
  RemoteAircraftNow,
  RemoteAircraftOperation,
  RemoteAircraftUpcoming,
  RemoteAircraftWindow,
} from '../../../application';

import { clubHhmm, clubInstant, type ClubDayBounds } from './clubClock';
import { dayBounds } from './inbox';
import { operationLabelOf } from './operations';
import { daysAgoLabel, type PreviewRow } from './previewRows';

const NONE = '—';
const DAY_MS = 86_400_000;

export type HeroTone = 'green' | 'amber' | 'blue' | 'off';

export interface HeroVm {
  tone: HeroTone;
  /** „W locie", „Wolna", „Wyłączona z użytku" - plakietka w tonie karty. */
  badge: string;
  badgeTone: 'green' | 'amber' | 'blue' | 'dim';
  /** Duży napis display: nazwisko, „Stoi w hangarze", „Przegląd". */
  main: string;
  /** Mono obok napisu: „skoki · EPBK", „od wczoraj 18:20". */
  small: string | null;
  /** Etykieta mikro i wartość: „uruchomienie" → „08:12 UTC". */
  zone: string | null;
  zoneValue: string | null;
  /** Licznik display w tonie karty: „1:42 SILNIKA", „ZA 4 DNI"; `null` = brak. */
  count: string | null;
  /** Dopisek po liczniku: „· zgodnie z rezerwacją 08-12". */
  after: string | null;
  /** Wiersz pod kreską: „wg zapisów, które dotarły do 09:40 UTC". */
  note: string;
}

export interface WatchVm {
  on: boolean;
  title: string;
  sub: string;
}

export interface UpcomingRow extends PreviewRow {
  /** Własna rezerwacja otwiera kartę 23; cudza i wyłączenie nie otwierają niczego. */
  bookingId: string | null;
}

export interface WindowSum {
  label: string;
  /** „11 dni z lotami · 38 startów" i „26:15 silnika · 21:40 lotu". */
  line1: string;
  line2: string;
}

export interface OperationRow {
  sessionUuid: string;
  /** „23 WRZ 14:02-15:58", „DZIŚ 08:12 →" (w toku). */
  hours: string;
  /** „Ty · Przelot", „w toku · A. Kowalski · Skoki". */
  who: string;
  /** „1 234:48 → 1 236:30 · 128 → 168 L · +96 L" - odczyty po obu stronach biegu. */
  readings: string;
  /** Loty · Blok · Lot - trójka stała w całym produkcie. */
  nums: [string, string, string];
  /** Własna operacja otwiera rozliczenie (10). */
  mine: boolean;
}

export interface AircraftCardVm {
  title: string;
  /** „Cessna 172 · w użytku · zbiornik 180 L". */
  sub: string;
  hero: HeroVm;
  watch: WatchVm;
  counters: PreviewRow[];
  upcoming: UpcomingRow[];
  sums: [WindowSum, WindowSum];
}

export interface AircraftCardOptions {
  now: number;
  /** Ten pilot - własny termin i własna operacja mają szewron. */
  pilotId: string;
  /** Imię i nazwisko z cache członków; `null` = poza cache'em. */
  nameOf: (pilotId: string) => string | null;
}

const SOURCE_LABEL: Readonly<Record<NonNullable<RemoteAircraftCard['counters']>['source'], string>> = {
  handover: 'zdanie samolotu',
  open_session: 'operacja w toku',
  initial: 'stan początkowy z panelu',
  admin: 'wpis administratora',
};

/** Powód wyłączenia z użytku - kod z panelu po polsku; nieznany zostaje, jak przyszedł. */
const BLOCK_LABEL: Readonly<Record<string, string>> = {
  maintenance: 'przegląd',
  defect: 'usterka',
  other: 'wyłączona',
};

export function blockReasonLabel(reason: string | null): string {
  if (reason == null || reason === '') return BLOCK_LABEL.other!;
  return BLOCK_LABEL[reason] ?? reason;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const parse = (iso: string | null | undefined): number | null => {
  if (iso == null) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
};

/** „Ty" dla patrzącego, nazwisko dla innych, kreska poza cache'em - jak na osi kalendarza. */
function person(pilotId: string | null, opts: AircraftCardOptions, short = true): string {
  if (pilotId == null) return NONE;
  if (pilotId === opts.pilotId) return 'Ty';
  const name = opts.nameOf(pilotId);
  if (name == null) return NONE;
  return short ? shortName(name) : name;
}

/**
 * „dziś 14:00", „jutro 09:00", „27 WRZ 07:30" - chwila terminu czasem klubu, do zdań
 * herosa („następny termin"). Dzisiaj/jutro po dobach klubu: „teraz" leży w dobie
 * terminu albo w dobie tuż przed nią.
 */
export function clubMomentLabel(at: number, day: ClubDayBounds | null, now: number): string {
  if (day == null) return NONE;
  // Chwila spoza doby (koniec wielodniowego wyłączenia) liczy się na dobie przesuniętej
  // o pełne dni - serwer przysyła jedną dobę na termin. Zmiana czasu w środku
  // wyłączenia da godzinę obok; to ten sam koszt, co `clubInstant`.
  const shift = Math.floor((at - day.startsAt) / DAY_MS) * DAY_MS;
  const d = shift === 0 ? day : { date: day.date, startsAt: day.startsAt + shift, endsAt: day.endsAt + shift };
  const hhmm = clubHhmm(at, d);
  if (now >= d.startsAt && now < d.endsAt) return `dziś ${hhmm}`;
  if (now >= d.startsAt - DAY_MS && now < d.startsAt) return `jutro ${hhmm}`;
  return `${dateUtcDayMonth(clubInstant(at, day))} ${hhmm}`;
}

/** „ZA 4 DNI", „ZA 3 H", „ZA 25 MIN" - odległość do chwili, w mowie licznika herosa. */
export function untilLabel(at: number, now: number): string | null {
  const ms = at - now;
  if (ms <= 0) return null;
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return `ZA ${days} ${plural(days, 'DZIEŃ', 'DNI', 'DNI')}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `ZA ${hours} H`;
  return `ZA ${Math.max(1, Math.floor(ms / 60_000))} MIN`;
}

/**
 * Doba klubu terminu z listy „najbliższych", dopasowana po identyfikatorze; hero mówi
 * o terminie z `now`, a jego dobę zna WYŁĄCZNIE wiersz listy (§6.1).
 */
function dayOf(upcoming: readonly RemoteAircraftUpcoming[], bookingId: string): ClubDayBounds | null {
  const row = upcoming.find((u) => u.id === bookingId);
  return row == null ? null : dayBounds(row.day);
}

/**
 * „zgodnie z rezerwacją 08-12" / „poza planem" - operacja w toku wobec kalendarza:
 * własna rezerwacja PILOTA operacji obejmująca chwilę uruchomienia. Ta sama para słów,
 * którą skrzynka pisze przy „Uruchomienie" (§5.3), tylko liczona z listy terminów.
 */
function planNote(
  now: Extract<RemoteAircraftNow, { kind: 'flying' | 'claimed' | 'after_flight' }>,
  upcoming: readonly RemoteAircraftUpcoming[],
): string | null {
  const since = parse(now.since);
  if (since == null) return null;
  const match = upcoming.find((u) => {
    const s = parse(u.startsAt);
    const e = parse(u.endsAt);
    return u.kind === 'flight' && u.pilotId === now.pilotId && s != null && e != null && s <= since && since < e;
  });
  if (match == null) return '· poza planem';
  const day = dayBounds(match.day);
  const s = parse(match.startsAt);
  const e = parse(match.endsAt);
  if (day == null || s == null || e == null) return '· zgodnie z rezerwacją';
  return `· zgodnie z rezerwacją ${clubHhmm(s, day).slice(0, 2)}-${clubHhmm(e, day).slice(0, 2)}`;
}

function heroOf(card: RemoteAircraftCard, opts: AircraftCardOptions): HeroVm {
  const last = parse(card.lastRecordAt);
  const recordsNote =
    last == null ? 'rejestr tej maszyny jest jeszcze pusty' : `wg zapisów, które dotarły do ${timeUtc(last)} UTC`;
  const n = card.now;

  switch (n.kind) {
    case 'retired':
      return {
        tone: 'off',
        badge: 'Wycofana',
        badgeTone: 'dim',
        main: 'Wycofana z użytku',
        small: null,
        zone: null,
        zoneValue: null,
        count: null,
        after: null,
        note: recordsNote,
      };
    case 'flying':
    case 'claimed':
    case 'after_flight': {
      const since = parse(n.since);
      const task = operationLabelOf(n.operation);
      const small = [task == null ? null : task.toLowerCase(), n.departureIcao]
        .filter((x): x is string => x != null)
        .join(' · ');
      const badge = n.kind === 'flying' ? 'W locie' : n.kind === 'claimed' ? 'Przejęta' : 'Po locie';
      const zone = n.kind === 'flying' ? 'uruchomienie' : n.kind === 'claimed' ? 'przejęcie' : 'wyłączenie';
      // „1:42 SILNIKA" - czas od uruchomienia liczony zegarem; że to stan wg ostatniego
      // zapisu, mówi wiersz pod kreską. Po locie licznik mówi, jak długo maszyna
      // czeka na zdanie.
      const count =
        since == null
          ? null
          : n.kind === 'flying'
            ? `${duration(opts.now - since)} SILNIKA`
            : n.kind === 'after_flight'
              ? `${duration(opts.now - since)} BEZ ZDANIA`
              : null;
      return {
        tone: 'green',
        badge,
        badgeTone: 'green',
        main: person(n.pilotId, opts),
        small: small === '' ? null : small,
        zone,
        zoneValue: since == null ? null : `${timeUtc(since)} UTC`,
        count,
        after: n.kind === 'flying' ? planNote(n, card.upcoming) : null,
        note: recordsNote,
      };
    }
    case 'blocked': {
      const until = parse(n.until);
      const day = dayOf(card.upcoming, n.bookingId);
      const row = card.upcoming.find((u) => u.id === n.bookingId);
      const from = parse(row?.startsAt);
      const span =
        day == null || from == null || until == null
          ? null
          : `${dateUtcDayMonth(clubInstant(from, day))} - ${dateUtcDayMonth(clubInstant(until, day))}`;
      return {
        tone: 'amber',
        badge: 'Wyłączona z użytku',
        badgeTone: 'amber',
        main: capitalize(blockReasonLabel(n.reason)),
        small: span,
        zone: 'wraca',
        zoneValue: until == null ? null : `${clubMomentLabel(until, day, opts.now)} czasu klubu`,
        count: until == null ? null : untilLabel(until, opts.now),
        after: null,
        note: recordsNote,
      };
    }
    case 'booked': {
      const day = dayOf(card.upcoming, n.bookingId);
      const s = parse(n.startsAt);
      const e = parse(n.endsAt);
      const hours = day == null || s == null || e == null ? null : `${clubHhmm(s, day)}-${clubHhmm(e, day)}`;
      return {
        tone: 'blue',
        badge: 'Zarezerwowana',
        badgeTone: 'blue',
        main: person(n.pilotId, opts),
        small: hours,
        zone: 'termin',
        zoneValue: hours == null ? null : `dziś ${hours} · czas klubu`,
        count: e == null || day == null ? null : `DO ${clubHhmm(e, day)}`,
        after: null,
        note: recordsNote,
      };
    }
    case 'free': {
      const c = card.counters;
      const readAt = c == null ? null : parse(c.at);
      const stood =
        readAt == null ? null : `od ${daysAgoLabel(readAt, opts.now)} ${timeUtc(readAt)}`;
      const next = n.next;
      const nextDay = next == null ? null : dayOf(card.upcoming, next.bookingId);
      const nextAt = next == null ? null : parse(next.startsAt);
      const nextRow = next == null ? null : card.upcoming.find((u) => u.id === next.bookingId);
      const nextEnd = parse(nextRow?.endsAt);
      const who =
        nextRow == null
          ? null
          : nextRow.kind === 'block'
            ? blockReasonLabel(nextRow.blockReason)
            : person(nextRow.pilotId, opts);
      const nextValue =
        nextAt == null || nextDay == null
          ? null
          : [
              nextEnd == null
                ? clubMomentLabel(nextAt, nextDay, opts.now)
                : `${clubMomentLabel(nextAt, nextDay, opts.now)}-${clubHhmm(nextEnd, nextDay)}`,
              who,
            ]
              .filter((x): x is string => x != null)
              .join(' · ');
      const lastSource = c == null ? null : SOURCE_LABEL[c.source];
      return {
        tone: 'off',
        badge: 'Wolna',
        badgeTone: 'dim',
        main: 'Stoi w hangarze',
        small: stood,
        zone: nextValue == null ? null : 'następny termin',
        zoneValue: nextValue,
        count: null,
        after: null,
        // Wolna nie ma zapisów w toku, więc pod kreską stoi OSTATNI zapis - to on
        // mówi, od kiedy maszyna stoi i komu wierzyć w licznikach.
        note:
          c == null || readAt == null || lastSource == null
            ? recordsNote
            : `ostatni zapis: ${lastSource}, ${daysAgoLabel(readAt, opts.now)} ${timeUtc(readAt)} UTC`,
      };
    }
  }
}

/**
 * Karta-przełącznik: włączony mówi, CO przyjdzie (pięć zdarzeń z §5), wyłączony jednym
 * słowem, co zrobi tapnięcie - podpis z listą zdarzeń przy wyłączonym przełączniku
 * opisywałby powiadomienia, których nikt nie dostaje.
 */
export function watchVm(on: boolean): WatchVm {
  return on
    ? {
        on,
        title: 'Obserwujesz',
        sub: 'Powiadomienia o tej maszynie: lot za godzinę, uruchomienie, zdanie z odczytami, odwołany termin, nieodebrana rezerwacja.',
      }
    : { on, title: 'Obserwuj', sub: 'Powiadomienia o lotach tej maszyny.' };
}

/** Wiersze liczników ZE ŹRÓDŁEM - ten sam komplet, co 26B (`aircraftPreviewVm`). */
export function counterRows(card: RemoteAircraftCard, opts: AircraftCardOptions): PreviewRow[] {
  const a = card.aircraft;
  const c = card.counters;
  const signer = c == null ? null : (c.byPilotId ?? c.enteredBy);
  const signerName = signer == null ? null : person(signer, opts);
  const readAt = c == null ? null : parse(c.at);
  return [
    { label: 'Motogodziny', value: c == null ? NONE : motoHours(c.mh, a.mhFormat), sub: null },
    { label: 'Paliwo', value: c == null ? NONE : litres(c.fuelL), sub: `· zbiornik ${litres(a.capacityL)}` },
    {
      label: 'Olej',
      value: c?.oilL == null ? NONE : `${c.oilL.toFixed(1).replace('.', ',')} L`,
      sub: a.oilMinL == null ? null : `· minimum ${a.oilMinL.toFixed(1).replace('.', ',')} L`,
    },
    {
      label: 'Odczyt z',
      value: readAt == null ? NONE : dateTimeUtcShort(readAt).toUpperCase(),
      sub:
        c == null
          ? null
          : [SOURCE_LABEL[c.source], signerName === NONE ? null : signerName]
              .filter((x): x is string => x != null)
              .join(', '),
    },
  ];
}

/**
 * „Dziś 08-12" (jedna doba) albo „29 WRZ - 02 PAŹ" (kilka dób) - etykieta terminu
 * czasem klubu; dzień końca liczy się przesunięciem doby początku, bo serwer przysyła
 * jedną dobę na termin (jak na 26B).
 */
export function upcomingLabel(row: RemoteAircraftUpcoming, now: number): string {
  const day = dayBounds(row.day);
  const s = parse(row.startsAt);
  const e = parse(row.endsAt);
  if (day == null || s == null || e == null) return NONE;
  if (e > day.endsAt) {
    return `${dateUtcDayMonth(clubInstant(s, day))} - ${dateUtcDayMonth(clubInstant(e, day))}`;
  }
  // Pełne godziny piszą się bez minut („08-12") - etykieta ma 96 px i para „08:00-12:00"
  // nie mieściła się obok nazwiska; kwadranse zostają w całości („07:30-09:30").
  const hh = (at: number): string => clubHhmm(at, day).slice(0, 2);
  const onTheHour = clubHhmm(s, day).endsWith(':00') && clubHhmm(e, day).endsWith(':00');
  const hours = onTheHour ? `${hh(s)}-${hh(e)}` : `${clubHhmm(s, day)}-${clubHhmm(e, day)}`;
  if (now >= day.startsAt && now < day.endsAt) return `Dziś ${hours}`;
  if (now >= day.startsAt - DAY_MS && now < day.startsAt) return `Jutro ${hours}`;
  // Dalszy termin: data i SAMA godzina początku („27 WRZ 07:30") - o długości mówi karta 23.
  return `${dateUtcDayMonth(clubInstant(s, day))} ${clubHhmm(s, day)}`;
}

export function upcomingRows(card: RemoteAircraftCard, opts: AircraftCardOptions): UpcomingRow[] {
  return card.upcoming.map((row) => {
    const label = upcomingLabel(row, opts.now);
    const s = parse(row.startsAt);
    const e = parse(row.endsAt);
    const live = s != null && e != null && s <= opts.now && opts.now < e;
    if (row.kind === 'block') {
      return {
        label,
        value: 'Wyłączona z użytku',
        sub: live ? `${blockReasonLabel(row.blockReason)} · trwa` : blockReasonLabel(row.blockReason),
        tone: 'amber',
        bookingId: null,
      };
    }
    const mine = row.pilotId === opts.pilotId;
    const state = live ? 'trwa' : row.status === 'pending' ? 'czeka na zgodę' : mine ? 'potwierdzona' : null;
    return {
      label,
      value: person(row.pilotId, opts, false),
      sub: state == null ? null : `· ${state}`,
      bookingId: mine ? row.id : null,
    };
  });
}

/** Sumy okien pod wykresami - te same liczby, co „Ostatnie 30 dni" na 26B, plus 90 dni. */
export function windowSum(label: string, w: RemoteAircraftWindow): WindowSum {
  return {
    label,
    line1: `${w.daysWithFlights} ${plural(w.daysWithFlights, 'dzień', 'dni', 'dni')} z lotami · ${w.takeoffs} ${plural(w.takeoffs, 'start', 'starty', 'startów')}`,
    line2: `${duration(w.blockMs)} silnika · ${duration(w.flightMs)} lotu`,
  };
}

export function aircraftCardVm(card: RemoteAircraftCard, opts: AircraftCardOptions): AircraftCardVm {
  const a = card.aircraft;
  return {
    title: a.reg,
    sub: [a.type, a.serviceStatus === 'active' ? 'w użytku' : 'wyłączona z użytku', `zbiornik ${litres(a.capacityL)}`].join(' · '),
    hero: heroOf(card, opts),
    watch: watchVm(card.watching),
    counters: counterRows(card, opts),
    upcoming: upcomingRows(card, opts),
    sums: [windowSum('30 dni', card.last30), windowSum('90 dni', card.last90)],
  };
}

/* ── historia operacji ──────────────────────────────────────────────────────── */

/** „DZIŚ 08:12", „WCZORAJ 18:20", „23 WRZ 14:02" - chwila operacji dobą UTC, jak w Historii (24). */
function opDay(at: number, now: number): string {
  const label = daysAgoLabel(at, now);
  if (label === 'dziś' || label === 'wczoraj') return label.toUpperCase();
  return dateUtcDayMonth(at);
}

/** „1 234:48 → 1 236:30 · 128 → 168 L · +96 L"; brak odczytu to kreska, nigdy zero. */
export function readingsLine(op: RemoteAircraftOperation, mhFormat: 'hhmm' | 'decimal'): string {
  const mh = (v: number | null): string => (v == null ? NONE : motoHours(v, mhFormat));
  const fuel = (v: number | null): string => (v == null ? NONE : String(Math.round(v)));
  const parts = [`${mh(op.mhStart)} → ${mh(op.mhEnd)}`, `${fuel(op.fuelStartL)} → ${fuel(op.fuelEndL)} L`];
  if (op.fuelAddedL != null && op.fuelAddedL > 0) parts.push(`+${Math.round(op.fuelAddedL)} L`);
  return parts.join(' · ');
}

export function operationRows(
  items: readonly RemoteAircraftOperation[],
  mhFormat: 'hhmm' | 'decimal',
  opts: AircraftCardOptions,
): OperationRow[] {
  return items.map((op) => {
    const at = parse(op.at);
    const open = op.status === 'active';
    // Koniec biegu = chwila operacji + blok; operacja w toku ma strzałkę w nic.
    const end = at == null || open ? null : at + op.blockMs;
    const hours =
      at == null ? NONE : open ? `${opDay(at, opts.now)} ${timeUtc(at)} →` : `${opDay(at, opts.now)} ${timeUtc(at)}-${timeUtc(end ?? at)}`;
    const task = operationLabelOf(op.operation);
    const who = [open ? 'w toku' : null, person(op.pilotId, opts), task]
      .filter((x): x is string => x != null)
      .join(' · ');
    return {
      sessionUuid: op.sessionUuid,
      hours,
      who,
      readings: readingsLine(op, mhFormat),
      nums: [String(op.flights), duration(op.blockMs), duration(op.flightMs)],
      mine: op.pilotId === opts.pilotId,
    };
  });
}

/** „218 operacji · UTC" - podpis sekcji; ile zostało za stroną - wiersz „Pokaż starsze". */
export function historyLabel(total: number): string {
  return `${total} ${plural(total, 'operacja', 'operacje', 'operacji')} · UTC`;
}
