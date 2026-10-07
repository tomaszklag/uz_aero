/**
 * Ninerdeck - panel: WIERSZE LISTY ZLECEŃ - „Zlecone" i „Do mnie" (makieta
 * `zlecenia-lista`, ZL1 i ZL1a; epik Z-D #248).
 *
 * ══ DWIE POŁOWY, DWA PYTANIA ══
 * „Zlecone" odpowiada prowadzącemu na „jak idzie": fotele z etykiety adresowania,
 * odczyty i zgłoszenia, stan mówiący, KOGO brakuje. „Do mnie" odpowiada adresatowi na
 * „co mam zrobić": fotel zaproponowany jemu i stan jego odpowiedzi - bez słowa o innych
 * adresatach (pkt 18). Te same reguły słów, co lista w telefonie (30), z jedną różnicą
 * kształtu: panel ma kolumny, więc fotele i odpowiedzi stoją osobno.
 *
 * ══ NADCHODZĄCE I MINIONE ══
 * Nadchodzące = termin jeszcze się nie skończył; kolejność terminem, najbliższe na górze,
 * bo to one najszybciej wygasną bez załogi (§5.5). Zlecenia zakończone PRZED terminem
 * (odwołane, wygasłe, a u adresata nieaktualne) zostają do swojego terminu na końcu
 * listy, przygaszone - drugi koordynator ma zobaczyć, że były i dlaczego ich nie ma.
 * Minione = termin za nami, najnowsze pierwsze; serwer oddaje ostatnie 14 dni (pkt 55).
 *
 * ══ ZDANIA BEZ FORMY Z PŁCIĄ ══
 * „Może lecieć", „Nie może", „Odczytane", „Zgłoszone" - czasownik w trzeciej osobie
 * albo forma nijaka, nigdy „przyjął" czy „chętna".
 *
 * Moduł czysty - test obok.
 */

import { plural, shortName } from '@ninerdeck/format';

import type { OrderListItemDto, OrderMeDto, OrderStatusDto, SeatDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';
import { operationLabel } from '../calendar/bookingLabels';
import { NONE } from '../common/values';
import {
  audienceBySeat,
  momentLabel,
  NO_SEAT,
  quoted,
  routeLabel,
  SEAT_LABEL,
  seekingLabel,
  termDayLabel,
  termHoursLabel,
  termRelative,
} from './orderLabels';
import type { OrderLookups } from './orderLookups';
import { orderPath, type OrderPeriod } from './orderPaths';

export interface OrderRowContext {
  lookups: OrderLookups;
  /** Zalogowany - przy własnych zleceniach „Ty" zamiast nazwiska. */
  viewerId: string | null;
  now: number;
  timezone: string;
}

/** Wspólna część wiersza obu połów. */
export interface OrderRowBase {
  key: string;
  /** Zakończone przed terminem - przygaszone na końcu „Nadchodzących". */
  muted: boolean;
  termDay: string;
  termHours: string;
  termRelative: string | null;
  reg: string;
  aircraftType: string | null;
  operation: string;
  route: string | null;
  /** Zleca: „Ty" przy własnych, inaczej nazwisko z kodem. */
  author: { name: string; code: string | null };
  pill: { text: string; tone: PillTone };
  /** Druga linia komórki stanu - powód odwołania, „bez kompletu załogi". */
  pillSub: string | null;
  /** Nowa wiadomość w rozmowie - ikona z kropką przed plakietką. */
  unread: boolean;
  /** Dokąd prowadzi wiersz; `null` = nigdzie (szuflada adresata przychodzi w kolejnym etapie). */
  href: string | null;
}

export interface ManagedRowVm extends OrderRowBase {
  /** Fotele z etykiety adresowania - fotel „brak" wiersza nie ma. */
  seats: { label: string; who: string }[];
  /**
   * „5 z 6 odczytało" / „Przyjęte 07:40" / „Nieodczytane"; `dim` przygasza całą komórkę,
   * `volunteers` to druga linia w zieleni („2 mogą lecieć") - czy jest z kogo wybrać.
   */
  answers: { text: string; dim: boolean; volunteers: string | null };
}

export interface InboxRowVm extends OrderRowBase {
  mySeat: string;
}

interface Placed {
  item: OrderListItemDto;
  startsAt: number;
  endsAt: number;
}

const place = (items: readonly OrderListItemDto[]): Placed[] =>
  items
    .map((item) => ({ item, startsAt: Date.parse(item.booking.startsAt), endsAt: Date.parse(item.booking.endsAt) }))
    // Wiersz bez czytelnego terminu wypada - „gdzieś na liście" kłamałby o tym, kiedy lot jest.
    .filter((p) => Number.isFinite(p.startsAt) && Number.isFinite(p.endsAt));

/**
 * Kolejność i podział jednej połowy: nadchodzące terminem (zakończone przed terminem na
 * końcu), minione od najnowszego. `muted` mówi, które wiersze stoją przygaszone.
 */
function arrange<Row extends { muted: boolean }>(
  placed: readonly Placed[],
  period: OrderPeriod,
  now: number,
  row: (p: Placed, ended: boolean) => Row,
): Row[] {
  if (period === 'past') {
    return placed
      .filter((p) => p.endsAt <= now)
      .sort((a, b) => b.startsAt - a.startsAt || a.item.order.id.localeCompare(b.item.order.id))
      .map((p) => ({ ...row(p, true), muted: false }));
  }
  const upcoming = placed
    .filter((p) => p.endsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt || a.item.order.id.localeCompare(b.item.order.id))
    .map((p) => row(p, false));
  return [...upcoming.filter((r) => !r.muted), ...upcoming.filter((r) => r.muted)];
}

function base(p: Placed, ctx: OrderRowContext): Omit<OrderRowBase, 'muted' | 'pill' | 'pillSub' | 'href'> {
  const { booking, order } = p.item;
  const plane = ctx.lookups.aircraft(booking.aircraftId);
  return {
    key: order.id,
    termDay: termDayLabel(p.startsAt, ctx.timezone),
    termHours: termHoursLabel(p.startsAt, p.endsAt, ctx.timezone),
    termRelative: termRelative(p.startsAt, ctx.now, ctx.timezone),
    reg: plane?.reg ?? NONE,
    aircraftType: plane?.type ?? null,
    operation: operationLabel(booking.operation),
    route: routeLabel(booking.fromIcao, booking.toIcao),
    author: authorOf(order.createdBy, ctx),
    unread: p.item.unread > 0,
  };
}

function authorOf(pilotId: string, ctx: OrderRowContext): { name: string; code: string | null } {
  if (pilotId === ctx.viewerId) return { name: 'Ty', code: null };
  const who = ctx.lookups.person(pilotId);
  return who == null ? { name: NONE, code: null } : { name: who.name, code: who.code };
}

/** Szukane fotele, w których jeszcze nikt nie siedzi - „kogo brakuje". */
function openSeats(item: OrderListItemDto): SeatDto[] {
  const { seats } = item.order;
  const out: SeatDto[] = [];
  if (seats.pic === 'sought' && item.booking.pilotId == null) out.push('pic');
  if (seats.dual === 'sought' && item.booking.dualId == null) out.push('dual');
  return out;
}

/** Plakietka zakończenia - wspólna dla obu połów, bo zlecenie zamknięte znaczy to samo. */
function closedPill(status: OrderStatusDto, reason: string | null): Pick<OrderRowBase, 'pill' | 'pillSub'> | null {
  if (status === 'cancelled') {
    return { pill: { text: 'Odwołane', tone: 'dim' }, pillSub: reason == null || reason.trim() === '' ? null : quoted(reason) };
  }
  if (status === 'expired') return { pill: { text: 'Wygasło', tone: 'dim' }, pillSub: 'bez kompletu załogi' };
  return null;
}

// ── „ZLECONE" ──────────────────────────────────────────────────────────────────

export function managedRows(items: readonly OrderListItemDto[], period: OrderPeriod, ctx: OrderRowContext): ManagedRowVm[] {
  return arrange(place(items), period, ctx.now, (p, ended) => managedRow(p, ended, period, ctx));
}

function managedRow(p: Placed, ended: boolean, period: OrderPeriod, ctx: OrderRowContext): ManagedRowVm {
  const { order } = p.item;
  const closed = closedPill(order.status, order.closeReason);
  const state: Pick<OrderRowBase, 'pill' | 'pillSub'> =
    closed ??
    (order.status === 'filled'
      ? { pill: { text: 'Komplet załogi', tone: ended ? 'dim' : 'green' }, pillSub: null }
      : { pill: { text: seekingLabel(openSeats(p.item)) ?? 'Szuka załogi', tone: ended ? 'dim' : 'blue' }, pillSub: null });
  return {
    ...base(p, ctx),
    ...state,
    muted: closed != null,
    // Szuflada prowadzącego nad listą - połowa i okres zostają w adresie.
    href: orderPath(order.id, 'zlecone', period),
    seats: seatLines(p.item, ctx),
    answers: answersOf(p, ctx),
  };
}

/**
 * Komórka „Fotele": w zajętym fotelu - kto w nim siedzi (także zlecający w fotelu „Ja"),
 * w szukanym - do kogo poszedł (etykieta adresowania), przy wspólnej liście - „Wspólna
 * lista". Fotel „brak" wiersza nie ma.
 */
export function seatLines(item: OrderListItemDto, ctx: OrderRowContext): { label: string; who: string }[] {
  const audience = audienceBySeat(item.order.audienceLabel, ctx.lookups.memberNames);
  const crew: Record<SeatDto, string | null> = { pic: item.booking.pilotId, dual: item.booking.dualId };
  const lines: { label: string; who: string }[] = [];
  for (const seat of ['pic', 'dual'] as const) {
    const state = item.order.seats[seat];
    if (state === 'none') continue;
    const sitting = crew[seat] ?? (state === 'self' ? item.order.createdBy : null);
    let who: string;
    if (sitting != null) {
      const person = ctx.lookups.person(sitting);
      who = person == null ? NONE : shortName(person.name);
    } else if (item.order.addressing === 'shared' || audience === 'shared') {
      who = 'Wspólna lista';
    } else {
      who = audience[seat] ?? NONE;
    }
    lines.push({ label: SEAT_LABEL[seat], who });
  }
  return lines;
}

/**
 * Komórka „Odpowiedzi" - „jak idzie", w dwóch kształtach, jak w telefonie: przy JEDNEJ
 * osobie jej stan („Przyjęte 07:40", „Nieodczytane"), przy grupie liczby („5 z 6
 * odczytało") z jedyną zieloną liczbą wiersza - ilu może lecieć. Odwołane - kreska:
 * nikt już na nic nie odpowiada. Komplet załogi z grupy - kreska: kto leci, mówią fotele.
 */
function answersOf(p: Placed, ctx: OrderRowContext): ManagedRowVm['answers'] {
  const { order, booking, progress } = p.item;
  const dash = { text: NONE, dim: false, volunteers: null };
  if (order.status === 'cancelled' || progress == null) return dash;
  const single = progress.single;
  if (single != null) {
    const at = single.answeredAt == null ? null : Date.parse(single.answeredAt);
    const when = at == null || !Number.isFinite(at) ? '' : ` ${momentLabel(at, ctx.now, ctx.timezone)}`;
    const seated = booking.pilotId === single.pilotId || booking.dualId === single.pilotId;
    if (seated) return { text: `Przyjęte${when}`, dim: false, volunteers: null };
    // Zgłoszenie jednej osoby ma kształt liczb z grupy: odczyt w pierwszej linii, w zieleni
    // to, że jest kogo wybrać - fotel obsadzi dopiero prowadzący.
    if (single.answer === 'yes') return { text: 'Odczytane', dim: false, volunteers: `może lecieć${when}` };
    if (single.answer === 'no') return { text: `Nie może${when}`, dim: false, volunteers: null };
    return single.seen ? { text: 'Odczytane', dim: false, volunteers: null } : { text: 'Nieodczytane', dim: true, volunteers: null };
  }
  if (order.status === 'filled') return dash;
  const read = `${progress.seen} z ${progress.recipients} odczytało`;
  if (order.status === 'expired' || progress.volunteers === 0) return { text: read, dim: false, volunteers: null };
  const n = progress.volunteers;
  return { text: read, dim: false, volunteers: `${n} ${plural(n, 'może', 'mogą', 'może')} lecieć` };
}

// ── „DO MNIE" ──────────────────────────────────────────────────────────────────

export function inboxRows(items: readonly OrderListItemDto[], period: OrderPeriod, ctx: OrderRowContext): InboxRowVm[] {
  return arrange(
    place(items).filter((p) => p.item.me != null),
    period,
    ctx.now,
    (p, ended) => inboxRow(p, p.item.me!, ended, ctx),
  );
}

function inboxRow(p: Placed, me: OrderMeDto, ended: boolean, ctx: OrderRowContext): InboxRowVm {
  const { booking } = p.item;
  const mine = me.inPlay && me.assignedSeat != null;
  const seat = me.assignedSeat ?? me.seat;
  return {
    ...base(p, ctx),
    ...inboxState(p.item, me, ended),
    muted: !me.inPlay,
    // Lot, który JUŻ JEST mój, jest rezerwacją - wiersz otwiera ją w kalendarzu (K2c),
    // bo karta zlecenia w stanie „przyjęte" nie istnieje (§14.3).
    href: mine ? `/kalendarz/${encodeURIComponent(booking.id)}` : null,
    mySeat: seat == null ? NO_SEAT : SEAT_LABEL[seat],
  };
}

/**
 * Stan odpowiedzi adresata - te same słowa, co w telefonie (30, decyzje 2026-10-06):
 * „Przyjęte" pisze osoba z fotela imiennego, „Przydzielone" - zgłoszony, któremu fotel
 * dał prowadzący; po „Nie mogę" zlecenie zostaje z plakietką „Nie mogę"; fotel zniesiony
 * wygląda jak obsadzony, bo adresat pyta o jedno - czy lot jest jeszcze dla niego.
 */
function inboxState(item: OrderListItemDto, me: OrderMeDto, ended: boolean): Pick<OrderRowBase, 'pill' | 'pillSub'> {
  const { order } = item;
  if (!me.inPlay) {
    const closed = closedPill(order.status, order.closeReason);
    if (closed != null) return closed;
    return { pill: { text: 'Nieaktualne', tone: 'dim' }, pillSub: me.staleReason === 'removed' ? 'Zlecenie cofnięte' : 'Fotel obsadzony' };
  }
  if (me.assignedSeat != null) {
    return {
      pill: { text: me.direct ? 'Przyjęte' : 'Przydzielone', tone: ended ? 'dim' : 'green' },
      // Po terminie lot się odbył (albo nie) - zdanie o rezerwacji mówiłoby o przyszłości.
      pillSub: ended ? null : 'lot jest Twoją rezerwacją',
    };
  }
  if (me.answer === 'yes') return { pill: { text: 'Zgłoszone', tone: 'dim' }, pillSub: null };
  if (me.answer === 'no') return { pill: { text: 'Nie mogę', tone: 'dim' }, pillSub: null };
  return { pill: { text: 'Czeka na odpowiedź', tone: ended ? 'dim' : 'blue' }, pillSub: null };
}
