/**
 * Ninerdeck - KARTA ZLECENIA OCZAMI PROWADZĄCEGO (4.0.0, epik Z-C #247; makiety 32, 32A,
 * 32B, 32D; `docs/zlecenia.md` §4.3, §5, §8, §13.1).
 *
 * Prowadzi autor i każdy z „Cudzymi rezerwacjami" (pkt 20). Karta odpowiada na trzy
 * pytania prowadzącego, w tej kolejności:
 *  - KTO JUŻ LECI - karta „Załoga" z fotelami obsadzonymi (przyjęte albo przydział, z godziną
 *    z historii) i szukanymi („przydziel z listy niżej"). Stoi, gdy w którymś fotelu ktoś
 *    siedzi; przy obu fotelach szukanych powtarzałaby tylko bloki pod spodem (32);
 *  - KOGO ZAPYTANO I CO ODPOWIEDZIAŁ - blok na każdy szukany wolny fotel (imiennie albo
 *    grupą) albo jeden blok wspólnej listy (32A). Kolejność wierszy: najpierw ci, którzy
 *    MOGĄ (w kolejności zgłoszenia), potem odczytane bez odpowiedzi, nieodczytane, na
 *    końcu odmowy - prowadzący czyta od góry to, co może zrobić;
 *  - CO SIĘ DZIAŁO - historia zmian z nazwiskami (`orderHistory.ts`).
 * Adresaci fotela już obsadzonego (i całe zlecenie z kompletem - 32B) schodzą do zwiniętego
 * „Pozostali adresaci · N · zlecenie nieaktualne": to stan zlecenia z ICH strony.
 *
 * ══ OSOBA PRZY OBU FOTELACH (pkt 38) ══
 * Adresat z terminem do potwierdzenia stoi w bloku KAŻDEGO wolnego fotela, na który może
 * trafić, z własnym „WYBIERZ" i dopiskiem „także na …"; wybór na jeden fotel zdejmuje go
 * z drugiego (serwer obsadza fotel, a następny odczyt karty ułoży bloki od nowa).
 *
 * ══ ZAMKNIĘTE ZLECENIE JEST ZAPISEM (32, ramka 2) ══
 * Odwołane albo wygasłe: bloki zostają z odpowiedziami z chwili zamknięcia, ale bez
 * „WYBIERZ", bez menu ⋯, bez liczników i bez bursztynu - to są podpowiedzi do działania,
 * a działać nie ma już czym. Zostaje „Powiel" w nagłówku.
 */

import { plural } from '@ninerdeck/format';

import type { RemoteOrderCard, RemoteOrderRecipient, RemoteSeat } from '../../../application';

import { routeDetailRow } from './bookingDetails';
import type { ClubDayBounds } from './clubClock';
import { operationLabelOf } from './operations';
import { orderHistoryRows, type HistoryRowVm } from './orderHistory';
import {
  instant,
  LONG,
  momentLabel,
  NONE,
  orderCountdown,
  orderDate,
  orderDay,
  orderHours,
  orderLength,
  orderSpan,
  personLabel,
  planLine,
  seatAccusative,
  seatLabel,
  seekingLabel,
  SHORT,
} from './orderFormat';
import type { BadgeTone, DetailRowVm } from './orderRecipientCard';

export interface StatusPart {
  text: string;
  tone?: 'ok' | 'no' | 'unread';
}

export interface LeaderRowVm {
  pilotId: string;
  name: string;
  code: string | null;
  status: StatusPart[];
  /** „zmiana z 07:10 nieodczytana" - otworzył kartę przed ostatnią edycją (§8). */
  warn: string | null;
  /** Powód odmowy jako cytat. */
  reason: string | null;
  /** „także na drugiego pilota" - termin do potwierdzenia (pkt 38). */
  also: string | null;
  /** „W tym czasie: SP-AXA 10:00-12:00" - inna rezerwacja tej osoby (§4.3). */
  conflict: string | null;
  /** Ikona rozmowy: `write` - autor pisze, `read` - koordynator czyta (pkt 19, 20). */
  thread: 'write' | 'read' | null;
  unread: boolean;
  /** Przydział spośród zgłoszonych: „WYBIERZ" albo „NA DOWÓDCĘ" / „NA DRUGIEGO PILOTA". */
  picks: { seat: RemoteSeat; label: string }[];
  /** Menu ⋯ (32D) - wyłącznie w zleceniu żywym. */
  menu: boolean;
}

export interface SeatBlockVm {
  key: 'pic' | 'dual' | 'shared';
  /** „Dowódca", „Drugi pilot", „Wspólna lista". */
  title: string;
  /** „imiennie", „Piloci An-2". */
  sub: string | null;
  /** „2 mogą lecieć"; `null` = zero albo zlecenie zamknięte. */
  count: string | null;
  rows: LeaderRowVm[];
}

export interface CrewSeatVm {
  seat: RemoteSeat;
  label: string;
  pilotId: string | null;
  /** Osoba w fotelu; `null` = szukany. */
  name: string | null;
  code: string | null;
  status: StatusPart[];
  /** Menu ⋯ z „COFNIJ PRZYDZIAŁ" - przy osobie przydzielonej do szukanego fotela. */
  menu: boolean;
  /** Rozmowa z osobą w fotelu - jak przy adresacie: autor pisze, koordynator czyta. */
  thread: 'write' | 'read' | null;
  unread: boolean;
}

export interface LeaderCardVm {
  hero: {
    /**
     * Ton karty terminu: błękit, dopóki zlecenie szuka; zieleń przy komplecie - zlecenie
     * JEST wtedy zwykłą rezerwacją tej załogi (32B); neutralny w zapisie zamkniętym.
     */
    tone: 'blue' | 'green' | 'off';
    date: string;
    badge: { text: string; tone: BadgeTone };
    hours: string;
    length: string;
    /** „SP-ANA · AN-2". */
    aircraft: string;
    countdown: string | null;
  };
  /** Odwołane albo wygasłe - karta jest zapisem. */
  closed: boolean;
  crew: CrewSeatVm[] | null;
  blocks: SeatBlockVm[];
  others: { count: number; rows: LeaderRowVm[] } | null;
  details: DetailRowVm[];
  history: HistoryRowVm[];
  actions: { edit: boolean; resend: boolean; cancel: boolean };
  /** „Powiel" w nagłówku - ta sama treść z pustym terminem; wyłącznie z prawem zlecania. */
  duplicate: boolean;
}

export interface LeaderCardInput {
  card: RemoteOrderCard;
  now: number;
  pilotId: string;
  /** Prawo zlecania (`canCreate` z `GET /orders/summary`) - „Powiel" tworzy nowe zlecenie. */
  canCreate: boolean;
  nameOf: (pilotId: string) => string | null;
  codeOf: (pilotId: string) => string | null;
  aircraft: { reg: string; type: string | null } | null;
  airfieldName: (icao: string) => string | null;
  regOf: (aircraftId: string) => string | null;
}

const SEATS: readonly RemoteSeat[] = ['pic', 'dual'];
const other = (seat: RemoteSeat): RemoteSeat => (seat === 'pic' ? 'dual' : 'pic');

export function leaderCardVm(input: LeaderCardInput): LeaderCardVm | null {
  const { card } = input;
  const day = orderDay(card.day);
  const startsAt = instant(card.booking.startsAt);
  const endsAt = instant(card.booking.endsAt);
  if (day == null || startsAt == null || endsAt == null) return null;

  const status = card.order.status;
  const live = status === 'open' || status === 'filled';
  const crew: Record<RemoteSeat, string | null> = { pic: card.booking.pilotId, dual: card.booking.dualId };
  const sought = (seat: RemoteSeat): boolean => card.order.seats[seat] === 'sought';
  const open = SEATS.filter((seat) => sought(seat) && crew[seat] == null);
  const seated = new Set([crew.pic, crew.dual].filter((id): id is string => id != null));
  const recipients = (card.recipients ?? []).filter((r) => !r.removed && !seated.has(r.pilotId));
  const ctx: RowContext = { input, day, live, open, crew };

  const blocks = card.order.addressing === 'shared' ? sharedBlocks(recipients, ctx) : perSeatBlocks(recipients, ctx);
  const inBlocks = new Set(blocks.flatMap((b) => b.rows.map((r) => r.pilotId)));
  const leftover = recipients.filter((r) => !inBlocks.has(r.pilotId));
  const badge = badgeOf(status, open);

  return {
    hero: {
      tone: !live ? 'off' : badge.tone === 'green' ? 'green' : 'blue',
      date: orderDate(day),
      badge,
      hours: orderHours(startsAt, endsAt, day),
      length: orderLength(startsAt, endsAt),
      aircraft: [input.aircraft?.reg ?? input.regOf(card.booking.aircraftId) ?? NONE, input.aircraft?.type ?? null]
        .filter((p): p is string => p != null)
        .join(' · '),
      countdown: live ? orderCountdown(startsAt, endsAt, input.now) : null,
    },
    closed: !live,
    crew: seated.size === 0 ? null : crewSeats(ctx, card),
    blocks,
    others:
      leftover.length === 0
        ? null
        : { count: leftover.length, rows: sortRows(leftover).map((r) => rowOf(r, ctx, null, true)) },
    details: detailRows(card, day, input),
    history: card.history == null ? [] : orderHistoryRows({ history: card.history, day, now: input.now, pilotId: input.pilotId, nameOf: input.nameOf, regOf: input.regOf }),
    actions: { edit: live, resend: status === 'open', cancel: live },
    duplicate: input.canCreate,
  };
}

function badgeOf(status: RemoteOrderCard['order']['status'], open: readonly RemoteSeat[]): LeaderCardVm['hero']['badge'] {
  if (status === 'cancelled') return { text: 'Odwołane', tone: 'dim' };
  if (status === 'expired') return { text: 'Wygasło', tone: 'dim' };
  if (status === 'filled' || open.length === 0) return { text: 'Komplet załogi', tone: 'green' };
  return { text: seekingLabel(open) ?? 'Szuka załogi', tone: 'blue' };
}

interface RowContext {
  input: LeaderCardInput;
  day: ClubDayBounds;
  live: boolean;
  open: readonly RemoteSeat[];
  crew: Record<RemoteSeat, string | null>;
}

/**
 * Etykieta adresowania z serwera („dowódca: Jakub Wrona · drugi pilot: Piloci An-2",
 * „wspólna lista: Piloci An-2") pocięta na fotele - nazwy grup zna wyłącznie ona.
 * Czyta ją też arkusz adresata (32D), żeby powiedzieć, przez co osoba dostała zlecenie.
 */
export function audienceOf(label: string | undefined): { pic: string | null; dual: string | null; shared: string | null } {
  const out = { pic: null as string | null, dual: null as string | null, shared: null as string | null };
  for (const segment of (label ?? '').split(' · ')) {
    const at = segment.indexOf(': ');
    if (at < 0) continue;
    const head = segment.slice(0, at);
    const value = segment.slice(at + 2).trim();
    if (value === '') continue;
    if (head === 'dowódca') out.pic = value;
    else if (head === 'drugi pilot') out.dual = value;
    else if (head === 'wspólna lista') out.shared = value;
  }
  return out;
}

/** Kolejność: mogą (wg zgłoszenia) → odczytane → nieodczytane → odmowy. */
function sortRows(rows: readonly RemoteOrderRecipient[]): RemoteOrderRecipient[] {
  const rank = (r: RemoteOrderRecipient): number => (r.answer === 'yes' ? 0 : r.answer === 'no' ? 3 : r.seen ? 1 : 2);
  const at = (r: RemoteOrderRecipient): number => instant(r.answeredAt) ?? 0;
  return rows
    .map((r, index) => ({ r, index }))
    .sort((a, b) => rank(a.r) - rank(b.r) || (rank(a.r) === 0 ? at(a.r) - at(b.r) : 0) || a.index - b.index)
    .map((x) => x.r);
}

/** „2 mogą lecieć" - liczba, na którą prowadzący czeka; zero i zlecenie zamknięte milczą. */
function volunteers(rows: readonly RemoteOrderRecipient[], live: boolean): string | null {
  if (!live) return null;
  const n = rows.filter((r) => r.answer === 'yes').length;
  return n === 0 ? null : `${n} ${plural(n, 'może', 'mogą', 'może')} lecieć`;
}

function perSeatBlocks(recipients: readonly RemoteOrderRecipient[], ctx: RowContext): SeatBlockVm[] {
  const audience = audienceOf(ctx.input.card.order.audienceLabel);
  const blocks: SeatBlockVm[] = [];
  for (const seat of ctx.open) {
    const own = recipients.filter((r) => r.seat === seat || r.seat == null);
    const named = own.filter((r) => (r.seat === seat && r.viaGroupId == null) || r.namedSeat === seat);
    const grouped = own.filter((r) => r.seat === seat && r.viaGroupId != null);
    const confirm = own.filter((r) => r.seat == null && r.namedSeat !== seat);
    const sub = grouped.length === 0 && confirm.length === 0 && named.length === 1 ? 'imiennie' : audience[seat];
    const rows = sortRows(own).map((r) => rowOf(r, ctx, seat, false));
    blocks.push({ key: seat, title: seatLabel(seat), sub, count: volunteers(own, ctx.live), rows });
  }
  // Zlecenie zamknięte bez wolnego fotela nie ma bloków - jego adresaci schodzą do zwinięcia.
  return blocks;
}

function sharedBlocks(recipients: readonly RemoteOrderRecipient[], ctx: RowContext): SeatBlockVm[] {
  if (ctx.open.length === 0) return [];
  const rows = sortRows(recipients).map((r) => rowOf(r, ctx, null, false));
  return [
    {
      key: 'shared',
      title: 'Wspólna lista',
      sub: audienceOf(ctx.input.card.order.audienceLabel).shared,
      count: volunteers(recipients, ctx.live),
      rows,
    },
  ];
}

/**
 * Wiersz adresata. `blockSeat` - fotel bloku per fotel (`null` = wspólna lista albo
 * zwinięcie); `muted` - zwinięcie „Pozostali adresaci": bez tonów, akcji i bursztynu.
 */
function rowOf(r: RemoteOrderRecipient, ctx: RowContext, blockSeat: RemoteSeat | null, muted: boolean): LeaderRowVm {
  const { input, day, live } = ctx;
  const active = live && !muted;
  const when = (iso: string | null): string => {
    const at = instant(iso);
    return at == null ? '' : momentLabel(at, day, input.now, SHORT);
  };
  const tone = (t: StatusPart['tone']): StatusPart['tone'] => (muted ? undefined : t);

  let status: StatusPart[];
  if (r.answer === 'yes') status = [{ text: `Może lecieć · ${when(r.answeredAt)}`, tone: tone('ok') }];
  else if (r.answer === 'no') status = [{ text: `Nie może · ${when(r.answeredAt)}`, tone: tone('no') }];
  else if (r.seen) {
    // Przy fotelu imiennym brak odpowiedzi jest informacją sam w sobie - to moment, w którym
    // prowadzący pisze albo zamienia osobę (32D).
    const quiet = r.direct && r.seat != null ? ' · bez odpowiedzi' : '';
    status = [{ text: `Odczytane ${when(r.seenAt)}${quiet}` }];
  } else status = [{ text: 'Nieodczytane', tone: tone('unread') }];

  const edited = instant(input.card.order.editedAt);
  const conflict = r.conflict == null ? null : conflictOf(r.conflict, ctx);
  const author = input.card.order.createdBy === input.pilotId;

  const picks: LeaderRowVm['picks'] = [];
  if (active && input.card.order.status === 'open' && r.answer === 'yes') {
    if (blockSeat != null) picks.push({ seat: blockSeat, label: 'WYBIERZ' });
    else for (const seat of ctx.open) picks.push({ seat, label: `NA ${seatAccusative(seat).toUpperCase()}` });
  }

  const alsoSeat = blockSeat == null || r.seat != null ? null : other(blockSeat);
  return {
    pilotId: r.pilotId,
    name: personLabel(r.pilotId, input.pilotId, input.nameOf),
    code: input.codeOf(r.pilotId),
    status,
    warn: active && r.editUnseen && edited != null ? `zmiana z ${momentLabel(edited, day, input.now, SHORT)} nieodczytana` : null,
    reason: r.answer === 'no' ? r.answerReason : null,
    also: alsoSeat != null && ctx.open.includes(alsoSeat) ? `także na ${seatAccusative(alsoSeat)}` : null,
    conflict: active ? conflict : null,
    thread: author ? 'write' : r.threadId != null ? 'read' : null,
    unread: r.unread > 0,
    picks,
    menu: active,
  };
}

function conflictOf(c: NonNullable<RemoteOrderRecipient['conflict']>, ctx: RowContext): string | null {
  const startsAt = instant(c.startsAt);
  const endsAt = instant(c.endsAt);
  if (startsAt == null || endsAt == null) return null;
  return `W tym czasie: ${ctx.input.regOf(c.aircraftId) ?? NONE} ${orderSpan(startsAt, endsAt, ctx.day)}`;
}

/** Karta „Załoga": kto leci (z godziną przyjęcia albo przydziału) i który fotel jeszcze szuka. */
function crewSeats(ctx: RowContext, card: RemoteOrderCard): CrewSeatVm[] {
  const { input, day } = ctx;
  const rows: CrewSeatVm[] = [];
  for (const seat of SEATS) {
    const state = card.order.seats[seat];
    if (state === 'none') continue;
    const person = ctx.crew[seat];
    if (person == null) {
      rows.push({
        seat,
        label: seatLabel(seat),
        pilotId: null,
        name: null,
        code: null,
        // Instrukcja, nie opis stanu - to, że szuka, powiedziała już plakietka w hero.
        status: ctx.live ? [{ text: card.order.addressing === 'shared' ? 'przydziel z listy niżej' : 'wybierz z listy niżej' }] : [],
        menu: false,
        thread: null,
        unread: false,
      });
      continue;
    }
    if (state === 'self') {
      rows.push({
        seat,
        label: seatLabel(seat),
        pilotId: person,
        name: personLabel(person, input.pilotId, input.nameOf),
        code: input.codeOf(person),
        status: [{ text: 'osoba zlecająca' }],
        menu: false,
        thread: null,
        unread: false,
      });
      continue;
    }
    const entry = lastSeating(card, seat, person);
    const at = entry == null ? null : instant(entry.at);
    const verb = entry?.payload.via === 'answer' ? 'przyjęte' : 'przydział';
    // Rozmowa należy do adresata, którym ta osoba była, zanim usiadła w fotelu.
    const recipient = (card.recipients ?? []).find((r) => r.pilotId === person) ?? null;
    const author = card.order.createdBy === input.pilotId;
    rows.push({
      seat,
      label: seatLabel(seat),
      pilotId: person,
      name: personLabel(person, input.pilotId, input.nameOf),
      code: input.codeOf(person),
      status: at == null ? [{ text: 'Leci', tone: 'ok' }] : [{ text: 'Leci', tone: 'ok' }, { text: ` · ${verb} ${momentLabel(at, day, input.now, SHORT)}` }],
      menu: ctx.live,
      thread: recipient == null ? null : author ? 'write' : recipient.threadId != null ? 'read' : null,
      unread: (recipient?.unread ?? 0) > 0,
    });
  }
  return rows;
}

/** Ostatnie obsadzenie fotela tą osobą - z historii (przyjęcie albo przydział). */
function lastSeating(card: RemoteOrderCard, seat: RemoteSeat, pilotId: string): NonNullable<RemoteOrderCard['history']>[number] | null {
  const history = card.history ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i]!;
    if (entry.kind === 'assigned' && entry.payload.seat === seat && entry.payload.pilotId === pilotId) return entry;
  }
  return null;
}

/** Zlecenie bez wiersza „Samolot" - maszyna stoi w hero; „Zleca" na końcu. */
function detailRows(card: RemoteOrderCard, day: ClubDayBounds, input: LeaderCardInput): DetailRowVm[] {
  const b = card.booking;
  const rows: DetailRowVm[] = [];
  const task = operationLabelOf(b.operation);
  if (task != null) rows.push({ label: 'Zadanie', value: task, sub: null, mono: false });
  const route = routeDetailRow(b.fromIcao, b.toIcao, input.airfieldName);
  if (route != null) rows.push({ ...route, mono: true });
  const plan = planLine(b.plannedAirMin, b.plannedFuelL);
  if (plan != null) rows.push({ label: 'Plan lotu', value: plan, sub: null, mono: false });
  if (b.note != null && b.note.trim() !== '') rows.push({ label: 'Opis', value: b.note.trim(), sub: null, mono: false });

  const own = card.order.createdBy === input.pilotId;
  const created = instant(card.order.createdAt);
  const sent = created == null ? null : `wysłane ${momentLabel(created, day, input.now, LONG)}`;
  const code = own ? null : input.codeOf(card.order.createdBy);
  rows.push({
    label: 'Zleca',
    value: personLabel(card.order.createdBy, input.pilotId, input.nameOf),
    sub: [code, sent].filter((p): p is string => p != null).join(' · ') || null,
    mono: false,
  });
  return rows;
}
