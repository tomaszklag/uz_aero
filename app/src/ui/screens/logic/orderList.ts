/**
 * Ninerdeck - LISTA ZLECEŃ „Do mnie" i „Zlecone" (4.0.0, epik Z-C #247; makiety 30, 30A;
 * `docs/zlecenia.md` §14).
 *
 * ══ DZIEŃ NAGŁÓWKIEM, ZLECENIA ZWARTYMI WIERSZAMI (wzorzec Historii, 24) ══
 * Data pada raz, jako nagłówek grupy - z dniem tygodnia, bo tu się PLANUJE, a to, czy lot
 * wypada w sobotę, jest częścią decyzji. W dniu kolejność idzie godziną startu; nic się
 * nie przypina do góry - sprawę wyróżnia PLAKIETKA, nie pozycja (reguła skrzynki, 25).
 * „Zakończone" na końcu, najnowsze pierwsze: nieaktualne, odwołane, wygasłe i takie,
 * których termin minął - z datą w wierszu, bo ta sekcja nie ma nagłówków dni.
 *
 * ══ ADRESAT NIE WIE NIC O INNYCH ADRESATACH (pkt 18) ══
 * Wiersz „Do mnie" mówi o fotelu, który zaproponowano TOBIE, i o osobie zlecającej -
 * nigdy o tym, do kogo jeszcze poszło zlecenie ani kto dostał fotel.
 *
 * ══ POSTĘP U PROWADZĄCEGO W DWÓCH KSZTAŁTACH ══
 * Fotel z grupy - liczby („5 z 6 odczytało · 2 mogą lecieć"); jedna osoba imiennie - ta
 * osoba i jej stan („Ewa Sowa · Nieodczytane"), bo „1 z 1 odczytało" mówiłoby to samo
 * gorzej. Przy cudzym zleceniu dochodzi „zleca …", przy własnym - nie, to Ty.
 */

import { dateUtcDayMonthLong, plural, weekdayUtc } from '@ninerdeck/format';

import type { RemoteOrderBox, RemoteOrderList, RemoteOrderListItem, RemoteSeat } from '../../../application';

import type { ClubDayBounds } from './clubClock';
import { operationLabelOf } from './operations';
import {
  instant,
  NONE,
  orderDay,
  orderDayShort,
  orderHours,
  momentLabel,
  personLabel,
  routeCodes,
  seatLower,
  seekingLabel,
  SHORT,
} from './orderFormat';

const DAY_MS = 86_400_000;

/** Kawałek zdania wiersza - pogrubienie przy nazwie, zieleń i przygaszenie przy postępie. */
export interface ListPart {
  text: string;
  strong?: boolean;
  tone?: 'ok' | 'dim';
}

export type OrderTarget = { screen: 'order'; orderId: string } | { screen: 'booking'; bookingId: string };

export interface OrderRowVm {
  key: string;
  /**
   * Dokąd prowadzi wiersz. Lot, który JUŻ JEST mój (przyjęty albo przydzielony), jest
   * rezerwacją i otwiera kartę rezerwacji (23F) - karta zlecenia w stanie „przyjęte" nie
   * istnieje (§14.3).
   */
  target: OrderTarget;
  done: boolean;
  /** „09:00 → 13:00"; w „Zakończonych" z datą: „27 WRZ · 08:00 → 12:00". */
  hours: string;
  tag: { text: string; tone: 'blue' | 'green' | 'neutral' };
  /** Kropka przy ikonie rozmowy - nieprzeczytana wiadomość. */
  unread: boolean;
  aircraft: string;
  operation: string | null;
  route: string | null;
  /** Postęp prowadzonego zlecenia (mono); w „Do mnie" `null`. */
  progress: ListPart[] | null;
  /** Fotel, załoga, osoba zlecająca (krój tekstu). */
  meta: ListPart[] | null;
}

export interface OrderListVm {
  days: { key: string; label: string; rows: OrderRowVm[] }[];
  done: OrderRowVm[];
}

export interface OrderListInput {
  list: RemoteOrderList;
  box: RemoteOrderBox;
  now: number;
  pilotId: string;
  nameOf: (pilotId: string) => string | null;
  regOf: (aircraftId: string) => string | null;
}

interface Placed {
  item: RemoteOrderListItem;
  day: ClubDayBounds;
  startsAt: number;
  endsAt: number;
}

export function orderListVm(input: OrderListInput): OrderListVm {
  const placed: Placed[] = [];
  for (const item of input.list.items) {
    const day = orderDay(item.day);
    const startsAt = instant(item.booking.startsAt);
    const endsAt = instant(item.booking.endsAt);
    // Wiersz bez dającego się przeczytać terminu wypada - „gdzieś na liście" kłamałby
    // o tym, kiedy lot jest (ta sama reguła, co pasek kalendarza).
    if (day == null || startsAt == null || endsAt == null) continue;
    placed.push({ item, day, startsAt, endsAt });
  }

  const active: { row: OrderRowVm; at: number; day: ClubDayBounds }[] = [];
  const done: { row: OrderRowVm; at: number }[] = [];
  for (const p of placed) {
    const row = input.box === 'inbox' ? inboxRow(p, input) : managedRow(p, input);
    if (row == null) continue;
    if (row.done) done.push({ row, at: p.startsAt });
    else active.push({ row, at: p.startsAt, day: p.day });
  }

  active.sort((a, b) => a.at - b.at || a.row.key.localeCompare(b.row.key));
  done.sort((a, b) => b.at - a.at || a.row.key.localeCompare(b.row.key));

  const days: OrderListVm['days'] = [];
  for (const entry of active) {
    const last = days[days.length - 1];
    if (last != null && last.key === entry.day.date) last.rows.push(entry.row);
    else days.push({ key: entry.day.date, label: dayLabel(entry.day, input.now), rows: [entry.row] });
  }
  return { days, done: done.map((d) => d.row) };
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** „Jutro · sobota 3 października", „Niedziela · 4 października". */
export function dayLabel(day: ClubDayBounds, now: number): string {
  const midday = (day.startsAt + day.endsAt) / 2;
  const dow = weekdayUtc(midday).toLowerCase();
  const date = dateUtcDayMonthLong(midday).toLowerCase();
  if (now >= day.startsAt && now < day.endsAt) return `Dziś · ${dow} ${date}`;
  if (now >= day.startsAt - DAY_MS && now < day.startsAt) return `Jutro · ${dow} ${date}`;
  return `${capitalize(dow)} · ${date}`;
}

function base(p: Placed, input: OrderListInput, done: boolean): Pick<OrderRowVm, 'key' | 'hours' | 'aircraft' | 'operation' | 'route' | 'unread'> {
  const b = p.item.booking;
  const hours = orderHours(p.startsAt, p.endsAt, p.day);
  return {
    key: p.item.order.id,
    hours: done ? `${orderDayShort(p.day, p.startsAt)} · ${hours}` : hours,
    aircraft: input.regOf(b.aircraftId) ?? NONE,
    operation: operationLabelOf(b.operation),
    route: routeCodes(b.fromIcao, b.toIcao),
    unread: p.item.unread > 0,
  };
}

const author = (p: Placed, input: OrderListInput): ListPart => ({
  text: `zleca ${personLabel(p.item.order.createdBy, input.pilotId, input.nameOf)}`,
});

const joined = (...groups: (ListPart[] | null)[]): ListPart[] | null => {
  const out: ListPart[] = [];
  for (const group of groups) {
    if (group == null || group.length === 0) continue;
    if (out.length > 0) out.push({ text: ' · ' });
    out.push(...group);
  }
  return out.length === 0 ? null : out;
};

/** Wiersz „Do mnie" - zlecenie oczami adresata. */
function inboxRow(p: Placed, input: OrderListInput): OrderRowVm | null {
  const me = p.item.me;
  if (me == null) return null;
  const order = p.item.order;
  const ended = p.endsAt <= input.now;
  const done = !me.inPlay || ended;
  const mine = me.inPlay && me.assignedSeat != null;

  let tag: OrderRowVm['tag'];
  let lead: ListPart[] | null;
  if (!me.inPlay) {
    // Zlecenie przestało czekać na Ciebie - plakietka mówi stan zlecenia, a zdanie DLACZEGO,
    // bez nazwisk (pkt 18). Fotel zniesiony mówi to samo, co obsadzony (decyzja właściciela
    // 2026-10-06): adresat pyta o jedno - czy lot jest jeszcze dla niego.
    if (me.staleReason === 'closed' || order.status === 'cancelled' || order.status === 'expired') {
      tag = { text: order.status === 'expired' ? 'Wygasło' : 'Odwołane', tone: 'neutral' };
      lead = order.status === 'expired' ? [{ text: 'Bez kompletu załogi' }] : null;
    } else {
      tag = { text: 'Nieaktualne', tone: 'neutral' };
      lead = [{ text: me.staleReason === 'removed' ? 'Zlecenie cofnięte' : 'Fotel obsadzony' }];
    }
  } else {
    if (mine) {
      // „Przyjęte" pisze osoba z fotela imiennego, która sama tapnęła PRZYJMUJĘ;
      // „Przydzielone" - zgłoszony z grupy albo listy, któremu fotel dał prowadzący
      // (decyzja właściciela 2026-10-06; ten sam słownik, co historia zmian).
      tag = { text: me.direct ? 'Przyjęte' : 'Przydzielone', tone: done ? 'neutral' : 'green' };
    } else if (me.answer === 'yes') {
      tag = { text: 'Zgłoszone', tone: 'neutral' };
    } else if (me.answer === 'no') {
      // Odmowa zostaje na liście (decyzja właściciela 2026-10-06): zlecenie dalej żyje,
      // a karta pozwala zmienić zdanie.
      tag = { text: 'Nie mogę', tone: 'neutral' };
    } else {
      tag = { text: 'Czeka na odpowiedź', tone: done ? 'neutral' : 'blue' };
    }
    const seat: RemoteSeat | null = me.assignedSeat ?? me.seat;
    lead = seat == null ? [{ text: 'Termin do potwierdzenia' }] : [{ text: 'Fotel: ' }, { text: seatLower(seat), strong: true }];
  }

  return {
    ...base(p, input, done),
    target: mine ? { screen: 'booking', bookingId: p.item.booking.id } : { screen: 'order', orderId: order.id },
    done,
    tag,
    progress: null,
    meta: joined(lead, [author(p, input)]),
  };
}

/** Fotele szukane, w których jeszcze nikt nie siedzi. */
function openSeats(p: Placed): RemoteSeat[] {
  const { seats } = p.item.order;
  const b = p.item.booking;
  const out: RemoteSeat[] = [];
  if (seats.pic === 'sought' && b.pilotId == null) out.push('pic');
  if (seats.dual === 'sought' && b.dualId == null) out.push('dual');
  return out;
}

/** Wiersz „Zlecone" - zlecenie oczami prowadzącego. */
function managedRow(p: Placed, input: OrderListInput): OrderRowVm {
  const order = p.item.order;
  const b = p.item.booking;
  const ended = p.endsAt <= input.now;
  const closed = order.status === 'cancelled' || order.status === 'expired';
  const done = closed || ended;
  const own = order.createdBy === input.pilotId;

  let tag: OrderRowVm['tag'];
  if (order.status === 'cancelled') tag = { text: 'Odwołane', tone: 'neutral' };
  else if (order.status === 'expired') tag = { text: 'Wygasło', tone: 'neutral' };
  else if (order.status === 'filled') tag = { text: 'Komplet załogi', tone: done ? 'neutral' : 'green' };
  else tag = { text: seekingLabel(openSeats(p)) ?? 'Szuka załogi', tone: done ? 'neutral' : 'blue' };

  const single = p.item.progress?.single ?? null;
  let progress: ListPart[] | null = null;
  let lead: ListPart[] | null = null;
  if (order.status === 'expired') {
    lead = [{ text: 'Bez kompletu załogi' }];
  } else if (!done && single != null) {
    progress = singleProgress(single, p, input);
  } else if (!done && order.status === 'open' && p.item.progress != null) {
    const { recipients, seen, volunteers } = p.item.progress;
    progress = [{ text: `${seen} z ${recipients} odczytało` }];
    if (volunteers > 0) {
      progress.push({ text: ' · ' }, { text: `${volunteers} ${plural(volunteers, 'może', 'mogą', 'może')} lecieć`, tone: 'ok' });
    }
  }
  if (order.status === 'filled' && (done || single == null)) {
    const crew = [b.pilotId, b.dualId].filter((id): id is string => id != null);
    if (crew.length > 0) {
      lead = [{ text: 'Załoga: ' }, { text: crew.map((id) => personLabel(id, input.pilotId, input.nameOf)).join(', '), strong: true }];
    }
  }

  return {
    ...base(p, input, done),
    target: { screen: 'order', orderId: order.id },
    done,
    tag,
    progress,
    meta: joined(lead, own ? null : [author(p, input)]),
  };
}

/** „Adam Kowalski · przyjęte 07:40", „Ewa Sowa · Nieodczytane". */
function singleProgress(
  single: NonNullable<NonNullable<RemoteOrderListItem['progress']>['single']>,
  p: Placed,
  input: OrderListInput,
): ListPart[] {
  const name = personLabel(single.pilotId, input.pilotId, input.nameOf);
  const at = instant(single.answeredAt);
  const when = at == null ? '' : ` ${momentLabel(at, p.day, input.now, SHORT)}`;
  const seated = p.item.booking.pilotId === single.pilotId || p.item.booking.dualId === single.pilotId;
  let state: ListPart;
  if (seated) state = { text: `przyjęte${when}` };
  else if (single.answer === 'yes') state = { text: `może lecieć${when}`, tone: 'ok' };
  else if (single.answer === 'no') state = { text: `nie może${when}` };
  else if (single.seen) state = { text: 'Odczytane' };
  else state = { text: 'Nieodczytane', tone: 'dim' };
  return [{ text: `${name} · ` }, state];
}
